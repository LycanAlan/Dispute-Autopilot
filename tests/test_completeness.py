from dispute_autopilot.contracts import CaseFile, EvidenceItem, Posture
from dispute_autopilot.casefile.completeness import assess


def _cf(fields):
    return CaseFile(
        transaction_id=1, posture=Posture.ACTIVE,
        items={f: EvidenceItem(field=f, value="v", source="s") for f in fields},
    )


def test_all_required_present_gives_w_at_or_near_one():
    w, missing = assess(_cf(["billing_proof", "shipping_proof"]), "fraud_card_absent")
    assert missing == []
    assert 0.9 <= w <= 1.0


def test_missing_required_is_reported_and_penalised():
    w, missing = assess(_cf(["billing_proof"]), "fraud_card_absent")
    assert missing == ["shipping_proof"]
    assert w < 1.0


def test_supporting_evidence_raises_w_but_never_above_one():
    base, _ = assess(_cf(["billing_proof", "shipping_proof"]), "fraud_card_absent")
    more, _ = assess(
        _cf(["billing_proof", "shipping_proof", "customer_communication",
             "access_activity_log", "term_and_conditions"]),
        "fraud_card_absent",
    )
    assert more >= base
    assert more <= 1.0


def test_empty_vault_reports_every_required_field_missing():
    w, missing = assess(_cf([]), "fraud_card_absent")
    assert set(missing) == {"billing_proof", "shipping_proof"}
