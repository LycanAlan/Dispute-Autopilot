"""FastAPI surface. One meaningful endpoint; this is a demo, not a platform."""
from functools import lru_cache

import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from dispute_autopilot.casefile.store import VaultStore
from dispute_autopilot.contracts import Decision, Dispute
from dispute_autopilot.model.predict import Scorer
from dispute_autopilot.triage import triage

app = FastAPI(title="Dispute Autopilot", version="0.1.0")


class TriageRequest(BaseModel):
    transaction_id: int
    amount_inr: float
    reason_code: str = "fraud_card_absent"
    transaction: dict


@lru_cache(maxsize=1)
def _deps():
    return Scorer.load(), VaultStore()


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/disputes/{dispute_id}/triage", response_model=Decision)
def triage_dispute(dispute_id: str, req: TriageRequest) -> Decision:
    scorer, vault = _deps()
    dispute = Dispute(dispute_id=dispute_id, transaction_id=req.transaction_id,
                      amount_inr=req.amount_inr, reason_code=req.reason_code)
    try:
        return triage(dispute, pd.DataFrame([req.transaction]), scorer, vault)
    except KeyError as exc:
        raise HTTPException(status_code=400, detail=f"missing field: {exc}") from exc
