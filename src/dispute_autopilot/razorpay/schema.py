"""Razorpay dispute evidence schema.

Field names from Razorpay's Submit Evidence documentation. Razorpay requires at
least one evidence attribute for a successful contest submission.
"""
from dispute_autopilot.contracts import EvidenceBundle

RAZORPAY_EVIDENCE_FIELDS = frozenset({
    "shipping_proof",
    "billing_proof",
    "cancellation_proof",
    "customer_communication",
    "proof_of_service",
    "explanation_letter",
    "refund_confirmation",
    "access_activity_log",
    "refund_cancellation_policy",
    "term_and_conditions",
})


def validate_bundle(bundle: EvidenceBundle) -> list[str]:
    errors: list[str] = []
    if not bundle.fields:
        errors.append("at least one evidence field is required by Razorpay")
    for name in bundle.fields:
        if name not in RAZORPAY_EVIDENCE_FIELDS:
            errors.append(f"unknown evidence field: {name}")
    for name, value in bundle.fields.items():
        if not str(value).strip():
            errors.append(f"empty value for evidence field: {name}")
    return errors


def to_contest_payload(bundle: EvidenceBundle) -> dict:
    """Body for PATCH /v1/disputes/:id/contest."""
    return {"action": "submit", "evidence": dict(bundle.fields)}
