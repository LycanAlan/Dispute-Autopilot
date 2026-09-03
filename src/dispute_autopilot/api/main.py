"""FastAPI surface. One meaningful endpoint; this is a demo, not a platform."""
import json
from functools import lru_cache

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from dispute_autopilot.casefile.store import VaultStore
from dispute_autopilot.config import SITE_DATA_DIR
from dispute_autopilot.contracts import Decision, Dispute
from dispute_autopilot.model.predict import Scorer
from dispute_autopilot.triage import triage

app = FastAPI(title="Dispute Autopilot", version="0.1.0")

# The site is a separate origin from this API in every deployment that exists:
# Vite on 5173 in development, GitHub Pages in production. Without these the
# browser fetches successfully and then discards the response before the page
# sees it, which looks exactly like the API being down.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://lycanalan.github.io",
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


class TriageRequest(BaseModel):
    transaction_id: int
    amount_inr: float
    reason_code: str = "fraud_card_absent"
    transaction: dict


@lru_cache(maxsize=1)
def _deps():
    return Scorer.load(), VaultStore()


@lru_cache(maxsize=1)
def _snapshot() -> dict:
    path = SITE_DATA_DIR / "snapshot.json"
    if not path.exists():
        raise HTTPException(
            status_code=503,
            detail="frontend/data/snapshot.json missing; "
                   "run `python -m scripts.export_site_data`",
        )
    return json.loads(path.read_text())


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/demo/cases")
def demo_cases() -> dict:
    """The pre-selected demo rows, each carrying the features POST /triage wants.

    Served out of the baked snapshot rather than the dataset: load_raw() is a
    700 MB CSV read, which no HTTP request should be doing. A case is null when
    that decision is not reachable on this data -- see snapshot notes.
    """
    return _snapshot()["cases"]


@app.get("/metrics")
def metrics() -> dict:
    """Both report files, verbatim. Family A and B never merge; C is separate."""
    # The repo-root `eval` package holds the ONE definition of where reports
    # live. Imported here, not at module scope, so the installed package stays
    # importable on a machine that has the wheel but not the repo.
    from eval import REPORTS

    out = {}
    for key, name in (("metrics", "metrics.json"),
                      ("generation_metrics", "generation_metrics.json")):
        path = REPORTS / name
        if not path.exists():
            raise HTTPException(
                status_code=503,
                detail=f"eval/reports/{name} missing; run `python -m eval.run_eval`",
            )
        out[key] = json.loads(path.read_text())
    return out


@app.post("/disputes/{dispute_id}/triage", response_model=Decision)
def triage_dispute(dispute_id: str, req: TriageRequest) -> Decision:
    scorer, vault = _deps()
    dispute = Dispute(dispute_id=dispute_id, transaction_id=req.transaction_id,
                      amount_inr=req.amount_inr, reason_code=req.reason_code)
    try:
        return triage(dispute, pd.DataFrame([req.transaction]), scorer, vault)
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=f"missing field: {exc}") from exc
