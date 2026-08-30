import numpy as np
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


def test_net_is_the_sum_of_the_four_cells():
    y_true = np.array([1, 0, 1, 0])
    y_pred = np.array([1, 1, 0, 0])
    amounts = np.array([5000.0, 2000.0, 8000.0, 1000.0])
    m = rupee_confusion(y_true, y_pred, amounts)
    assert abs(m.net_inr - (m.tp_inr + m.fp_inr + m.tn_inr + m.fn_inr)) < 1e-6
