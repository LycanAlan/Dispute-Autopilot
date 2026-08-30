import numpy as np
import pandas as pd
from dispute_autopilot.economics.baselines import baseline_predictions


def _df():
    return pd.DataFrame({
        "TransactionAmt": [100.0, 20000.0, 500.0],
        "dist1": [1.0, 400.0, np.nan],
        "P_emaildomain": ["gmail.com", "gmail.com", "a.com"],
        "R_emaildomain": ["gmail.com", "yahoo.com", "a.com"],
    })


def test_none_flags_nothing_and_all_flags_everything():
    assert baseline_predictions(_df(), "none").sum() == 0
    assert baseline_predictions(_df(), "all").all()


def test_rules_flag_the_high_amount_distant_mismatched_row():
    preds = baseline_predictions(_df(), "rules")
    assert preds[1] == 1
    assert preds[0] == 0
