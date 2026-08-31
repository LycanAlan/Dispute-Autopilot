"""Guard rail: the batch path and the single-row serving path must agree.

If this ever fails, the serving path has drifted from training and every
metric in the README is invalid.
"""
import pandas as pd
from dispute_autopilot.config import load_features
from dispute_autopilot.features.builder import build_features, extract_categories


def test_single_row_matches_batch_row(batch):
    """Values agree between a batch build and a single-row serve build."""
    full = build_features(batch)
    cats = extract_categories(full)
    for i in [0, 17, 49]:
        single = build_features(batch.iloc[[i]], categories=cats)
        for col in full.columns:
            a, b = full[col].iloc[i], single[col].iloc[0]
            if pd.isna(a) and pd.isna(b):
                continue
            assert a == b, f"train/serve skew in {col} at row {i}: {a} != {b}"


def test_categorical_CODES_match_not_just_values(batch):
    """LightGBM consumes .cat.codes, so codes are what must agree.

    Comparing values alone is blind to category-set skew: the same string can
    carry a different integer in a batch build than in a single-row build.
    """
    fc = load_features()
    full = build_features(batch)
    cats = extract_categories(full)
    for i in [0, 17, 49]:
        single = build_features(batch.iloc[[i]], categories=cats)
        for col in fc.categorical:
            assert full[col].cat.codes.iloc[i] == single[col].cat.codes.iloc[0], (
                f"categorical code skew in {col} at row {i}"
            )


def test_the_parity_guard_can_actually_detect_code_skew(batch):
    """Guard the guard.

    Without fixed categories, per-call inference MUST produce divergent codes.
    If this ever stops being true, the two tests above have gone vacuous and are
    protecting nothing — which is exactly the failure this suite once shipped.
    """
    fc = load_features()
    full = build_features(batch)
    diverged = False
    for i in [0, 17, 49]:
        naive = build_features(batch.iloc[[i]])   # no categories -> re-inferred
        for col in fc.categorical:
            if full[col].cat.codes.iloc[i] != naive[col].cat.codes.iloc[0]:
                diverged = True
    assert diverged, (
        "expected naive per-call category inference to diverge; if it does not, "
        "the parity tests above are no longer testing anything"
    )
