import numpy as np
from dispute_autopilot.config import load_costs
from dispute_autopilot.economics.cost_model import rupee_confusion


def test_false_positive_costs_the_posture_spend_not_the_amount():
    y_true = np.array([0])
    y_pred = np.array([1])
    amounts = np.array([10000.0])
    m = rupee_confusion(y_true, y_pred, amounts)
    assert m.fp == 1
    assert m.fp_inr < 0
    assert abs(m.fp_inr) < 10000.0  # a false positive never costs the full amount


def test_false_negative_costs_the_full_transaction_amount():
    m = rupee_confusion(np.array([1]), np.array([0]), np.array([10000.0]))
    assert m.fn == 1
    assert abs(m.fn_inr) >= 10000.0


def test_true_positive_value_nets_win_rate_minus_posture_and_fee():
    # contest_fee_inr is charged win or lose (config/costs.yaml), so it comes
    # out of TP value too, not just FN -- otherwise TP would be overstated.
    costs = load_costs()
    amount = 5000.0
    m = rupee_confusion(np.array([1]), np.array([1]), np.array([amount]))
    expected = (
        amount * costs.base_win_rate_fraud_coded
        - costs.posture_cost_inr["ACTIVE"]
        - costs.contest_fee_inr
    )
    assert m.tp == 1
    assert abs(m.tp_inr - expected) < 1e-6


def test_true_negative_is_exactly_zero():
    m = rupee_confusion(np.array([0]), np.array([0]), np.array([12345.0]))
    assert m.tn == 1
    assert m.tn_inr == 0.0
