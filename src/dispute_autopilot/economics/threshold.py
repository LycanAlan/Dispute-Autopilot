"""Choose the operating threshold by expected value, never by 0.5."""
import numpy as np
import pandas as pd

from dispute_autopilot.config import CostConfig
from dispute_autopilot.economics.cost_model import rupee_confusion


def sweep(
    y_true: np.ndarray,
    scores: np.ndarray,
    amounts: np.ndarray,
    n_steps: int = 100,
    costs: CostConfig | None = None,
) -> pd.DataFrame:
    """`costs` threads a variant config through to rupee_confusion -- used by the
    UI's fee slider, which is the sensitivity analysis, not a decoration."""
    rows = []
    for t in np.linspace(0.001, 0.999, n_steps):
        m = rupee_confusion(y_true, (scores >= t).astype(int), amounts, costs=costs)
        rows.append({
            "threshold": float(t),
            "net_inr": m.net_inr,
            "precision": m.tp / (m.tp + m.fp) if (m.tp + m.fp) else 0.0,
            "recall": m.tp / (m.tp + m.fn) if (m.tp + m.fn) else 0.0,
        })
    return pd.DataFrame(rows)


def optimal_threshold(sweep_df: pd.DataFrame) -> float:
    return float(sweep_df.loc[sweep_df["net_inr"].idxmax(), "threshold"])
