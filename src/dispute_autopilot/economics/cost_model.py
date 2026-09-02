"""Confusion matrix denominated in rupees. This is the money table.

METRIC FAMILY B (simulated): the rupee values depend on the cost assumptions in
config/costs.yaml, not on measured outcomes. Label every reported figure.
"""
from dataclasses import dataclass

import numpy as np

from dispute_autopilot.config import CostConfig, load_costs


@dataclass
class RupeeMatrix:
    tp: int
    fp: int
    tn: int
    fn: int
    tp_inr: float
    fp_inr: float
    tn_inr: float
    fn_inr: float

    @property
    def net_inr(self) -> float:
        return self.tp_inr + self.fp_inr + self.tn_inr + self.fn_inr


def to_inr(amounts, costs: CostConfig | None = None) -> np.ndarray:
    """Convert IEEE-CIS TransactionAmt (USD) into rupees.

    The dataset's amounts are USD -- the competition host says so. Every rupee
    figure this project reports depends on this conversion happening exactly
    once, at the boundary where raw data becomes economics. Call it there and
    nowhere else: converting twice is as wrong as not converting at all, and
    neither failure raises.
    """
    costs = costs or load_costs()
    return np.asarray(amounts, dtype=float) * costs.usd_to_inr


def rupee_confusion(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    amounts: np.ndarray,
    costs: CostConfig | None = None,
) -> RupeeMatrix:
    """
    TP: flagged and did charge back -> evidence vault existed, dispute defensible.
        Value = amount recovered at the published win rate, less posture cost and
        the contest fee. config/costs.yaml documents contest_fee_inr as charged
        win or lose, so it is subtracted here too -- not just on FN -- or TP
        value would be overstated relative to what the constant itself says.
    FP: flagged but never disputed -> we paid for a vault nobody needed.
        Cost = posture cost only. A false positive is cheap; that is the point.
    TN: not flagged, not disputed -> zero.
    FN: not flagged but did charge back -> no vault, representment lost.
        Cost = full amount plus the contest fee we cannot recover.

    `costs` lets a caller supply a variant config (e.g. the UI's fee slider) via
    load_costs().model_copy(update={...}). CostConfig is frozen, so the shared
    cached instance can never be mutated out from under other callers.
    """
    costs = costs or load_costs()
    posture = costs.posture_cost_inr["ACTIVE"]
    win = costs.base_win_rate_fraud_coded

    y_true = np.asarray(y_true).astype(bool)
    y_pred = np.asarray(y_pred).astype(bool)
    amounts = np.asarray(amounts, dtype=float)

    tp_m, fp_m = y_true & y_pred, ~y_true & y_pred
    tn_m, fn_m = ~y_true & ~y_pred, y_true & ~y_pred

    return RupeeMatrix(
        tp=int(tp_m.sum()), fp=int(fp_m.sum()),
        tn=int(tn_m.sum()), fn=int(fn_m.sum()),
        tp_inr=float(
            (amounts[tp_m] * win).sum()
            - tp_m.sum() * posture
            - tp_m.sum() * costs.contest_fee_inr
        ),
        fp_inr=float(-fp_m.sum() * posture),
        tn_inr=0.0,
        fn_inr=float(-(amounts[fn_m].sum() + fn_m.sum() * costs.contest_fee_inr)),
    )
