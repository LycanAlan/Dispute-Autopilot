from dispute_autopilot.contracts import Action, Dispute
from dispute_autopilot.economics.decision import decide


def _d(amount=50000.0):
    return Dispute(dispute_id="disp_1", transaction_id=1,
                   amount_inr=amount, reason_code="fraud_card_absent")


def test_missing_required_evidence_forces_review_regardless_of_economics():
    result = decide(_d(amount=1_000_000.0), p_chargeback=0.01, w=1.0,
                    missing_required=["shipping_proof"])
    assert result.action is Action.REVIEW
    assert "shipping_proof" in result.missing_required


def test_low_risk_high_amount_with_full_evidence_contests():
    result = decide(_d(amount=100000.0), p_chargeback=0.02, w=1.0, missing_required=[])
    assert result.action is Action.CONTEST
    assert result.delta_ev_inr > 0


def test_high_risk_small_amount_accepts():
    result = decide(_d(amount=800.0), p_chargeback=0.95, w=1.0, missing_required=[])
    assert result.action is Action.ACCEPT


def test_every_decision_carries_the_assumption_notice():
    result = decide(_d(), p_chargeback=0.3, w=1.0, missing_required=[])
    assert "not validated" in result.assumption_notice.lower()


def test_the_dispute_fee_does_not_enter_the_contest_accept_differential():
    """The fee is charged win or lose, so it is identical under both branches.

    If it creeps back into delta_ev, changing it will move the answer -- and
    every low-value dispute silently tips toward ACCEPT.
    """
    from dispute_autopilot.config import load_costs

    base = load_costs()
    pricey = base.model_copy(update={"contest_fee_inr": 25_000.0})
    a = decide(_d(), p_chargeback=0.3, w=1.0, missing_required=[])
    b = decide(_d(), p_chargeback=0.3, w=1.0, missing_required=[], costs=pricey)
    assert a.delta_ev_inr == b.delta_ev_inr
    assert a.action is b.action


def test_model_influence_is_clipped_against_the_published_base_rate():
    optimistic = decide(_d(), p_chargeback=0.0, w=1.0, missing_required=[])
    # base rate 0.171, max lift 2.5 -> p_win can never exceed 0.4275
    assert optimistic.p_win <= 0.171 * 2.5 + 1e-9
