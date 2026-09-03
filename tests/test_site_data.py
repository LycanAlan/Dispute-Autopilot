"""The baked frontend payload must not drift away from the artifacts it quotes.

frontend/data/ is committed, so it can go stale silently: `eval.run_eval` writes
new metrics, nobody re-runs the exporter, and the site keeps showing last week's
figures with a "measured" label on them. These tests fail when that happens.
"""
import json
from pathlib import Path

from dispute_autopilot.config import SITE_DATA_DIR
from dispute_autopilot.ingest.split import CALIB_FRAC, TRAIN_FRAC
from eval import REPORTS

REPO = Path(__file__).resolve().parents[1]
SNAPSHOT = json.loads((SITE_DATA_DIR / "snapshot.json").read_text())
METRICS = json.loads((REPORTS / "metrics.json").read_text())
GENERATION = json.loads((REPORTS / "generation_metrics.json").read_text())


def test_family_a_is_verbatim_from_the_metrics_report():
    """Not approximately equal. The site claims these are the measured numbers."""
    assert SNAPSHOT["family_a"] == METRICS["family_a"]


def test_family_b_is_verbatim_from_the_metrics_report():
    assert SNAPSHOT["family_b"] == METRICS["family_b"]


def test_family_c_is_verbatim_from_the_generation_report():
    assert SNAPSHOT["family_c"] == GENERATION


def test_the_split_fractions_come_from_the_splitter():
    assert SNAPSHOT["split"]["train_frac"] == TRAIN_FRAC
    assert SNAPSHOT["split"]["calib_frac"] == CALIB_FRAC


def test_the_split_planes_are_placed_by_time_not_by_row_fraction():
    """train_end_x is where the 70% ROW boundary falls on the TIME axis.

    Those are different numbers -- transaction density is not uniform -- and a
    plane drawn at 0.70 would explain the temporal split by mis-drawing it.
    """
    split = SNAPSHOT["split"]
    assert split["train_end_x"] < split["train_end_row_frac"]
    assert split["calib_end_x"] < split["calib_end_row_frac"]


def test_the_point_buffer_is_four_float32_per_sampled_point():
    size = (SITE_DATA_DIR / "points.bin").stat().st_size
    assert size == SNAPSHOT["n_sampled"] * 4 * 4


def test_the_sample_keeps_both_classes():
    sampling = SNAPSHOT["sampling"]
    assert sampling["n_positive_sampled"] >= sampling["minimum_positives"]
    assert sampling["n_positive_sampled"] + sampling["n_negative_sampled"] \
        == SNAPSHOT["n_sampled"]


def test_the_fabricated_claim_is_the_same_one_the_streamlit_demo_injects():
    """The exporter copies ui/app.py's closure because it cannot import it.

    Two copies of a literal drift. This is the guard: change one and this fails.
    """
    awb = SNAPSHOT["refusal"]["fabricated_claim"]
    assert awb in (REPO / "ui" / "app.py").read_text()
    assert awb in (REPO / "scripts" / "export_site_data.py").read_text()


def test_the_refusal_payload_records_the_gate_actually_firing():
    refusal = SNAPSHOT["refusal"]
    assert (refusal["before"], refusal["after"]) == ("CONTEST", "REVIEW")
    ungrounded = [c for c in refusal["claims"] if not c["grounded"]]
    assert [c["text"] for c in ungrounded] == [refusal["fabricated_claim"]]
    assert refusal["refused_claims"] == [refusal["fabricated_claim"]]


def test_every_demo_case_carries_the_decision_it_is_filed_under():
    expected = {"contest": "CONTEST", "accept": "ACCEPT", "review": "REVIEW"}
    for name, case in SNAPSHOT["cases"].items():
        if case is None:
            # A null case is a measured absence, not an oversight, and the
            # snapshot has to say why before the site can be honest about it.
            assert SNAPSHOT["notes"][f"{name}_case"]
            continue
        assert case["decision"]["action"] == expected[name]
        assert case["features"], "the API replays this dict; it cannot be empty"
