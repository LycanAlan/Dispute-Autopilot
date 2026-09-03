"""Metric family C: does the assembler invent facts, and does it refuse when it should?

MEASURED, on a synthetic evidence corpus. Groundedness asks whether the model
invented facts absent from its source -- a valid question regardless of whether
the source itself is synthetic.

WHY THIS IS STRATIFIED THE WAY IT IS. An earlier version of this harness
alternated ACTIVE/PASSIVE *posture*, which is how much evidence was vaulted.
That is the wrong axis. What actually drives the assembler's behaviour is
whether the vaulted evidence is FAVOURABLE or ADVERSE, and stratifying on
posture conflated the two. The result was a corpus where almost every case had
"say nothing" as the correct answer, two bundles carrying claims out of twenty
cases, and a groundedness figure averaged over empty bundles that score 1.0 for
free. It measured the harness, not the model.

So the corpus is now built on the axis that matters, giving two strata that
answer two different questions and do not contaminate each other:

  CONTESTABLE  complete evidence AND a recorded AVS match. The model has a real
               case to argue, which is the only situation in which fabrication
               is even possible -- you cannot measure invention on a case where
               the honest answer is silence. This stratum measures GROUNDEDNESS.

  ADVERSE      complete evidence but a recorded AVS mismatch. The honest answer
               is to decline. This stratum measures REFUSAL: does the assembler
               build a representment the evidence does not support?

Cases failing the completeness gate never reach the API at all and are counted
separately. That refusal is deterministic and is not a model property.

COST: one paid API call per case in either stratum. Real token usage is
captured from the API response and reported in the output -- this harness does
not estimate its own bill.
"""
import json

from pydantic import ValidationError

from dispute_autopilot.assembler.assemble import (
    ANTHROPIC_EFFORT, ANTHROPIC_MODEL, assemble, usage_summary,
)
from dispute_autopilot.assembler.verify import verify
from dispute_autopilot.casefile.completeness import assess
from dispute_autopilot.casefile.synthesize import synthesize_casefile
from dispute_autopilot.contracts import Dispute, Posture
from dispute_autopilot.economics.cost_model import to_inr
from dispute_autopilot.ingest.load import load_raw
from eval import REPORTS

ASSEMBLER_MODEL_NOTE = f"{ANTHROPIC_MODEL} at effort={ANTHROPIC_EFFORT}"
REASON = "fraud_card_absent"

N_PER_STRATUM = 10

# HARD SPEND GUARD. Every stratified case is one paid API call. The budget for
# this project is a few dollars total, so a runaway loop is a real risk rather
# than a theoretical one. This ceiling raises; it does not warn.
MAX_API_CALLS = 30


def _classify(casefile) -> str | None:
    """CONTESTABLE, ADVERSE, or None if the completeness gate refuses first."""
    _, missing = assess(casefile, REASON)
    if missing:
        return None
    billing = casefile.items.get("billing_proof")
    if billing is None:
        return None
    return "adverse" if "mismatch" in billing.value.lower() else "contestable"


def build_corpus(n_per_stratum: int = N_PER_STRATUM, scan: int = 5000) -> dict:
    """Select cases WITHOUT calling the API, so the sample is knowable up front."""
    df = load_raw(sample_n=scan)
    strata: dict[str, list] = {"contestable": [], "adverse": []}
    incomplete = 0

    for i, (_, row) in enumerate(df.iterrows()):
        # ACTIVE throughout: posture is no longer the experimental variable, so
        # holding it fixed removes it as a confound.
        casefile = synthesize_casefile(row, Posture.ACTIVE, seed=i)
        kind = _classify(casefile)
        if kind is None:
            incomplete += 1
            continue
        if len(strata[kind]) < n_per_stratum:
            strata[kind].append((i, row, casefile))
        if all(len(v) >= n_per_stratum for v in strata.values()):
            break

    return {"strata": strata, "incomplete_scanned": incomplete}


def main(n_per_stratum: int = N_PER_STRATUM) -> dict:
    corpus = build_corpus(n_per_stratum)
    strata = corpus["strata"]
    planned = sum(len(v) for v in strata.values())
    if planned > MAX_API_CALLS:
        raise ValueError(f"{planned} calls exceeds MAX_API_CALLS={MAX_API_CALLS}")

    results: dict[str, dict] = {}
    api_calls = 0

    for kind, cases in strata.items():
        groundedness, claim_counts, declined, gate_refused = [], [], 0, 0
        malformed = 0

        for idx, row, casefile in cases:
            api_calls += 1
            if api_calls > MAX_API_CALLS:
                raise RuntimeError(f"spend guard tripped at {api_calls} calls")

            dispute = Dispute(
                dispute_id=f"eval_{kind}_{idx}",
                transaction_id=int(row["TransactionID"]),
                amount_inr=float(to_inr(row["TransactionAmt"])),
                reason_code=REASON,
            )
            # One malformed response must not waste every call after it. A
            # run that dies halfway has spent real money and produced nothing;
            # an unparseable response is itself a measurable outcome and is
            # counted rather than raised.
            try:
                bundle = verify(assemble(dispute, casefile), casefile)
            except ValidationError:
                malformed += 1
                continue
            claim_counts.append(len(bundle.claims))

            if not bundle.claims and not bundle.fields:
                # The model declined to argue at all. On the adverse stratum
                # this is the CORRECT answer, so it is counted, never averaged
                # into groundedness -- an empty bundle scores 1.0 for free.
                declined += 1
                continue
            if any(not c.grounded for c in bundle.claims) or not bundle.claims:
                gate_refused += 1
            if bundle.claims:
                groundedness.append(bundle.groundedness)

        k = len(groundedness)
        results[kind] = {
            "n": len(cases),
            "n_declined_by_model": declined,
            # Responses that could not be parsed into the schema at all.
            # Non-zero means the model or its configuration is unreliable here,
            # which is a result about the assembler worth reporting.
            "n_malformed_responses": malformed,
            "n_attributed_bundles": k,
            "mean_claims_per_bundle": (
                round(sum(claim_counts) / len(cases), 2) if cases else None
            ),
            "groundedness_mean_over_attributed": (
                round(sum(groundedness) / k, 4) if k else None
            ),
            "gate_refusal_rate": round(gate_refused / len(cases), 4) if cases else None,
            # Rule of three: with zero observed failures in k trials the 95%
            # upper bound on the true rate is about 3/k. At these sample sizes
            # the bound matters more than the point estimate.
            "ungrounded_upper_bound_95": (
                round(3.0 / k, 4) if k and all(g == 1.0 for g in groundedness) else None
            ),
        }

    out = {
        "basis": "MEASURED on a synthetic evidence corpus",
        "model": ASSEMBLER_MODEL_NOTE,
        "design": (
            "Stratified on evidence favourability, not vault posture. "
            "CONTESTABLE cases measure groundedness where the model has a "
            "real case to argue. ADVERSE cases measure groundedness under "
            "pressure: the evidence argues against the merchant, which is "
            "where the temptation to spin is highest. NOTE: the adverse "
            "stratum was designed to measure REFUSAL, and earlier runs did "
            "show the model declining to argue such cases. Instructing it that "
            "both fields and claims must be non-empty removed that behaviour. "
            "That is defensible -- assembly and the contest decision are "
            "separate concerns, and the gates decide -- but it was a side "
            "effect, not a design choice, and the measurement changed with it."
        ),
        "contestable": results.get("contestable"),
        "adverse": results.get("adverse"),
        "cases_refused_before_any_api_call": corpus["incomplete_scanned"],
        # Measured from the API responses, not estimated.
        "actual_usage": usage_summary(),
    }
    REPORTS.mkdir(parents=True, exist_ok=True)
    (REPORTS / "generation_metrics.json").write_text(json.dumps(out, indent=2))
    print(json.dumps(out, indent=2))
    return out


if __name__ == "__main__":
    main()
