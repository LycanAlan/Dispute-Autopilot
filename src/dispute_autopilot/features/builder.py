"""THE feature builder. Imported by both training and serving.

Do not write a second feature path. Task 2.2 enforces this with a parity test;
train/serve skew is the failure mode a payments reviewer looks for first.

CATEGORY STABILITY — the subtle half of that guarantee. LightGBM consumes a
pandas category column's `.cat.codes`, not its values. If categories are inferred
per call, a batch build and a single-row serve build assign DIFFERENT integers to
the same value, and every live score is computed on wrong codes while every batch
metric still looks correct. So the fitted category sets are captured at training
time and passed back in at serving time. Never let serving infer its own.
"""
import numpy as np
import pandas as pd

from dispute_autopilot.config import load_features


def build_features(
    df: pd.DataFrame,
    categories: dict[str, pd.CategoricalDtype] | None = None,
) -> pd.DataFrame:
    """`categories` None means fit (training); provided means apply (serving).

    An unseen category at serve time becomes NaN, which is the correct and
    honest encoding for a value the model never trained on.
    """
    fc = load_features()
    out = pd.DataFrame(index=df.index)

    for col in fc.numeric:
        out[col] = pd.to_numeric(df[col], errors="coerce") if col in df else np.nan

    amt = pd.to_numeric(df.get("TransactionAmt"), errors="coerce")
    out["amt_log"] = np.log1p(amt)
    out["amt_decimal"] = (amt - np.floor(amt)).round(6)
    out["hour_of_day"] = (df["TransactionDT"] // 3600) % 24

    p = df.get("P_emaildomain")
    r = df.get("R_emaildomain")
    if p is None or r is None:
        out["email_domain_mismatch"] = 0
    else:
        # .astype(object) BEFORE comparing. load_raw()'s downcast() converts both
        # columns to pandas `category` dtype, inferring each column's categories
        # independently -- 43 domains for P, 27 for R on the real data. Pandas
        # raises TypeError when comparing two Categoricals whose category sets
        # differ, so comparing the raw columns crashes on real input while
        # passing on any fixture that supplies plain strings.
        p = p.astype("object")
        r = r.astype("object")
        both = p.notna() & r.notna()
        out["email_domain_mismatch"] = np.where(both & (p != r), 1, 0)

    for col in fc.categorical:
        series = df[col] if col in df else pd.Series([None] * len(df), index=df.index)
        series = series.astype("object")
        if categories is not None and col in categories:
            out[col] = series.astype(categories[col])   # serving: fixed codes
        else:
            out[col] = series.astype("category")        # training: fit
    return out[fc.all_model_columns]


def extract_categories(features: pd.DataFrame) -> dict[str, pd.CategoricalDtype]:
    """Capture fitted category sets so serving reproduces identical codes.

    Call this once on the TRAINING feature frame and persist the result beside
    the model. Without it, serving silently re-derives its own codes.
    """
    fc = load_features()
    return {
        col: pd.CategoricalDtype(categories=features[col].cat.categories)
        for col in fc.categorical
    }
