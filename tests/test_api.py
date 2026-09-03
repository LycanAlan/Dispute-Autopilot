# tests/test_api.py
import json

from fastapi.testclient import TestClient

from dispute_autopilot.api.main import app
from eval import REPORTS

client = TestClient(app)


def test_health_endpoint_reports_ok():
    assert client.get("/health").json()["status"] == "ok"


def test_the_site_origin_is_allowed_through_cors():
    """A missing header here is invisible in curl and fatal in a browser."""
    response = client.get("/health", headers={"Origin": "https://lycanalan.github.io"})
    assert response.headers["access-control-allow-origin"] == "https://lycanalan.github.io"


def test_the_vite_dev_origin_is_allowed_through_cors():
    response = client.get("/health", headers={"Origin": "http://localhost:5173"})
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_demo_cases_carry_everything_a_triage_post_needs():
    cases = client.get("/demo/cases").json()
    present = [c for c in cases.values() if c is not None]
    assert present, "no demo case is reachable; the live panel has nothing to submit"
    for case in present:
        assert {"transaction_id", "amount_inr", "reason_code", "features"} <= set(case)


def test_metrics_returns_both_report_files_unchanged():
    payload = client.get("/metrics").json()
    assert payload["metrics"] == json.loads((REPORTS / "metrics.json").read_text())
    assert payload["generation_metrics"] == json.loads(
        (REPORTS / "generation_metrics.json").read_text()
    )
