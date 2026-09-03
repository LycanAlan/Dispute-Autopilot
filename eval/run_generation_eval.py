"""Metric family C: does the assembler invent facts, and does it refuse when it should?

MEASURED, on a synthetic evidence corpus. Groundedness asks whether the model
invented facts absent from its source — valid regardless of the source's origin.

Half the sample is deliberately degraded (required evidence removed). Note what
that does and does not measure: the completeness refusal is DETERMINISTIC and
alternates by construction, so its rate is ~0.5 no matter how the model behaves
and is not a result. The measured safety property is gate_refusal_rate -- of the
bundles actually assembled, how many the groundedness gate stopped.

COST: every assembled case is one paid API call. At N_CASES=20 only the ~10
ACTIVE-posture cases reach the API; the rest are refused before any spend.
MAX_API_CALLS is a hard ceiling, not a warning.
"""
import json
from pathlib import Path

from dispute_autopilot.assembler.assemble import assemble
from dispute_autopilot.assembler.verify import verify
from dispute_autopilot.casefile.completeness import assess
from dispute_autopilot.casefile.synthesize import synthesize_casefile
from dispute_autopilot.contracts import Dispute, Posture
from dispute_autopilot.economics.cost_model import to_inr
from dispute_autopilot.ingest.load import load_raw

# ONE definition, in eval/__init__.py -- see below. Hand-writing
# parents[N] per file gets the depth wrong the moment a module moves.
from eval import REPORTS

# Family C must describe the model the system actually ships with. Reporting
# generation quality from a cheap model while demoing an expensive one is the
# kind of unfalsifiable claim this project's positioning criticises.
from dispute_autopilot.assembler.assemble import ANTHROPIC_EFFORT, ANTHROPIC_MODEL

ASSEMBLER_MODEL_NOTE = f"{ANTHROPIC_MODEL} at effort={ANTHROPIC_EFFORT}"

N_CASES = 20
# HARD SPEND GUARD. Every assembled case is one paid API call. The budget for
# this project is a few dollars total, so a runaway loop is a real risk, not a
# theoretical one. This ceiling raises rather than warns.
MAX_API_CALLS = 40


def main(n: int = N_CASES) -> dict:
    if n > MAX_API_CALLS:
        raise ValueError(f"n={n} exceeds MAX_API_CALLS={MAX_API_CALLS}")
    df = load_raw(sample_n=5000).sample(n, random_state=0)
    grounded_scores, complete_cases = [], 0
    incomplete_refusals = 0   # blocked by the completeness gate, no API call made
    gate_refusals = 0         # assembled, then refused for an ungrounded claim
    api_calls = 0
    # Without this, a groundedness of 1.0 is uninterpretable:
    # EvidenceBundle.groundedness returns 1.0 for an EMPTY claim list, so a
    # model that attributed nothing at all scores identically to one that
    # attributed everything correctly. Recording the counts is what makes the
    # headline number mean something.
    claim_counts: list[int] = []

    for i, (_, row) in enumerate(df.iterrows()):
        # Alternate: half full evidence, half deliberately degraded.
        posture = Posture.ACTIVE if i % 2 == 0 else Posture.PASSIVE
        casefile = synthesize_casefile(row, posture, seed=i)
        _, missing = assess(casefile, "fraud_card_absent")

        if missing:
            incomplete_refusals += 1
            continue

        complete_cases += 1
        api_calls += 1
        if api_calls > MAX_API_CALLS:
            raise RuntimeError(f"spend guard tripped at {api_calls} calls")
        # USD -> INR once, at the boundary, exactly as run_eval.py, baselines.py,
        # find_demo_rows.py and ui/app.py all do. TransactionAmt is dollars;
        # Dispute.amount_inr is rupees and is quoted verbatim into the assembler
        # prompt ("Dispute ... for INR {amount_inr}") -- feeding it raw USD would
        # both mislabel the case shown to the model and understate every amount
        # in this report by ~83x, the same defect already fixed once in
        # baselines.py and eval/run_eval.py (commit 40c1ffd).
        dispute = Dispute(dispute_id=f"eval_{i}", transaction_id=int(row["TransactionID"]),
                          amount_inr=float(to_inr(row["TransactionAmt"])),
                          reason_code="fraud_card_absent")
        bundle = verify(assemble(dispute, casefile), casefile)
        grounded_scores.append(bundle.groundedness)
        claim_counts.append(len(bundle.claims))
        if any(not c.grounded for c in bundle.claims):
            gate_refusals += 1

    mean_g = sum(grounded_scores) / len(grounded_scores) if grounded_scores else 0.0

    # Rule of three: with zero observed failures in k trials, the 95% upper
    # bound on the true rate is about 3/k. At these sample sizes an honest
    # bound matters more than a flattering point estimate -- "0 ungrounded
    # claims in 10 bundles" is worth far less than it sounds without it.
    k = len(grounded_scores)
    ungrounded_upper_95 = round(3.0 / k, 4) if k and mean_g == 1.0 else None

    out = {
        "basis": "MEASURED on a synthetic evidence corpus",
        "model": ASSEMBLER_MODEL_NOTE,
        "n_cases": n,
        "n_assembled": complete_cases,
        "n_api_calls": api_calls,
        "groundedness_mean": round(mean_g, 4),
        "total_claims": sum(claim_counts),
        "mean_claims_per_bundle": round(sum(claim_counts) / k, 2) if k else None,
        "bundles_with_zero_claims": sum(1 for c in claim_counts if c == 0),
        # A groundedness of 1.0 means nothing unless claims were actually made.
        # If this is False, the headline number is vacuous and must not be
        # reported as a result.
        "groundedness_is_interpretable": bool(k and all(c > 0 for c in claim_counts)),
        "hallucination_rate": round(1.0 - mean_g, 4),
        # Of the bundles actually assembled, how many did the refusal gate stop.
        # THIS is the safety property under test.
        "gate_refusal_rate": round(gate_refusals / k, 4) if k else None,
        # Reported for completeness and explicitly NOT a measured model
        # property: the harness alternates ACTIVE/PASSIVE posture, so this is
        # ~0.5 by construction. It says nothing about the assembler.
        "completeness_refusal_rate_BY_CONSTRUCTION": round(incomplete_refusals / n, 4),
        "ungrounded_rate_upper_bound_95": ungrounded_upper_95,
    }
    REPORTS.mkdir(parents=True, exist_ok=True)
    (REPORTS / "generation_metrics.json").write_text(json.dumps(out, indent=2))
    print(json.dumps(out, indent=2))
    return out


if __name__ == "__main__":
    main()
