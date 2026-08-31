import numpy as np
import pandas as pd
from dispute_autopilot.config import load_costs
from dispute_autopilot.economics.baselines import baseline_predictions, compare_baselines


def _df():
    return pd.DataFrame({
        "TransactionAmt": [100.0, 20000.0, 500.0],
        "dist1": [1.0, 400.0, np.nan],
        "P_emaildomain": ["gmail.com", "gmail.com", "a.com"],
        "R_emaildomain": ["gmail.com", "yahoo.com", "a.com"],
    })


def test_none_flags_nothing_and_all_flags_everything():
    assert baseline_predictions(_df(), "none").sum() == 0
    assert baseline_predictions(_df(), "all").all()


def test_rules_flag_the_high_amount_distant_mismatched_row():
    preds = baseline_predictions(_df(), "rules")
    assert preds[1] == 1
    assert preds[0] == 0


def test_rules_handles_missing_R_emaildomain_without_crashing():
    # p present, r absent -- the asymmetric case the original guard missed
    # (`r.notna()` on a None column raised AttributeError).
    df = _df().drop(columns=["R_emaildomain"])
    preds = baseline_predictions(df, "rules")
    assert preds[1] == 1  # still flagged: amount and distance alone qualify
    assert preds[0] == 0


def test_rules_handles_missing_P_emaildomain_without_crashing():
    # r present, p absent -- the reverse asymmetric case.
    df = _df().drop(columns=["P_emaildomain"])
    preds = baseline_predictions(df, "rules")
    assert preds[1] == 1
    assert preds[0] == 0


def test_compare_baselines_threads_costs_through_every_cell():
    df = _df().assign(isFraud=[0, 1, 0])
    model_scores = np.array([0.1, 0.9, 0.1])
    default_out = compare_baselines(df, model_scores, threshold=0.5)

    variant = load_costs().model_copy(update={"contest_fee_inr": 0.0})
    variant_out = compare_baselines(df, model_scores, threshold=0.5, costs=variant)

    # With contest_fee_inr zeroed out, every cell that carries a fee (here:
    # the "model" and "rules" baselines both flag row 1, a true positive)
    # must change. If compare_baselines silently fell back to the global
    # config, default_out and variant_out would be identical.
    assert default_out["model"].net_inr != variant_out["model"].net_inr
    assert default_out["rules"].net_inr != variant_out["rules"].net_inr
