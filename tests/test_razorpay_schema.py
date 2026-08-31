# tests/test_razorpay_schema.py
from dispute_autopilot.contracts import EvidenceBundle
from dispute_autopilot.razorpay.schema import (
    RAZORPAY_EVIDENCE_FIELDS, to_contest_payload, validate_bundle,
)


def test_known_fields_are_accepted():
    b = EvidenceBundle(dispute_id="d1", fields={"shipping_proof": "AWB 123"})
    assert validate_bundle(b) == []


def test_unknown_fields_are_rejected():
    b = EvidenceBundle(dispute_id="d1", fields={"vibes": "good"})
    errors = validate_bundle(b)
    assert any("vibes" in e for e in errors)


def test_empty_bundle_is_rejected_because_razorpay_requires_at_least_one():
    assert validate_bundle(EvidenceBundle(dispute_id="d1", fields={})) != []


def test_payload_shape_matches_the_contest_api():
    b = EvidenceBundle(dispute_id="d1", fields={"shipping_proof": "AWB 123"})
    payload = to_contest_payload(b)
    assert payload["action"] == "submit"
    assert payload["evidence"]["shipping_proof"] == "AWB 123"


def test_the_schema_contains_the_documented_field_names():
    for f in ("shipping_proof", "billing_proof", "explanation_letter",
              "customer_communication", "refund_cancellation_policy"):
        assert f in RAZORPAY_EVIDENCE_FIELDS
