"""Baselines. Beating 'flag everything' IN RUPEES is the headline result."""
import numpy as np
import pandas as pd

from dispute_autopilot.config import load_features
from dispute_autopilot.economics.cost_model import RupeeMatrix, rupee_confusion

RULE_AMOUNT_INR = 10000.0
RULE_DIST = 100.0


def baseline_predictions(df: pd.DataFrame, name: str) -> np.ndarray:
    n = len(df)
    if name == "none":
        return np.zeros(n, dtype=int)
    if name == "all":
        return np.ones(n, dtype=int)
    if name == "rules":
        amt = pd.to_numeric(df["TransactionAmt"], errors="coerce").fillna(0)
        dist = pd.to_numeric(df.get("dist1"), errors="coerce").fillna(0)
        p, r = df.get("P_emaildomain"), df.get("R_emaildomain")
        mismatch = (p.notna() & r.notna() & (p != r)) if p is not None else False
        return ((amt > RULE_AMOUNT_INR) & ((dist > RULE_DIST) | mismatch)).astype(int).to_numpy()
    raise ValueError(f"unknown baseline: {name}")


def compare_baselines(
    df: pd.DataFrame, model_scores: np.ndarray, threshold: float
) -> dict[str, RupeeMatrix]:
    fc = load_features()
    y = df[fc.target].to_numpy()
    amounts = df["TransactionAmt"].to_numpy(dtype=float)
    out = {n: rupee_confusion(y, baseline_predictions(df, n), amounts)
           for n in ("none", "all", "rules")}
    out["model"] = rupee_confusion(y, (model_scores >= threshold).astype(int), amounts)
    return out
