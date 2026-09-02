import numpy as np
import pandas as pd
from dispute_autopilot.config import load_costs
from dispute_autopilot.economics.baselines import baseline_predictions, compare_baselines


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


def test_rules_handles_missing_R_emaildomain_without_crashing():
    # p present, r absent -- the asymmetric case the original guard missed
    # (`r.notna()` on a None column raised AttributeError).
    df = _df().drop(columns=["R_emaildomain"])
    preds = baseline_predictions(df, "rules")
    assert preds[1] == 1  # still flagged: amount and distance alone qualify
    assert preds[0] == 0


def test_rules_handles_missing_P_emaildomain_without_crashing():
    # r present, p absent -- the reverse asymmetric case.
    df = _df().drop(columns=["P_emaildomain"])
    preds = baseline_predictions(df, "rules")
    assert preds[1] == 1
    assert preds[0] == 0


def test_compare_baselines_threads_costs_through_every_cell():
    df = _df().assign(isFraud=[0, 1, 0])
    model_scores = np.array([0.1, 0.9, 0.1])
    default_out = compare_baselines(df, model_scores, threshold=0.5)

    variant = load_costs().model_copy(update={"contest_fee_inr": 0.0})
    variant_out = compare_baselines(df, model_scores, threshold=0.5, costs=variant)

    # With contest_fee_inr zeroed out, every cell that carries a fee (here:
    # the "model" and "rules" baselines both flag row 1, a true positive)
    # must change. If compare_baselines silently fell back to the global
    # config, default_out and variant_out would be identical.
    assert default_out["model"].net_inr != variant_out["model"].net_inr
    assert default_out["rules"].net_inr != variant_out["rules"].net_inr


def test_rules_baseline_honours_variant_threshold_not_the_global_config():
    # Row 1 is USD 20,000, which to_inr() converts to INR 1,660,000 -- so the
    # variant threshold must sit ABOVE that to change the answer. Amounts are
    # USD in this dataset and thresholds are rupees; a variant of INR 1,000,000
    # looks large and is in fact below the converted amount.
    # If baseline_predictions reads load_costs() instead of the passed `costs`,
    # this variant is silently ignored and predictions are identical to the
    # default -- the exact bug being guarded against.
    df = _df()
    default_preds = baseline_predictions(df, "rules")
    assert default_preds[1] == 1  # sanity: default rules flag row 1

    from dispute_autopilot.config import BaselineRules

    variant = load_costs().model_copy(
        update={
            "baseline_rules": BaselineRules(amount_inr=5_000_000.0, dist=1_000_000.0)
        }
    )
    variant_preds = baseline_predictions(df, "rules", costs=variant)
    assert variant_preds[1] == 0, (
        "variant baseline_rules thresholds were not honoured -- "
        "baseline_predictions is reading the global config instead of `costs`"
    )


def test_rules_baseline_survives_real_category_dtypes(batch):
    """The `batch` fixture goes through the production downcast(), so both email
    columns are `category` with DIFFERENT category sets -- the shape that
    crashed builder.py on real data. This site was fixed second, because no
    test fed it realistic dtypes. This is that test.
    """
    import pandas as pd

    assert isinstance(batch["P_emaildomain"].dtype, pd.CategoricalDtype)
    assert list(batch["P_emaildomain"].cat.categories) != list(
        batch["R_emaildomain"].cat.categories
    ), "fixture no longer reproduces the mismatched-category shape"

    preds = baseline_predictions(batch, "rules")
    assert len(preds) == len(batch)
    assert set(preds) <= {0, 1}
