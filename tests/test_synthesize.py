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


def test_absent_avs_flags_do_not_become_an_assertion_of_mismatch():
    """Missing data must not be filed as adverse evidence.

    M1/M2/M6 are absent in 57%/57%/23% of IEEE-CIS rows. Encoding absence as
    'AVS mismatch' fabricates a failed billing check -- the mirror image of the
    fabrication the groundedness verifier exists to prevent.
    """
    import numpy as np

    cf = synthesize_casefile(_row(M1=np.nan, M2=np.nan, M6=np.nan),
                             Posture.ACTIVE, seed=1)
    assert "billing_proof" not in cf.items, (
        "no AVS result means no billing proof; filing a placeholder lets the "
        "completeness gate pass on evidence that does not exist"
    )
    for item in cf.items.values():
        assert "mismatch" not in item.value.lower()


def test_absent_billing_proof_makes_the_case_incomplete():
    """The consequence that matters: these cases must become REVIEW."""
    import numpy as np
    from dispute_autopilot.casefile.completeness import assess

    cf = synthesize_casefile(_row(M1=np.nan, M2=np.nan, M6=np.nan),
                             Posture.ACTIVE, seed=1)
    _, missing = assess(cf, "fraud_card_absent")
    assert "billing_proof" in missing


def test_a_single_present_flag_is_still_usable_evidence():
    """Partial data is not absent data -- one recorded F is a real mismatch."""
    import numpy as np

    cf = synthesize_casefile(_row(M1="F", M2=np.nan, M6=np.nan),
                             Posture.ACTIVE, seed=1)
    assert "mismatch" in cf.items["billing_proof"].value.lower()
    assert "F/-/-" in cf.items["billing_proof"].value
