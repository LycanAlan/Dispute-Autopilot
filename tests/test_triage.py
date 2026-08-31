# tests/test_triage.py
import pandas as pd
from dispute_autopilot.contracts import (
    Action, CaseFile, Dispute, EvidenceBundle, EvidenceItem, Posture, RiskScore,
)
from dispute_autopilot.triage import triage


class _FakeScorer:
    def __init__(self, p): self.p = p
    def score_one(self, row):
        return RiskScore(transaction_id=int(row["TransactionID"].iloc[0]),
                         p_chargeback=self.p, calibrated=True, top_reasons=[])


class _FakeVault:
    def __init__(self, cf): self.cf = cf
    def get(self, _): return self.cf


def _row():
    return pd.DataFrame([{"TransactionID": 42, "TransactionAmt": 2499.0}])


def _full_cf():
    return CaseFile(transaction_id=42, posture=Posture.ACTIVE, items={
        f: EvidenceItem(field=f, value="v", source=f"src_{f}")
        for f in ("billing_proof", "shipping_proof")})


def _d(amount=90000.0):
    return Dispute(dispute_id="d1", transaction_id=42,
                   amount_inr=amount, reason_code="fraud_card_absent")


def test_missing_evidence_yields_review_and_never_calls_the_assembler():
    called = []
    def _assembler(*a, **k):
        called.append(1)
        return EvidenceBundle(dispute_id="d1")
    empty = CaseFile(transaction_id=42, posture=Posture.NONE, items={})
    result = triage(_d(), _row(), _FakeScorer(0.02), _FakeVault(empty), _assembler)
    assert result.action is Action.REVIEW
    assert called == []
    assert "billing_proof" in result.missing_required


def test_an_absent_vault_entry_is_treated_as_no_evidence():
    class _Empty:
        def get(self, _): return None
    result = triage(_d(), _row(), _FakeScorer(0.02), _Empty(), lambda *a, **k: None)
    assert result.action is Action.REVIEW


def test_contest_path_attaches_a_verified_bundle():
    def _assembler(dispute, casefile):
        from dispute_autopilot.contracts import Claim
        return EvidenceBundle(
            dispute_id=dispute.dispute_id, fields={"shipping_proof": "v"},
            claims=[Claim(text="delivered", source_field="src_shipping_proof")])
    result = triage(_d(), _row(), _FakeScorer(0.01), _FakeVault(_full_cf()), _assembler)
    assert result.action is Action.CONTEST
    assert result.bundle is not None
    assert result.bundle.claims[0].grounded is True


def test_a_fabricated_identifier_is_refused_and_never_contested():
    """The headline safety property: verification must change the outcome.

    Without the refusal gate this test passes CONTEST with an ungrounded claim
    attached -- the verifier runs, marks it False, and nothing acts on it.
    """
    from dispute_autopilot.contracts import Claim

    def _hallucinating_assembler(dispute, casefile):
        return EvidenceBundle(
            dispute_id=dispute.dispute_id,
            fields={"shipping_proof": "Shipped under AWB ZZZ999"},
            claims=[Claim(text="Shipped under AWB ZZZ999",
                          source_field="src_shipping_proof")])

    result = triage(_d(), _row(), _FakeScorer(0.01), _FakeVault(_full_cf()),
                    _hallucinating_assembler)
    assert result.action is Action.REVIEW
    assert result.refused_claims == ["Shipped under AWB ZZZ999"]
    assert result.bundle is not None, "the bundle is kept for a human to inspect"


def test_asserting_fields_with_no_attributable_claims_is_refused():
    """groundedness is 1.0 on an empty claim list -- that must not be a pass."""
    def _unattributed(dispute, casefile):
        return EvidenceBundle(dispute_id=dispute.dispute_id,
                              fields={"shipping_proof": "v"}, claims=[])

    result = triage(_d(), _row(), _FakeScorer(0.01), _FakeVault(_full_cf()),
                    _unattributed)
    assert result.action is Action.REVIEW
