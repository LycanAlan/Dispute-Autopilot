# tests/test_split.py
import pandas as pd
import pytest
from dispute_autopilot.ingest.split import temporal_split


def _frame(n=1000):
    return pd.DataFrame({"TransactionDT": range(n), "isFraud": [0] * n})


def test_split_is_ordered_in_time_with_no_overlap():
    train, calib, test = temporal_split(_frame())
    assert train["TransactionDT"].max() < calib["TransactionDT"].min()
    assert calib["TransactionDT"].max() < test["TransactionDT"].min()


def test_split_proportions_are_70_10_20():
    train, calib, test = temporal_split(_frame())
    assert len(train) == 700 and len(calib) == 100 and len(test) == 200


def test_matured_window_truncates_the_tail():
    df = pd.DataFrame({"TransactionDT": [d * 86400 for d in range(100)],
                       "isFraud": [0] * 100})
    train, calib, test = temporal_split(df, matured_max_day=63)
    assert test["TransactionDT"].max() // 86400 <= 63


def test_rejects_unsorted_input():
    df = pd.DataFrame({"TransactionDT": [5, 1, 3], "isFraud": [0, 0, 0]})
    with pytest.raises(ValueError):
        temporal_split(df)
