import pandas as pd
from dispute_autopilot.contracts import CaseFile, Posture
from dispute_autopilot.casefile.synthesize import synthesize_casefile


def _row(**over):
    base = {"TransactionID": 42, "TransactionAmt": 2499.0, "TransactionDT": 86400,
            "M1": "T", "M2": "T", "M6": "T", "dist1": 5.0,
            "P_emaildomain": "gmail.com", "R_emaildomain": "gmail.com",
            "DeviceType": "desktop", "DeviceInfo": "Windows"}
    base.update(over)
    return pd.Series(base)


def test_generation_is_deterministic():
    a = synthesize_casefile(_row(), Posture.ACTIVE, seed=7)
    b = synthesize_casefile(_row(), Posture.ACTIVE, seed=7)
    assert a.model_dump() == b.model_dump()


def test_billing_proof_reflects_the_real_match_flags():
    matched = synthesize_casefile(_row(M1="T", M2="T", M6="T"), Posture.ACTIVE, seed=1)
    assert "match" in matched.items["billing_proof"].value.lower()
    unmatched = synthesize_casefile(_row(M1="F", M2="F", M6="F"), Posture.ACTIVE, seed=1)
    assert "mismatch" in unmatched.items["billing_proof"].value.lower()


def test_passive_posture_yields_fewer_items_than_active():
    p = synthesize_casefile(_row(), Posture.PASSIVE, seed=1)
    a = synthesize_casefile(_row(), Posture.ACTIVE, seed=1)
    assert len(p.items) < len(a.items)


def test_none_posture_yields_an_empty_vault():
    assert synthesize_casefile(_row(), Posture.NONE, seed=1).items == {}
