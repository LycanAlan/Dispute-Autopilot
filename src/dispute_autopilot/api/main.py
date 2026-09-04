"""FastAPI surface. One meaningful endpoint; this is a demo, not a platform."""
import json
import time
from functools import lru_cache
from typing import Iterator

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from dispute_autopilot.assembler.assemble import assemble_deterministic
from dispute_autopilot.casefile.store import VaultStore, choose_posture
from dispute_autopilot.casefile.synthesize import synthesize_casefile
from dispute_autopilot.config import SITE_DATA_DIR
from dispute_autopilot.contracts import Action, Decision, Dispute
from dispute_autopilot.economics.cost_model import to_inr
from dispute_autopilot.ingest.load import load_raw
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


# Matches eval/find_demo_rows.py's default and export_site_data.py's
# DEMO_SAMPLE_N: the earliest 5,000 rows by transaction time, out of 590,540.
# load_raw() always reads BOTH full CSVs (~700 MB) before this head-sample
# happens -- sample_n does not make the read itself cheaper -- so the point
# of sampling here is a smaller resident frame, not a faster load.
_POOL_SAMPLE_N = 5_000

# The only reason code defined in config/costs.yaml, and the one every other
# real-pipeline call site (find_demo_rows.py, export_site_data.py, live.ts's
# demo cases) uses.
_REASON_CODE = "fraud_card_absent"


@lru_cache(maxsize=1)
def _rows() -> pd.DataFrame:
    """The same real rows eval/find_demo_rows.py samples. Loaded once per process.

    The full CSV read takes several seconds -- see the module note on
    demo_cases below -- so the first POST /run in a server's life pays that
    cost before its first record streams. Every call after is instant.
    """
    return load_raw(sample_n=_POOL_SAMPLE_N)


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


class RunRequest(BaseModel):
    n: int = Field(default=50, ge=1, le=200)
    seed: int = 0


def _triage_batch(n: int, seed: int) -> Iterator[bytes]:
    """One real row triaged per line, as it finishes. The last line is a summary.

    Every field in a record comes straight off the real Decision this row's
    real triage() call returned -- see decision.py -- nothing here computes or
    invents a number. `assemble_deterministic` is passed explicitly so a
    CONTEST row can never reach the provider seam that resolves an API key:
    see assemble.py's `assemble()`, which only calls a provider when its
    `assembler` argument is left as None. This call site never leaves it None.
    """
    scorer, vault = _deps()
    pool = _rows()
    picked = np.random.default_rng(seed).choice(len(pool), size=n, replace=False)
    indices = sorted(int(i) for i in picked)

    counts = {"CONTEST": 0, "ACCEPT": 0, "REVIEW": 0}
    exposure_decided_inr = 0.0
    started = time.perf_counter()   # after the pool is loaded, before any row is worked

    for i in indices:
        row = pool.iloc[[i]]
        row_started = time.perf_counter()

        amount = float(to_inr(row["TransactionAmt"].iloc[0]))
        score = scorer.score_one(row)
        posture = choose_posture(score.p_chargeback, amount)
        casefile = synthesize_casefile(row.iloc[0], posture, seed=i)
        vault.put(casefile)

        dispute = Dispute(
            dispute_id=f"run_{i}",
            transaction_id=int(row["TransactionID"].iloc[0]),
            amount_inr=amount,
            reason_code=_REASON_CODE,
        )
        decision = triage(dispute, row, scorer, vault, assemble_deterministic)
        elapsed_ms = (time.perf_counter() - row_started) * 1000.0

        counts[decision.action.value] += 1
        # REVIEW is the system declining to decide -- the evidence gate or the
        # margin sent it to a human -- so it never counts toward exposure a
        # decision actually disposed of.
        if decision.action is not Action.REVIEW:
            exposure_decided_inr += amount

        record = {
            "transaction_id": dispute.transaction_id,
            "amount_inr": amount,
            "p_chargeback": decision.p_chargeback,
            "posture": posture.value,
            "w_completeness": decision.w_completeness,
            "missing_required": decision.missing_required,
            "delta_ev_inr": decision.delta_ev_inr,
            "action": decision.action.value,
            "elapsed_ms": elapsed_ms,
        }
        yield (json.dumps(record) + "\n").encode()

    summary = {
        "summary": {
            "n": len(indices),
            "counts": counts,
            "exposure_decided_inr": exposure_decided_inr,
            "total_wall_ms": (time.perf_counter() - started) * 1000.0,
        }
    }
    yield (json.dumps(summary) + "\n").encode()


@app.post("/run")
def run(req: RunRequest) -> StreamingResponse:
    """Triage `n` real rows, live, and stream one NDJSON record per row.

    A plain (non-async) generator: Starlette runs it in a thread pool and
    sends each line to the client the moment it is produced, rather than
    buffering the whole run behind one response. That is what lets the
    frontend render a row every ~178 ms instead of waiting on the total.
    """
    return StreamingResponse(
        _triage_batch(req.n, req.seed), media_type="application/x-ndjson"
    )
