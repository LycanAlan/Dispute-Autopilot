"""Isotonic calibration on the held-out calibration slice."""
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.isotonic import IsotonicRegression

from dispute_autopilot.config import ARTIFACTS_DIR, load_features
from dispute_autopilot.features.builder import build_features

ARTIFACTS = ARTIFACTS_DIR


def fit_calibrator(
    booster,
    calib_df: pd.DataFrame,
    categories: dict[str, pd.CategoricalDtype],
) -> IsotonicRegression:
    """`categories` is REQUIRED and has no default, deliberately.

    The calibration slice is a different time window than training, so its
    inferred category sets differ from the training ones. Calibrating on
    re-inferred codes fits the mapping against a model that is effectively
    reading scrambled categoricals -- which would then be baked into every
    expected-value decision downstream.
    """
    fc = load_features()
    raw = booster.predict(build_features(calib_df, categories=categories))
    iso = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
    iso.fit(raw, calib_df[fc.target].to_numpy())
    return iso


def apply_calibrator(iso: IsotonicRegression, raw: np.ndarray) -> np.ndarray:
    return np.clip(iso.predict(raw), 0.0, 1.0)


def save_calibrator(iso, path: Path = ARTIFACTS / "calibrator.joblib") -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(iso, path)
    return path
