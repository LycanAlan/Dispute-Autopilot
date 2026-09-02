# tests/test_api.py
from fastapi.testclient import TestClient
from dispute_autopilot.api.main import app


def test_health_endpoint_reports_ok():
    assert TestClient(app).get("/health").json()["status"] == "ok"
