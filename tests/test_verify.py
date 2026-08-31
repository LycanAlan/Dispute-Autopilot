# tests/test_verify.py
from dispute_autopilot.contracts import CaseFile, Claim, EvidenceBundle, EvidenceItem, Posture
from dispute_autopilot.assembler.verify import verify


def _cf():
    return CaseFile(
        transaction_id=1, posture=Posture.ACTIVE,
        items={"shipping_proof": EvidenceItem(
            field="shipping_proof",
            value="Delivered, signature captured, AWB ABC123",
            source="carrier_tracking")},
    )


def _bundle(claims):
    return EvidenceBundle(dispute_id="d1", fields={"shipping_proof": "x"}, claims=claims)


def test_claim_backed_by_a_real_source_is_grounded():
    out = verify(_bundle([Claim(text="Parcel delivered with signature",
                                source_field="carrier_tracking")]), _cf())
    assert out.claims[0].grounded is True


def test_claim_citing_a_nonexistent_source_is_not_grounded():
    out = verify(_bundle([Claim(text="Customer called us",
                                source_field="phone_log")]), _cf())
    assert out.claims[0].grounded is False


def test_claim_with_no_source_is_not_grounded():
    out = verify(_bundle([Claim(text="Obviously legitimate", source_field=None)]), _cf())
    assert out.claims[0].grounded is False


def test_invented_identifier_is_caught_even_with_a_valid_source():
    out = verify(_bundle([Claim(text="Shipped under AWB ZZZ999",
                                source_field="carrier_tracking")]), _cf())
    assert out.claims[0].grounded is False


def test_groundedness_property_reflects_the_verified_claims():
    out = verify(_bundle([
        Claim(text="Parcel delivered with signature", source_field="carrier_tracking"),
        Claim(text="Customer called us", source_field="phone_log"),
    ]), _cf())
    assert abs(out.groundedness - 0.5) < 1e-9
