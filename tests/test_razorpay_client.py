# tests/test_razorpay_client.py
import pytest
from dispute_autopilot.contracts import EvidenceBundle
from dispute_autopilot.razorpay.client import DryRunClient


def test_dry_run_returns_the_validated_payload_without_transmitting():
    c = DryRunClient()
    b = EvidenceBundle(dispute_id="d1", fields={"shipping_proof": "AWB 123"})
    result = c.contest("d1", b)
    assert result["transmitted"] is False
    assert result["payload"]["evidence"]["shipping_proof"] == "AWB 123"
    assert result["endpoint"] == "PATCH /v1/disputes/d1/contest"


def test_dry_run_refuses_an_invalid_bundle():
    with pytest.raises(ValueError):
        DryRunClient().contest("d1", EvidenceBundle(dispute_id="d1", fields={}))
