from dispute_autopilot.config import ASSUMPTION_NOTICE, load_costs, load_features


def test_costs_expose_reason_code_requirements():
    costs = load_costs()
    rc = costs.reason_codes["fraud_card_absent"]
    assert "billing_proof" in rc.required
    assert costs.base_win_rate_fraud_coded == 0.171


def test_features_config_lists_are_disjoint():
    fc = load_features()
    assert set(fc.numeric).isdisjoint(set(fc.categorical))


def test_assumption_notice_is_non_empty_and_mentions_it_is_unvalidated():
    assert "not validated" in ASSUMPTION_NOTICE.lower()
