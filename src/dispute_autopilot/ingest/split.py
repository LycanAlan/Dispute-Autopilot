"""Temporal 70/10/20 split.

A random split leaks badly on this dataset: the label definition marks
transactions posterior to a chargeback and linked by account, email or billing
address, which clusters card entities across any random partition. Protocol
precedent: Amazon Science Fraud Dataset Benchmark (arXiv 2208.14417) uses a
time-based split for IEEE-CIS.
"""
import pandas as pd

TRAIN_FRAC = 0.70
CALIB_FRAC = 0.10


def temporal_split(
    df: pd.DataFrame, matured_max_day: int | None = None
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    if not df["TransactionDT"].is_monotonic_increasing:
        raise ValueError("input must be sorted by TransactionDT ascending")

    if matured_max_day is not None:
        df = df[df["TransactionDT"] // 86400 <= matured_max_day]

    n = len(df)
    # Each boundary is derived from its OWN fraction and then accumulated.
    # int(n * (TRAIN_FRAC + CALIB_FRAC)) looks equivalent and is not:
    # 0.70 + 0.10 == 0.7999999999999999 in IEEE-754, so int() truncates a
    # row short and calib/test come out 99/201 instead of 100/200.
    i_train = int(n * TRAIN_FRAC)
    i_calib = i_train + int(n * CALIB_FRAC)
    return (
        df.iloc[:i_train].reset_index(drop=True),
        df.iloc[i_train:i_calib].reset_index(drop=True),
        df.iloc[i_calib:].reset_index(drop=True),
    )
