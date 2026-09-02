"""Demo console. Three tabs matching the video beats."""
import json
from pathlib import Path

import pandas as pd
import streamlit as st

from dispute_autopilot.casefile.store import VaultStore, choose_posture
from dispute_autopilot.casefile.synthesize import synthesize_casefile
from dispute_autopilot.config import load_costs
from dispute_autopilot.contracts import Action, Dispute
from dispute_autopilot.economics.threshold import optimal_threshold, sweep
from dispute_autopilot.ingest.load import load_raw
from dispute_autopilot.model.predict import Scorer
from dispute_autopilot.triage import triage

st.set_page_config(page_title="Dispute Autopilot", layout="wide")
from dispute_autopilot.economics.cost_model import to_inr
from dispute_autopilot.razorpay.client import DryRunClient
# ONE definition, in eval/__init__.py -- see below. Hand-writing
# parents[N] per file gets the depth wrong the moment a module moves.
from eval import REPORTS


@st.cache_resource
def _load():
    return Scorer.load(), load_raw(sample_n=5000), VaultStore()


scorer, data, vault = _load()
tab_triage, tab_metrics, tab_econ = st.tabs(["Triage", "Metrics", "Economics"])

with tab_triage:
    st.header("Dispute triage")
    idx = st.number_input("Transaction row", 0, len(data) - 1, 0)
    row = data.iloc[[idx]]
    # USD -> INR at the boundary, exactly as baselines.py and run_eval.py do.
    # TransactionAmt is dollars; choose_posture's thresholds, Dispute.amount_inr
    # and every rupee figure on this screen are rupees. Without this the median
    # exposure reads about $2.34 against a Rs 50 threshold, nearly everything
    # comes out Posture.NONE, and the demo cannot show CONTEST at all.
    amount = float(to_inr(row["TransactionAmt"].iloc[0]))

    score = scorer.score_one(row)
    posture = choose_posture(score.p_chargeback, amount)
    casefile = synthesize_casefile(row.iloc[0], posture, seed=int(idx))
    vault.put(casefile)

    dispute = Dispute(dispute_id=f"disp_{idx}",
                      transaction_id=int(row["TransactionID"].iloc[0]),
                      amount_inr=amount, reason_code="fraud_card_absent")
    decision = triage(dispute, row, scorer, vault)

    c1, c2, c3 = st.columns(3)
    c1.metric("P(chargeback)", f"{score.p_chargeback:.4f}")
    c2.metric("Amount", f"INR {amount:,.2f}")
    c3.metric("Evidence posture", posture.value)

    colour = {Action.CONTEST: "success", Action.ACCEPT: "info", Action.REVIEW: "warning"}
    getattr(st, colour[decision.action])(
        f"{decision.action.value} — delta EV INR {decision.delta_ev_inr:,.2f}"
    )
    if decision.missing_required:
        st.error(f"Refused to contest. Missing required evidence: "
                 f"{', '.join(decision.missing_required)}")

    # The refusal gate, made visible. A claim the verifier could not tie back to
    # the vault downgrades CONTEST to REVIEW. If this never appears on screen,
    # the demo cannot show the one property that makes the system defense-only.
    if decision.refused_claims:
        st.error(
            "Refused to contest. The groundedness verifier could not tie these "
            "claims back to the vault, so they were never transmitted:"
        )
        for claim in decision.refused_claims:
            st.write(f"- {claim}")

    st.subheader("Vault contents")
    st.json({k: v.value for k, v in casefile.items.items()})

    if decision.bundle:
        st.subheader("Assembled evidence bundle")
        st.json(decision.bundle.fields)
        st.subheader("Claim grounding")
        st.dataframe(pd.DataFrame([
            {"claim": c.text, "source": c.source_field, "grounded": c.grounded}
            for c in decision.bundle.claims
        ]))

    # THE RAZORPAY-NATIVE CLAIM, made visible. Task 7.1 builds a schema-valid
    # contest payload, and without this block nothing in the demo ever shows
    # it -- the entire "speaks Razorpay's evidence schema" claim would rest on
    # a function no viewer sees run. Dry-run by default: constructed, validated,
    # and deliberately not transmitted.
    if decision.action is Action.CONTEST and decision.bundle:
        st.subheader("Razorpay contest payload (DRY RUN — not transmitted)")
        try:
            call = DryRunClient().contest(dispute.dispute_id, decision.bundle)
            st.code(call["endpoint"], language="text")
            st.json(call["payload"])
            st.caption(
                "transmitted = False. The payload is schema-validated against "
                "Razorpay's documented evidence fields and shown here instead "
                "of being sent. Live submission requires test-mode keys and is "
                "recorded in docs/gates/G2-razorpay-test-mode.md."
            )
        except ValueError as exc:
            st.error(f"Payload failed Razorpay schema validation: {exc}")

    st.caption(decision.assumption_notice)

with tab_metrics:
    st.header("Measured metrics")
    if (REPORTS / "metrics.json").exists():
        m = json.loads((REPORTS / "metrics.json").read_text())
        st.subheader("Family A — measured, real labels, held-out temporal split")
        st.json(m["family_a"])
        st.subheader("Family B — simulated, stated cost assumptions")
        st.json(m["family_b"])
        for name in ("pr_curve", "calibration", "threshold_sweep"):
            if (REPORTS / f"{name}.png").exists():
                st.image(str(REPORTS / f"{name}.png"))
    else:
        st.warning("Run `python -m eval.run_eval` first.")
    if (REPORTS / "generation_metrics.json").exists():
        st.subheader("Family C — measured generation quality, synthetic corpus")
        st.json(json.loads((REPORTS / "generation_metrics.json").read_text()))

with tab_econ:
    st.header("The threshold is chosen by money, not by 0.5")
    # Default 750 matches costs.yaml. Razorpay publishes no dispute fee, so the
    # slider is not a toy: it IS the sensitivity analysis. Cited range is Rs 200-2000.
    fee = st.slider("Contest fee (INR)", 0, 3000, 750, 50)
    st.caption("Razorpay does not publish a dispute fee. Cited third-party range: "
               "Rs 200-2000, negotiated per merchant agreement, charged win or lose.")
    sample = data.head(2000)
    p = scorer.score_batch(sample)

    # CostConfig is frozen, so the slider builds a variant and threads it through
    # rather than mutating the shared cached instance. An in-place override would
    # leak into the Triage tab and make its decisions silently disagree with
    # costs.yaml — which is exactly the bug this design removes.
    variant = load_costs().model_copy(update={"contest_fee_inr": float(fee)})
    sweep_df = sweep(sample["isFraud"].to_numpy(), p,
                     to_inr(sample["TransactionAmt"].to_numpy(dtype=float), variant),
                     n_steps=60, costs=variant)
    best = optimal_threshold(sweep_df)

    st.line_chart(sweep_df.set_index("threshold")["net_inr"])
    st.metric("EV-optimal threshold", f"{best:.3f}")
    st.caption("Simulated (family B). Raising the fee makes contesting less "
               "attractive and moves the optimal threshold.")
