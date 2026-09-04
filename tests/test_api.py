# tests/test_api.py
import json

from fastapi.testclient import TestClient

import dispute_autopilot.api.main as main_module
from dispute_autopilot.api.main import app
from dispute_autopilot.assembler import assemble as assemble_module
from eval import REPORTS

client = TestClient(app)

_RUN_RECORD_KEYS = {
    "transaction_id", "amount_inr", "p_chargeback", "posture",
    "w_completeness", "missing_required", "delta_ev_inr", "action",
    "elapsed_ms",
}


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


# /run's own row pool (_rows) reads the real 700 MB dataset the first time it
# is called -- exactly the cost demo_cases's docstring says no request should
# pay. These tests swap in the small synthetic `batch` fixture every other
# test module already uses against the real Scorer, so /run's own logic is
# exercised without that read.


def test_run_streams_one_record_per_row_then_a_summary_line(batch, monkeypatch):
    monkeypatch.setattr(main_module, "_rows", lambda: batch)

    response = client.post("/run", json={"n": 5, "seed": 1})

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/x-ndjson")
    lines = [line for line in response.text.strip().splitlines() if line]
    assert len(lines) == 6   # 5 disputes + 1 summary

    records = [json.loads(line) for line in lines[:-1]]
    assert len(records) == 5
    seen_ids = {r["transaction_id"] for r in records}
    assert len(seen_ids) == 5, "five distinct real rows, not one row repeated"
    for record in records:
        assert _RUN_RECORD_KEYS <= set(record)
        assert record["action"] in ("CONTEST", "ACCEPT", "REVIEW")
        assert record["elapsed_ms"] > 0
        if record["action"] == "REVIEW" and record["missing_required"]:
            # The evidence gate refusing has to be visible, not just the verdict.
            assert isinstance(record["missing_required"], list)

    summary = json.loads(lines[-1])["summary"]
    assert summary["n"] == 5
    assert sum(summary["counts"].values()) == 5
    assert set(summary["counts"]) == {"CONTEST", "ACCEPT", "REVIEW"}
    assert summary["total_wall_ms"] > 0
    assert summary["exposure_decided_inr"] == sum(
        r["amount_inr"] for r in records if r["action"] != "REVIEW"
    )


def test_run_rejects_n_above_the_200_cap():
    response = client.post("/run", json={"n": 201, "seed": 0})
    assert response.status_code == 422


def test_run_is_reproducible_for_the_same_seed(batch, monkeypatch):
    """Same seed picks the same rows and reaches the same decisions.

    elapsed_ms and total_wall_ms are real wall-clock measurements, so those
    two fields are the only ones excluded from the comparison.
    """
    monkeypatch.setattr(main_module, "_rows", lambda: batch)

    def _stable(text: str) -> list[dict]:
        parsed = [json.loads(line) for line in text.strip().splitlines() if line]
        for record in parsed:
            record.pop("elapsed_ms", None)
            record.get("summary", {}).pop("total_wall_ms", None)
        return parsed

    first = client.post("/run", json={"n": 5, "seed": 7}).text
    second = client.post("/run", json={"n": 5, "seed": 7}).text
    assert _stable(first) == _stable(second)


def test_run_never_reaches_a_paid_model_provider(batch, monkeypatch):
    """The hard constraint: /run must never spend a rupee on a live model call.

    USAGE_LOG in assemble.py is appended to ONLY by anthropic_provider and
    openai_provider (see assemble.py); assemble_deterministic never touches
    it. /run passes assemble_deterministic explicitly, so this list staying
    exactly as long as it started is the check that the provider seam in
    assemble() -- which resolves ANTHROPIC_API_KEY when no assembler is
    given -- was never entered.
    """
    monkeypatch.setattr(main_module, "_rows", lambda: batch)
    before = len(assemble_module.USAGE_LOG)

    client.post("/run", json={"n": 20, "seed": 3})

    assert len(assemble_module.USAGE_LOG) == before


def test_run_origin_is_allowed_through_cors(batch, monkeypatch):
    monkeypatch.setattr(main_module, "_rows", lambda: batch)
    response = client.post(
        "/run", json={"n": 1, "seed": 0}, headers={"Origin": "http://localhost:5173"}
    )
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
