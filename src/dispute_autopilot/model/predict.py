"""Serving path. Uses THE feature builder — never a reimplementation."""
from dataclasses import dataclass
from pathlib import Path

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd

from dispute_autopilot.config import ARTIFACTS_DIR
from dispute_autopilot.contracts import RiskScore
from dispute_autopilot.features.builder import build_features
from dispute_autopilot.model.calibrate import apply_calibrator

ARTIFACTS = ARTIFACTS_DIR


@dataclass
class Scorer:
    booster: lgb.Booster
    calibrator: object
    # No default. A Scorer without categories is a broken Scorer, so it must be
    # impossible to construct one by omission -- the same reason
    # Decision.assumption_notice has no default.
    categories: dict[str, pd.CategoricalDtype]

    @classmethod
    def load(cls, artifacts: Path = ARTIFACTS) -> "Scorer":
        return cls(
            booster=lgb.Booster(model_file=str(artifacts / "model.txt")),
            calibrator=joblib.load(artifacts / "calibrator.joblib"),
            categories=joblib.load(artifacts / "categories.joblib"),
        )

    def score_batch(self, df: pd.DataFrame) -> np.ndarray:
        # categories MUST be threaded through. Scoring one row without them makes
        # every categorical collapse to code 0, silently, with no error.
        features = build_features(df, categories=self.categories)
        return apply_calibrator(self.calibrator, self.booster.predict(features))

    def score_one(self, row: pd.DataFrame) -> RiskScore:
        if len(row) != 1:
            raise ValueError("score_one expects exactly one row")
        p = float(self.score_batch(row)[0])
        gains = self.booster.feature_importance(importance_type="gain")
        names = self.booster.feature_name()
        order = np.argsort(gains)[::-1][:5]
        total = gains.sum() or 1.0
        return RiskScore(
            transaction_id=int(row["TransactionID"].iloc[0]),
            p_chargeback=p,
            calibrated=True,
            top_reasons=[(names[i], round(float(gains[i] / total), 4)) for i in order],
        )
