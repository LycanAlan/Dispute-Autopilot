import numpy as np
from dispute_autopilot.economics.threshold import optimal_threshold, sweep


def test_sweep_returns_one_row_per_step_with_required_columns():
    rng = np.random.default_rng(3)
    y = rng.integers(0, 2, 500)
    s = rng.uniform(0, 1, 500)
    a = rng.uniform(100, 10000, 500)
    df = sweep(y, s, a, n_steps=20)
    assert len(df) == 20
    assert {"threshold", "net_inr", "precision", "recall"} <= set(df.columns)


def test_optimal_threshold_maximises_net_rupees():
    rng = np.random.default_rng(4)
    y = rng.integers(0, 2, 500)
    s = rng.uniform(0, 1, 500)
    a = rng.uniform(100, 10000, 500)
    df = sweep(y, s, a, n_steps=20)
    assert optimal_threshold(df) == df.loc[df["net_inr"].idxmax(), "threshold"]
