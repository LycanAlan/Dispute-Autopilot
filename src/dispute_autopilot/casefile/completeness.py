"""Evidence completeness multiplier w, and the required-field gate.

w is configuration, not a learned parameter. Fitting it to our data would be
circular, since the data contains no dispute outcomes.
"""
from dispute_autopilot.config import load_costs
from dispute_autopilot.contracts import CaseFile


def assess(casefile: CaseFile, reason_code: str) -> tuple[float, list[str]]:
    costs = load_costs()
    rc = costs.reason_codes[reason_code]
    c = costs.completeness

    present = set(casefile.items)
    missing = [f for f in rc.required if f not in present]

    w = 1.0
    for _ in missing:
        w *= c.missing_required_penalty
    for field in rc.supporting:
        if field in present:
            w *= c.supporting_bonus

    return min(1.0, max(0.0, w)), missing
