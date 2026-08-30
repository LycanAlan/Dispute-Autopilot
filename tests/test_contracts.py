import pytest
from pydantic import ValidationError
from dispute_autopilot.contracts import (
    Action, CaseFile, Decision, Dispute, EvidenceItem, Posture, RiskScore,
)


def test_risk_score_rejects_probability_outside_unit_interval():
    with pytest.raises(ValidationError):
        RiskScore(transaction_id=1, p_chargeback=1.4, calibrated=True, top_reasons=[])


def test_decision_requires_assumption_notice():
    with pytest.raises(ValidationError):
        Decision(
            dispute_id="disp_1", action=Action.CONTEST, p_chargeback=0.1,
            p_win=0.3, delta_ev_inr=500.0, w_completeness=1.0, missing_required=[],
        )


def test_casefile_lookup_by_evidence_field():
    cf = CaseFile(
        transaction_id=1,
        posture=Posture.PASSIVE,
        items={"billing_proof": EvidenceItem(
            field="billing_proof", value="AVS match: Y", source="avs_result")},
    )
    assert cf.items["billing_proof"].source == "avs_result"
