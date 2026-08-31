from dispute_autopilot.contracts import CaseFile, Posture
from dispute_autopilot.casefile.store import VaultStore, choose_posture


def test_posture_escalates_with_expected_exposure():
    assert choose_posture(0.001, 100.0) is Posture.NONE
    assert choose_posture(0.9, 100000.0) is Posture.ACTIVE


def test_posture_is_monotone_in_exposure():
    ladder = [choose_posture(p, 50000.0) for p in (0.001, 0.05, 0.9)]
    order = {Posture.NONE: 0, Posture.PASSIVE: 1, Posture.ACTIVE: 2}
    assert [order[p] for p in ladder] == sorted(order[p] for p in ladder)


def test_vault_round_trips_a_casefile(tmp_path):
    store = VaultStore(root=tmp_path)
    cf = CaseFile(transaction_id=99, posture=Posture.PASSIVE, items={})
    store.put(cf)
    assert store.get(99).transaction_id == 99
    assert store.get(12345) is None
