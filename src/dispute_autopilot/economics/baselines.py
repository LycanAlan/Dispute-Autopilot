"""Baselines. Beating 'flag everything' IN RUPEES is the headline result."""
import numpy as np
import pandas as pd

from dispute_autopilot.config import CostConfig, load_costs, load_features
from dispute_autopilot.economics.cost_model import RupeeMatrix, rupee_confusion, to_inr


def baseline_predictions(
    df: pd.DataFrame, name: str, costs: CostConfig | None = None
) -> np.ndarray:
    n = len(df)
    if name == "none":
        return np.zeros(n, dtype=int)
    if name == "all":
        return np.ones(n, dtype=int)
    if name == "rules":
        # Thresholds live in costs.yaml: this baseline is REPORTED alongside the
        # model, so its parameters are published methodology, not magic numbers.
        rules = (costs or load_costs()).baseline_rules
        # Converted: rules.amount_inr is in rupees, TransactionAmt is in USD.
        amt = to_inr(
            pd.to_numeric(df["TransactionAmt"], errors="coerce").fillna(0), costs
        )
        dist = pd.to_numeric(df.get("dist1"), errors="coerce").fillna(0)
        p, r = df.get("P_emaildomain"), df.get("R_emaildomain")
        if p is not None and r is not None:
            # .astype(object) BEFORE comparing, for the same reason builder.py
            # does: load_raw()'s downcast() makes both columns `category` dtype
            # with independently inferred category sets (43 domains vs 27 on the
            # real data), and pandas raises TypeError when comparing two
            # Categoricals whose categories differ. Fixed in builder.py first;
            # this second site was missed because no test fed it real dtypes.
            p = p.astype("object")
            r = r.astype("object")
            mismatch = p.notna() & r.notna() & (p != r)
        else:
            mismatch = False
        return (
            (amt > rules.amount_inr) & ((dist > rules.dist) | mismatch)
        ).astype(int).to_numpy()
    raise ValueError(f"unknown baseline: {name}")


def compare_baselines(
    df: pd.DataFrame,
    model_scores: np.ndarray,
    threshold: float,
    costs: CostConfig | None = None,
) -> dict[str, RupeeMatrix]:
    """`costs` threads a variant config (e.g. the UI's fee slider) through to
    every cell of every baseline, including "model" -- otherwise the sensitivity
    analysis would be silently partial, only affecting some of the comparison."""
    fc = load_features()
    y = df[fc.target].to_numpy()
    amounts = to_inr(df["TransactionAmt"].to_numpy(dtype=float), costs)
    out = {
        n: rupee_confusion(y, baseline_predictions(df, n, costs=costs), amounts, costs=costs)
        for n in ("none", "all", "rules")
    }
    out["model"] = rupee_confusion(
        y, (model_scores >= threshold).astype(int), amounts, costs=costs
    )
    return out
