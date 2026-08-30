"""Shared fixtures. pytest discovers conftest.py automatically — never import
fixtures from another test module."""
import numpy as np
import pandas as pd
import pytest


@pytest.fixture
def batch():
    rng = np.random.default_rng(0)
    n = 50
    return pd.DataFrame({
        "TransactionID": range(n),
        "TransactionDT": rng.integers(0, 86400 * 180, n),
        "TransactionAmt": rng.uniform(10, 5000, n).round(2),
        "ProductCD": rng.choice(["W", "C", "H"], n),
        "card4": rng.choice(["visa", "mastercard"], n),
        "card6": rng.choice(["debit", "credit"], n),
        "P_emaildomain": rng.choice(["gmail.com", "yahoo.com"], n),
        "R_emaildomain": rng.choice(["gmail.com", "hotmail.com"], n),
        "DeviceType": rng.choice(["desktop", "mobile"], n),
        "dist1": rng.uniform(0, 500, n), "dist2": rng.uniform(0, 500, n),
        "C1": rng.integers(1, 20, n), "C2": rng.integers(1, 20, n),
        "C13": rng.integers(1, 40, n), "C14": rng.integers(1, 20, n),
        "D1": rng.integers(0, 200, n), "D2": rng.integers(0, 200, n),
        "D15": rng.integers(0, 200, n),
        "M1": rng.choice(["T", "F"], n), "M2": rng.choice(["T", "F"], n),
        "M3": rng.choice(["T", "F"], n), "M4": rng.choice(["M0", "M1"], n),
        "M6": rng.choice(["T", "F"], n),
    })
