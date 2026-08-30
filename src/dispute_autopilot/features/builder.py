"""THE feature builder. Imported by both training and serving.

Do not write a second feature path. Task 2.2 enforces this with a parity test;
train/serve skew is the failure mode a payments reviewer looks for first.
"""
import numpy as np
import pandas as pd

from dispute_autopilot.config import load_features


def build_features(df: pd.DataFrame) -> pd.DataFrame:
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
        both = p.notna() & r.notna()
        out["email_domain_mismatch"] = np.where(both & (p != r), 1, 0)

    for col in fc.categorical:
        series = df[col] if col in df else pd.Series([None] * len(df), index=df.index)
        out[col] = series.astype("object").astype("category")

    return out[fc.all_model_columns]
