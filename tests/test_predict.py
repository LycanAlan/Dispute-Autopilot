# tests/test_predict.py
import numpy as np
import pandas as pd
from dispute_autopilot.contracts import RiskScore
from dispute_autopilot.model.predict import Scorer


def test_score_one_returns_a_contract_object(batch):
    from dispute_autopilot.model.train import train_model
    from dispute_autopilot.model.calibrate import fit_calibrator
    rng = np.random.default_rng(2)
    df = pd.concat([batch] * 8, ignore_index=True)
    df["isFraud"] = rng.integers(0, 2, len(df))
    booster, categories = train_model(df, num_boost_round=10)
    iso = fit_calibrator(booster, df, categories)
    scorer = Scorer(booster=booster, calibrator=iso, categories=categories)

    result = scorer.score_one(df.iloc[[0]])
    assert isinstance(result, RiskScore)
    assert 0.0 <= result.p_chargeback <= 1.0
    assert result.calibrated is True
    assert len(result.top_reasons) <= 5
