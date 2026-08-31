# tests/test_calibrate.py
import numpy as np
from sklearn.isotonic import IsotonicRegression
from dispute_autopilot.model.calibrate import apply_calibrator


def test_calibration_maps_scores_into_unit_interval_monotonically():
    iso = IsotonicRegression(out_of_bounds="clip")
    iso.fit([0.1, 0.4, 0.9], [0.02, 0.20, 0.75])
    out = apply_calibrator(iso, np.array([0.0, 0.1, 0.4, 0.9, 1.0]))
    assert out.min() >= 0.0 and out.max() <= 1.0
    assert np.all(np.diff(out) >= -1e-9)
