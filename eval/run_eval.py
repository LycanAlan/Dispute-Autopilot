"""Regenerates EVERY number in the README. One command, no manual steps.

Family A is measured on real labels and a held-out temporal split.
Family B is simulated under the cost assumptions in config/costs.yaml.
The two are written to separate keys and must never be merged in reporting.
"""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from sklearn.calibration import calibration_curve
from sklearn.metrics import (
    average_precision_score, brier_score_loss, precision_recall_curve, roc_auc_score,
)

from dispute_autopilot.config import load_costs, load_features
from dispute_autopilot.economics.baselines import compare_baselines
from dispute_autopilot.economics.cost_model import to_inr
from dispute_autopilot.economics.threshold import optimal_threshold, sweep
from dispute_autopilot.features.builder import build_features
from dispute_autopilot.ingest.load import load_raw
from dispute_autopilot.ingest.split import temporal_split
from dispute_autopilot.model.calibrate import (
    apply_calibrator, fit_calibrator, save_calibrator,
)
from dispute_autopilot.model.train import save_categories, save_model, train_model

# ONE definition, in eval/__init__.py -- see below. Hand-writing
# parents[N] per file gets the depth wrong the moment a module moves.
from eval import REPORTS


def main(matured_max_day: int | None = None, sample_n: int | None = None) -> dict:
    fc, costs = load_features(), load_costs()
    REPORTS.mkdir(parents=True, exist_ok=True)

    df = load_raw(sample_n=sample_n)
    train, calib, test = temporal_split(df, matured_max_day=matured_max_day)

    # train_model returns a PAIR. The categories are half the model: LightGBM
    # splits on .cat.codes, so scoring the test slice with re-inferred
    # categories measures the model against different integers than it trained
    # on -- silently, and the PR-AUC printed below would be fiction.
    booster, categories = train_model(train)
    iso = fit_calibrator(booster, calib, categories)
    save_model(booster)
    save_categories(categories)
    save_calibrator(iso)

    y = test[fc.target].to_numpy()
    # USD -> INR once, here at the boundary. Everything downstream is rupees.
    amounts = to_inr(test["TransactionAmt"].to_numpy(dtype=float), costs)
    raw = booster.predict(build_features(test, categories=categories))
    p = apply_calibrator(iso, raw)

    sweep_df = sweep(y, p, amounts, n_steps=100)

    # TWO thresholds, deliberately. Family A describes the MODEL; family B
    # describes a POLICY under stated cost assumptions. Reporting family A's
    # precision at family B's EV-optimal threshold blends the families, which
    # the spec forbids -- and it misleads in a specific direction: evidence
    # costs Rs 75 against ~Rs 11,000 of average exposure, so expected value
    # says vault almost everything, the threshold collapses to the bottom of
    # the sweep, and precision reads ~3.7%. That number is a fact about the
    # cost assumptions, not about the classifier.
    f1 = (
        2 * sweep_df["precision"] * sweep_df["recall"]
        / (sweep_df["precision"] + sweep_df["recall"]).replace(0, np.nan)
    ).fillna(0.0)
    quality_threshold = float(sweep_df.loc[f1.idxmax(), "threshold"])
    at = sweep_df.loc[f1.idxmax()]

    threshold = optimal_threshold(sweep_df)          # family B: EV-optimal
    ev_at = sweep_df.loc[(sweep_df["threshold"] - threshold).abs().idxmin()]

    # An optimum sitting on the edge of the search range is a search artifact
    # until proven otherwise. Say so in the output rather than quietly
    # reporting the boundary as if it were an interior solution.
    ev_at_boundary = bool(
        threshold <= sweep_df["threshold"].min() + 1e-9
        or threshold >= sweep_df["threshold"].max() - 1e-9
    )

    family_a = {
        "basis": "MEASURED on real labels, held-out temporal split",
        "n_test": int(len(test)),
        "positive_rate": float(y.mean()),
        "pr_auc": float(average_precision_score(y, p)),
        # Reported alongside because calibration LOWERS average precision here
        # (0.4405 raw -> 0.4243 calibrated) and a reader deserves to see why
        # rather than wonder which number was cherry-picked. Isotonic
        # regression is a step function: it collapses ~109,000 distinct scores
        # into ~143 levels, and the resulting ties cost average precision.
        # Ranking quality is not degraded -- the metric is penalising tie
        # structure. Calibration is kept because every downstream decision is
        # an expected-value computation, and uncalibrated scores overstate
        # P(chargeback) by ~5.6x (mean 0.192 against a 0.034 base rate).
        "pr_auc_uncalibrated": float(average_precision_score(y, raw)),
        "brier_uncalibrated": float(brier_score_loss(y, raw)),
        "roc_auc": float(roc_auc_score(y, p)),
        "brier": float(brier_score_loss(y, p)),
        "operating_threshold": quality_threshold,
        "operating_threshold_basis": "maximises F1 -- chosen on model quality, "
                                     "independent of any cost assumption",
        "precision_at_threshold": float(at["precision"]),
        "recall_at_threshold": float(at["recall"]),
    }
    family_a["f1_at_threshold"] = float(
        2 * at["precision"] * at["recall"] / (at["precision"] + at["recall"])
        if (at["precision"] + at["recall"]) else 0.0
    )

    matrices = compare_baselines(test, p, threshold)   # EV-optimal, family B
    family_b = {
        "basis": "SIMULATED under config/costs.yaml assumptions",
        "assumptions": {
            "usd_to_inr": costs.usd_to_inr,
            "contest_fee_inr": costs.contest_fee_inr,
            "ops_cost_inr": costs.ops_cost_inr,
            "base_win_rate_fraud_coded": costs.base_win_rate_fraud_coded,
        },
        "ev_optimal_threshold": float(threshold),
        "ev_optimal_threshold_is_at_sweep_boundary": ev_at_boundary,
        "precision_at_ev_threshold": float(ev_at["precision"]),
        "recall_at_ev_threshold": float(ev_at["recall"]),
        "net_inr": {k: round(m.net_inr, 2) for k, m in matrices.items()},
        "confusion_counts": {
            k: {"tp": m.tp, "fp": m.fp, "tn": m.tn, "fn": m.fn}
            for k, m in matrices.items()
        },
    }
    family_b["model_uplift_vs_flag_all_inr"] = round(
        matrices["model"].net_inr - matrices["all"].net_inr, 2
    )

    # Plots
    prec, rec, _ = precision_recall_curve(y, p)
    fig, ax = plt.subplots(figsize=(5, 4))
    ax.plot(rec, prec)
    ax.axhline(y.mean(), linestyle="--", label=f"base rate {y.mean():.4f}")
    ax.set_xlabel("recall"); ax.set_ylabel("precision")
    ax.set_title(f"PR curve (PR-AUC = {family_a['pr_auc']:.4f})"); ax.legend()
    fig.savefig(REPORTS / "pr_curve.png", dpi=120, bbox_inches="tight")

    frac_pos, mean_pred = calibration_curve(y, p, n_bins=10, strategy="quantile")
    fig, ax = plt.subplots(figsize=(5, 4))
    ax.plot(mean_pred, frac_pos, marker="o")
    ax.plot([0, 1], [0, 1], linestyle="--")
    ax.set_xlabel("predicted"); ax.set_ylabel("observed")
    ax.set_title(f"Calibration (Brier = {family_a['brier']:.5f})")
    fig.savefig(REPORTS / "calibration.png", dpi=120, bbox_inches="tight")

    fig, ax = plt.subplots(figsize=(6, 4))
    ax.plot(sweep_df["threshold"], sweep_df["net_inr"])
    ax.axvline(threshold, linestyle="--", label=f"optimum = {threshold:.3f}")
    ax.set_xlabel("threshold"); ax.set_ylabel("net INR (simulated)")
    ax.set_title("Net rupees vs threshold"); ax.legend()
    fig.savefig(REPORTS / "threshold_sweep.png", dpi=120, bbox_inches="tight")

    out = {"family_a": family_a, "family_b": family_b,
           "meta": {"matured_max_day": matured_max_day, "sample_n": sample_n}}
    (REPORTS / "metrics.json").write_text(json.dumps(out, indent=2))
    print(json.dumps(out, indent=2))
    return out


if __name__ == "__main__":
    main()
