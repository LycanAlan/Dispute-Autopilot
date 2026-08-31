# tests/test_train.py
import numpy as np
import pandas as pd
from dispute_autopilot.model.train import train_model


def test_train_returns_a_booster_that_scores_in_unit_interval(batch):
    """`batch` comes from tests/conftest.py — pytest injects it automatically."""
    rng = np.random.default_rng(1)
    df = pd.concat([batch] * 8, ignore_index=True)
    df["isFraud"] = rng.integers(0, 2, len(df))
    booster, categories = train_model(df, num_boost_round=10)
    from dispute_autopilot.features.builder import build_features
    preds = booster.predict(build_features(df, categories=categories))
    assert preds.min() >= 0.0 and preds.max() <= 1.0
    assert set(categories), "train_model must return the fitted category sets"
