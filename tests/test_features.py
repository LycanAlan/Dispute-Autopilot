import numpy as np
import pandas as pd
from dispute_autopilot.config import load_features
from dispute_autopilot.features.builder import build_features


def _row(**over):
    base = {
        "TransactionID": 1, "TransactionDT": 86400 * 2 + 3600 * 14,
        "TransactionAmt": 149.75, "ProductCD": "W", "card4": "visa",
        "card6": "debit", "P_emaildomain": "gmail.com",
        "R_emaildomain": "yahoo.com", "DeviceType": "desktop",
        "dist1": 12.0, "dist2": np.nan,
        "C1": 1.0, "C2": 1.0, "C13": 2.0, "C14": 1.0,
        "D1": 0.0, "D2": np.nan, "D15": 3.0,
        "M1": "T", "M2": "T", "M3": "F", "M4": "M0", "M6": "T",
    }
    base.update(over)
    return pd.DataFrame([base])


def test_produces_exactly_the_configured_columns():
    out = build_features(_row())
    assert list(out.columns) == load_features().all_model_columns


def test_amt_decimal_extracts_the_fractional_part():
    out = build_features(_row(TransactionAmt=149.75))
    assert abs(out["amt_decimal"].iloc[0] - 0.75) < 1e-6


def test_hour_of_day_derives_from_transaction_dt():
    out = build_features(_row(TransactionDT=86400 * 2 + 3600 * 14))
    assert out["hour_of_day"].iloc[0] == 14


def test_email_mismatch_flag():
    assert build_features(_row())["email_domain_mismatch"].iloc[0] == 1
    same = _row(R_emaildomain="gmail.com")
    assert build_features(same)["email_domain_mismatch"].iloc[0] == 0


def test_missing_optional_columns_do_not_raise():
    df = _row().drop(columns=["dist2", "D2"])
    out = build_features(df)
    assert out["dist2"].isna().all()
