"""Guard rail: the batch path and the single-row serving path must agree.

If this ever fails, the serving path has drifted from training and every
metric in the README is invalid.
"""
import pandas as pd
from dispute_autopilot.features.builder import build_features


def test_single_row_matches_batch_row(batch):
    full = build_features(batch)
    for i in [0, 17, 49]:
        single = build_features(batch.iloc[[i]])
        for col in full.columns:
            a, b = full[col].iloc[i], single[col].iloc[0]
            if pd.isna(a) and pd.isna(b):
                continue
            assert a == b, f"train/serve skew in {col} at row {i}: {a} != {b}"
