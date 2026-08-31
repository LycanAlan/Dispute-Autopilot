"""LightGBM training with class weighting."""
from pathlib import Path

import joblib
import lightgbm as lgb
import pandas as pd

from dispute_autopilot.config import ARTIFACTS_DIR, load_features
from dispute_autopilot.features.builder import build_features, extract_categories

ARTIFACTS = ARTIFACTS_DIR

PARAMS = {
    "objective": "binary",
    "metric": "average_precision",
    "learning_rate": 0.05,
    "num_leaves": 63,
    "min_data_in_leaf": 100,
    "feature_fraction": 0.8,
    "bagging_fraction": 0.8,
    "bagging_freq": 1,
    "verbosity": -1,
    "seed": 42,
}


def train_model(
    train_df: pd.DataFrame, num_boost_round: int = 400
) -> tuple[lgb.Booster, dict[str, pd.CategoricalDtype]]:
    """Returns the booster AND the category sets it was fitted against.

    These are returned together, as a pair, on purpose. The categories are not
    optional metadata -- they are half the model. LightGBM splits on
    `.cat.codes`, so a booster scored against re-inferred categories is scoring
    against different integers than it trained on: silently, with no error and
    no failing test.

    Returning a tuple makes that mistake a TypeError at the call site instead of
    a wrong number in the README. Every caller is forced to acknowledge them.
    """
    fc = load_features()
    X = build_features(train_df)
    categories = extract_categories(X)
    y = train_df[fc.target]
    pos = max(int(y.sum()), 1)
    params = dict(PARAMS, scale_pos_weight=(len(y) - pos) / pos)
    dataset = lgb.Dataset(X, label=y, categorical_feature=fc.categorical)
    booster = lgb.train(params, dataset, num_boost_round=num_boost_round)
    return booster, categories


def save_model(booster: lgb.Booster, path: Path = ARTIFACTS / "model.txt") -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    booster.save_model(str(path))
    return path


def save_categories(
    categories: dict, path: Path = ARTIFACTS / "categories.joblib"
) -> Path:
    """Persist the fitted category sets beside the model.

    Serving MUST reuse these. LightGBM splits on .cat.codes, so a serving path
    that re-infers its own categories scores against different integers than the
    model was trained on — silently, with no error and no failing test.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(categories, path)
    return path
