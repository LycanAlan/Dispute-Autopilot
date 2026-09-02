# Dispute Autopilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a three-stage chargeback loss-prevention system — predict chargeback risk, preserve evidence at transaction time, and decide contest-vs-accept on expected value with a grounded evidence assembler — with published precision/recall on a held-out temporal split.

**Architecture:** A Python package with frozen data contracts at the core. `contracts.py` defines every model passed between stages and is written first so no later task can force an interface change. One feature builder serves both training and inference, enforced by a parity test. Metrics are computed by a single `eval/run_eval.py` that regenerates every number in the README.

**Tech Stack:** Python 3.11/3.12, pandas, LightGBM, scikit-learn (isotonic calibration), Pydantic v2, FastAPI, Anthropic SDK (Claude), Streamlit, pytest, PyYAML.

**Spec:** `docs/superpowers/specs/2026-08-31-dispute-autopilot-design.md`

## Global Constraints

- **Deadline: 5 September 2026.** Scope freezes end of 3 September. After the freeze, incomplete work is cut, never fixed.
- **Python 3.11 or 3.12.** Not 3.13 (LightGBM/wheel risk under deadline).
- **Never claim novelty.** README and video position on measurement, not originality. Prior Art section is mandatory (spec §2).
- **Never blend metric families.** A = measured (real labels), B = simulated (stated assumptions), C = measured generation quality (synthetic corpus). Every reported number is labelled with its family (spec §10).
- **The §8.1 assumption disclosure** (low risk score + chargeback implies likely first-party misuse, unvalidatable on this data) must appear in the README, the video, and every `Decision` API payload.
- **One feature builder.** `features/builder.py` is imported by both training and serving. A parity test enforces this. No second implementation may exist.
- **Evidence gate is absolute.** Any missing required evidence field forces `REVIEW`, regardless of expected value. Economics never override the gate.
- **No secrets in git.** `.env` gitignored from the first commit; `.env.example` committed.
- **`data/` is gitignored.** IEEE-CIS is never committed (size and competition licensing).
- **All costs live in `config/costs.yaml`.** No magic numbers in code. Unsourced values are marked `PLACEHOLDER` inline.
- **Commit after every task.** Commit history is evaluated by the panel.

---

## File Structure

| Path | Responsibility |
|---|---|
| `config/costs.yaml` | Cost parameters, win-rate priors, reason-code evidence requirements |
| `config/features.yaml` | Feature column lists — no magic lists in code |
| `src/dispute_autopilot/contracts.py` | **Every** Pydantic model crossing a stage boundary. Frozen in Phase 0. |
| `src/dispute_autopilot/config.py` | Typed loaders for the two YAML files |
| `src/dispute_autopilot/ingest/download.py` | Kaggle download |
| `src/dispute_autopilot/ingest/load.py` | CSV load, dtype downcast, identity merge |
| `src/dispute_autopilot/ingest/split.py` | Temporal 70/10/20 split |
| `src/dispute_autopilot/features/builder.py` | The single feature builder |
| `src/dispute_autopilot/model/train.py` | LightGBM training |
| `src/dispute_autopilot/model/calibrate.py` | Isotonic calibration |
| `src/dispute_autopilot/model/predict.py` | `Scorer` — the serving path |
| `src/dispute_autopilot/economics/cost_model.py` | Rupee confusion matrix, net savings |
| `src/dispute_autopilot/economics/baselines.py` | The four baselines |
| `src/dispute_autopilot/economics/threshold.py` | EV-optimal threshold search |
| `src/dispute_autopilot/economics/decision.py` | The EV decision engine |
| `src/dispute_autopilot/casefile/synthesize.py` | Deterministic evidence generation |
| `src/dispute_autopilot/casefile/store.py` | The vault: put/get |
| `src/dispute_autopilot/casefile/completeness.py` | The `w` multiplier and required-field gate |
| `src/dispute_autopilot/assembler/prompts.py` | Prompt construction |
| `src/dispute_autopilot/assembler/assemble.py` | Claude call producing an `EvidenceBundle` |
| `src/dispute_autopilot/assembler/verify.py` | Groundedness verifier |
| `src/dispute_autopilot/razorpay/schema.py` | Razorpay evidence schema validation |
| `src/dispute_autopilot/razorpay/client.py` | Dry-run and live adapters |
| `src/dispute_autopilot/triage.py` | Orchestrates score → gate → decide → assemble |
| `src/dispute_autopilot/api/main.py` | FastAPI surface |
| `eval/gates/g1_censoring.py` | The censoring diagnostic |
| `eval/run_eval.py` | Regenerates every README number |
| `ui/app.py` | Streamlit demo console |

---

## Phase 0 — Foundations and Gates (31 Aug)

Phase 0 exists to make every later phase unable to force rework. Contracts and config are frozen here.

### Task 0.1: Repo scaffold and hygiene

**Files:**
- Create: `.gitignore`, `.env.example`, `LICENSE`, `requirements.txt`, `pytest.ini`, `pyproject.toml`, `src/dispute_autopilot/__init__.py`, `tests/__init__.py`, `eval/__init__.py`, `eval/gates/__init__.py`

**Interfaces:**
- Consumes: nothing
- Produces: an editable-installed package `dispute_autopilot`, importable from pytest, `eval/`, and `ui/` alike

- [ ] **Step 1: Initialise the repository**

```bash
cd "c:/Users/lycan/OneDrive/Desktop/projs/RazorPay_AI"
git init
git branch -M main
```

- [ ] **Step 2: Write `.gitignore` BEFORE any other file**

```
data/
.env
*.pkl
*.joblib
__pycache__/
*.pyc
.venv/
venv/
eval/reports/*.png
!eval/reports/.gitkeep
.ipynb_checkpoints/
.pytest_cache/
```

- [ ] **Step 3: Write `.env.example`**

```
RAZORPAY_KEY_ID=rzp_test_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxx
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxx
```

- [ ] **Step 4: Write `requirements.txt`**

```
pandas>=2.0
numpy>=1.24
pyarrow>=14.0
lightgbm>=4.0
scikit-learn>=1.3
matplotlib>=3.7
pydantic>=2.5
fastapi>=0.110
uvicorn>=0.27
anthropic>=0.40
python-dotenv>=1.0
pyyaml>=6.0
kaggle>=1.6
razorpay>=1.4
streamlit>=1.30
pytest>=7.4
```

- [ ] **Step 5: Write `pytest.ini`**

```ini
[pytest]
testpaths = tests
```

- [ ] **Step 6: Write `pyproject.toml`**

The package must be installed, not merely on `pytest`'s path. `eval/run_eval.py` and `ui/app.py` run outside pytest and import `dispute_autopilot`; without an editable install they fail with `ModuleNotFoundError` on Day 4, when there is no time to debug packaging.

```toml
[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.build_meta"

[project]
name = "dispute-autopilot"
version = "0.1.0"
requires-python = ">=3.11,<3.13"

[tool.setuptools.packages.find]
where = ["src"]
```

- [ ] **Step 7: Create the tree and install the package editable**

```bash
mkdir -p src/dispute_autopilot tests eval/gates eval/reports config ui docs/gates
touch src/dispute_autopilot/__init__.py tests/__init__.py
touch eval/__init__.py eval/gates/__init__.py eval/reports/.gitkeep
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
.venv/Scripts/python -m pip install -e .
```

`eval/__init__.py` is required for `python -m eval.run_eval` to resolve. Creating it now avoids a broken invocation on Day 4.

- [ ] **Step 8: Verify the environment and the import path**

```bash
.venv/Scripts/python -c "import lightgbm, pydantic, fastapi; print('deps ok')"
.venv/Scripts/python -c "import dispute_autopilot; print('package importable')"
```

Expected: both lines print. If LightGBM fails to install, you are on Python 3.13 — recreate the venv with 3.11 or 3.12. If the second line fails, the editable install did not take; re-run Step 7 before writing any code.

- [ ] **Step 9: Add MIT `LICENSE`, then commit**

```bash
git add -A
git commit -m "chore: scaffold repo, deps, and hygiene"
```

### Task 0.2: Gate G2 — Razorpay test-mode dispute availability

**Files:**
- Create: `docs/gates/G2-razorpay-test-mode.md`

**Interfaces:**
- Consumes: nothing
- Produces: a documented decision on whether `razorpay/client.py` needs a live path

**Timebox: 30 minutes. Do not exceed it.** The dry-run adapter is built either way; this only decides whether a live path is additionally worth building.

- [ ] **Step 1: Get test-mode credentials**

Sign up at razorpay.com, switch the Dashboard to **Test Mode**, and generate API keys under Settings → API Keys. Put them in `.env` (never `.env.example`).

- [ ] **Step 2: Probe the disputes endpoint**

```bash
curl -u "$RAZORPAY_KEY_ID:$RAZORPAY_KEY_SECRET" https://api.razorpay.com/v1/disputes
```

Record the exact response. An empty `items` array means the endpoint exists but no test disputes exist.

- [ ] **Step 3: Check the Dashboard for dispute creation in Test Mode**

Look for any way to raise a dispute against a test payment. Record what you find.

- [ ] **Step 4: Write the finding to `docs/gates/G2-razorpay-test-mode.md`**

Record: whether the endpoint responds, whether disputes can be created in test mode, the raw response, and the decision — `LIVE_PATH: yes` or `LIVE_PATH: no, dry-run only`. This file is cited in the README, so write it for a reader.

- [ ] **Step 5: Also record the Razorpay dispute fee**

Find the current dispute/chargeback fee from Razorpay's pricing page or docs. Record the figure **and its source URL**. If it cannot be found in the timebox, write `NOT FOUND — placeholder retained` and move on. Spec §17 open item 2.

- [ ] **Step 6: Commit**

```bash
git add docs/gates/G2-razorpay-test-mode.md
git commit -m "docs: record G2 gate result for Razorpay test-mode disputes"
```

### Task 0.3: Dataset acquisition

**Files:**
- Create: `src/dispute_autopilot/ingest/download.py`, `src/dispute_autopilot/ingest/__init__.py`

**Interfaces:**
- Consumes: nothing
- Produces: `data/raw/train_transaction.csv`, `data/raw/train_identity.csv`

- [ ] **Step 1: Accept the competition rules**

Visit `https://www.kaggle.com/c/ieee-fraud-detection/rules` and click **I Understand and Accept**. **The download 403s without this**, with an error that does not mention the cause.

- [ ] **Step 2: Install the Kaggle token**

Kaggle → Account → Create New API Token. Save `kaggle.json` to `C:\Users\<you>\.kaggle\kaggle.json`.

- [ ] **Step 3: Write `download.py`**

```python
"""Download IEEE-CIS from Kaggle. Requires competition rules acceptance."""
import zipfile
from pathlib import Path

RAW = Path(__file__).resolve().parent.parent.parent.parent / "data" / "raw"
COMPETITION = "ieee-fraud-detection"
NEEDED = ["train_transaction.csv", "train_identity.csv"]


def download() -> None:
    RAW.mkdir(parents=True, exist_ok=True)
    if all((RAW / n).exists() for n in NEEDED):
        print("already downloaded")
        return
    # Imported here, not at module scope: `import kaggle` triggers
    # api.authenticate() as a side effect the moment it runs. Importing at
    # module scope would demand kaggle.json even when the fast path above
    # returns without touching Kaggle at all.
    import kaggle

    kaggle.api.competition_download_files(COMPETITION, path=str(RAW))
    for z in RAW.glob("*.zip"):
        with zipfile.ZipFile(z) as f:
            f.extractall(RAW)
    missing = [n for n in NEEDED if not (RAW / n).exists()]
    if missing:
        raise RuntimeError(f"missing after download: {missing}")
    print("download complete")


if __name__ == "__main__":
    download()
```

- [ ] **Step 4: Run it**

```bash
.venv/Scripts/python -m dispute_autopilot.ingest.download
```

Expected: `download complete`. On 403, Step 1 was not done.

- [ ] **Step 5: Verify shape and commit the script**

```bash
.venv/Scripts/python -c "import pandas as pd; d=pd.read_csv('data/raw/train_transaction.csv', usecols=['TransactionID','isFraud','TransactionDT']); print(d.shape, d.isFraud.mean(), d.TransactionDT.max())"
```

Expected: approximately `(590540, 3) 0.0349 15811131`. If these differ materially, stop and re-read the spec §4 assumptions before continuing.

```bash
git add src/dispute_autopilot/ingest/
git commit -m "feat: add IEEE-CIS download script"
```

### Task 0.4: Data contracts — the keystone

**Files:**
- Create: `src/dispute_autopilot/contracts.py`
- Test: `tests/test_contracts.py`

**Interfaces:**
- Consumes: nothing
- Produces: `Posture`, `Action`, `RiskScore`, `EvidenceItem`, `CaseFile`, `Dispute`, `Decision`, `Claim`, `EvidenceBundle` — imported by every subsequent task. **These names and field types are fixed. Later tasks adapt to them, never the reverse.**

- [ ] **Step 1: Write the failing test**

```python
# tests/test_contracts.py
import pytest
from pydantic import ValidationError
from dispute_autopilot.contracts import (
    Action, CaseFile, Decision, Dispute, EvidenceItem, Posture, RiskScore,
)


def test_risk_score_rejects_probability_outside_unit_interval():
    with pytest.raises(ValidationError):
        RiskScore(transaction_id=1, p_chargeback=1.4, calibrated=True, top_reasons=[])


def test_decision_requires_assumption_notice():
    with pytest.raises(ValidationError):
        Decision(
            dispute_id="disp_1", action=Action.CONTEST, p_chargeback=0.1,
            p_win=0.3, delta_ev_inr=500.0, w_completeness=1.0, missing_required=[],
        )


def test_casefile_lookup_by_evidence_field():
    cf = CaseFile(
        transaction_id=1,
        posture=Posture.PASSIVE,
        items={"billing_proof": EvidenceItem(
            field="billing_proof", value="AVS match: Y", source="avs_result")},
    )
    assert cf.items["billing_proof"].source == "avs_result"
```

- [ ] **Step 2: Run it to verify it fails**

```bash
.venv/Scripts/python -m pytest tests/test_contracts.py -v
```

Expected: FAIL, `ModuleNotFoundError: No module named 'dispute_autopilot.contracts'`

- [ ] **Step 3: Write `contracts.py`**

```python
"""Frozen data contracts. Every model crossing a stage boundary lives here.

Changing a field here is a breaking change for multiple tasks. Do not edit
casually — this module exists so that later work cannot force interface churn.
"""
from enum import Enum

from pydantic import BaseModel, Field


class Posture(str, Enum):
    NONE = "NONE"
    PASSIVE = "PASSIVE"
    ACTIVE = "ACTIVE"


class Action(str, Enum):
    CONTEST = "CONTEST"
    ACCEPT = "ACCEPT"
    REVIEW = "REVIEW"


class RiskScore(BaseModel):
    transaction_id: int
    p_chargeback: float = Field(ge=0.0, le=1.0)
    calibrated: bool
    top_reasons: list[tuple[str, float]] = Field(default_factory=list)


class EvidenceItem(BaseModel):
    field: str
    value: str
    source: str


class CaseFile(BaseModel):
    transaction_id: int
    posture: Posture
    items: dict[str, EvidenceItem] = Field(default_factory=dict)


class Dispute(BaseModel):
    dispute_id: str
    transaction_id: int
    amount_inr: float = Field(gt=0)
    reason_code: str


class Claim(BaseModel):
    text: str
    source_field: str | None = None
    grounded: bool = False


class EvidenceBundle(BaseModel):
    dispute_id: str
    fields: dict[str, str] = Field(default_factory=dict)
    claims: list[Claim] = Field(default_factory=list)

    @property
    def groundedness(self) -> float:
        if not self.claims:
            return 1.0
        return sum(c.grounded for c in self.claims) / len(self.claims)


class Decision(BaseModel):
    dispute_id: str
    action: Action
    p_chargeback: float = Field(ge=0.0, le=1.0)
    p_win: float = Field(ge=0.0, le=1.0)
    delta_ev_inr: float
    w_completeness: float = Field(ge=0.0, le=1.0)
    missing_required: list[str] = Field(default_factory=list)
    assumption_notice: str
    bundle: EvidenceBundle | None = None
```

`assumption_notice` has no default. That is deliberate: it is impossible to construct a `Decision` without carrying the §8.1 disclosure.

- [ ] **Step 4: Run the tests**

```bash
.venv/Scripts/python -m pytest tests/test_contracts.py -v
```

Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add src/dispute_autopilot/contracts.py tests/test_contracts.py
git commit -m "feat: freeze data contracts for all stage boundaries"
```

### Task 0.5: Configuration

**Files:**
- Create: `config/costs.yaml`, `config/features.yaml`, `src/dispute_autopilot/config.py`
- Test: `tests/test_config.py`

**Interfaces:**
- Consumes: nothing
- Produces: `load_costs() -> CostConfig`, `load_features() -> FeatureConfig`, `ASSUMPTION_NOTICE: str`

- [ ] **Step 1: Write `config/costs.yaml`**

```yaml
currency: INR

# Verified priors (checked 2026-08-31). Do not edit without re-checking sources.
#   Fraud-coded representment win rate: 17.1%  (chargeback.io 2026)
#   Overall representment win rate:     41-54% (source-dependent; Chargebacks911 says 54% US)
#   Net recovery rate:                  10.7%  (merchants win 43.8% of what they
#                                       represent but net-recover only 10.7% after
#                                       second-cycle disputes and undetected friendly fraud)
#   Total cost multiplier:              $5.13 per $1 of fraud loss (LexisNexis
#                                       True Cost of Fraud 2026 -- NOT $4.61, which is 2025)
#   First-party misuse share of chargebacks: 40-75%, source- and definition-dependent.
#                                       DO NOT assert 43.8% -- that number appears in
#                                       Chargebacks911 material as the representment WIN RATE,
#                                       a different statistic. Cite the range only.
base_win_rate_fraud_coded: 0.171   # verified: chargeback.io 2026 compilation.
                                   # Fraud-coded representment win rate, vs 41-54% overall.
lift_clip: [0.5, 2.5]              # bounds on model-score influence over the base rate

# Rs 750 = midpoint of the cited range. Razorpay does NOT publish a dispute fee:
# razorpay.com/pricing lists transaction and refund fees only. Third-party sources
# give Rs 200-2000, negotiated per merchant agreement, charged win or lose.
# This is why the threshold sensitivity sweep is methodologically required, not
# decorative -- we report the decision boundary across the range, not one number.
contest_fee_inr: 750.0
ops_cost_inr: 250.0                # PLACEHOLDER - staff time per contested dispute
decision_margin_inr: 100.0         # REVIEW band half-width

posture_cost_inr:
  NONE: 0.0
  PASSIVE: 12.0                    # PLACEHOLDER - storage/logging per transaction
  ACTIVE: 75.0                     # PLACEHOLDER - signature on delivery etc.

# Hand-written rules baseline. Reported alongside the model, so these thresholds
# are published methodology, not implementation detail. No magic numbers in code.
baseline_rules:
  amount_inr: 10000.0
  dist: 100.0

completeness:
  missing_required_penalty: 0.45   # multiplied per missing required field
  supporting_bonus: 1.08           # multiplied per present supporting field

reason_codes:
  fraud_card_absent:
    label: "Fraud - card absent environment"
    required: [billing_proof, shipping_proof]
    supporting: [customer_communication, access_activity_log, term_and_conditions]
```

- [ ] **Step 2: Write `config/features.yaml`**

```yaml
target: isFraud
id_column: TransactionID
time_column: TransactionDT

numeric:
  - TransactionAmt
  - dist1
  - dist2
  - C1
  - C2
  - C13
  - C14
  - D1
  - D2
  - D15

categorical:
  - ProductCD
  - card4
  - card6
  - P_emaildomain
  - R_emaildomain
  - DeviceType
  - M1
  - M2
  - M3
  - M4
  - M6

engineered:
  - amt_log
  - amt_decimal
  - hour_of_day
  - email_domain_mismatch
```

- [ ] **Step 3: Write the failing test**

```python
# tests/test_config.py
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
```

- [ ] **Step 4: Run it to verify it fails**

```bash
.venv/Scripts/python -m pytest tests/test_config.py -v
```

Expected: FAIL, `ModuleNotFoundError: No module named 'dispute_autopilot.config'`

- [ ] **Step 5: Write `config.py`**

```python
"""Typed configuration loaders. No magic numbers anywhere else in the codebase.

The loaded models are FROZEN and lru_cached, so one shared instance is handed to
every caller. Callers needing a variant MUST use
`load_costs().model_copy(update={...})` — mutating the shared instance would
silently corrupt every later caller for the process lifetime.

Note the boundary: frozen=True blocks attribute reassignment, but does not
deep-freeze nested `list[str]` fields, so `reason_codes[...].required.append(...)`
is still possible. Documented rather than closed, since retyping to tuples is
contract churn for a hazard no code here exhibits.
"""
from functools import lru_cache
from pathlib import Path

import yaml
from pydantic import BaseModel, ConfigDict

# Module-relative, NOT cwd-relative: this must resolve from any working directory.
CONFIG_DIR = Path(__file__).resolve().parent.parent.parent / "config"

ASSUMPTION_NOTICE = (
    "Contest recommendations rest on an inference that is not validated by this "
    "dataset: a transaction scored as low chargeback risk that is nevertheless "
    "charged back is treated as more likely to be first-party misuse. IEEE-CIS "
    "cannot separate first-party misuse from third-party fraud, so this is "
    "calibrated to published industry base rates, not measured here."
)


class ReasonCode(BaseModel):
    model_config = ConfigDict(frozen=True)

    label: str
    required: list[str]
    supporting: list[str]


class Completeness(BaseModel):
    model_config = ConfigDict(frozen=True)

    missing_required_penalty: float
    supporting_bonus: float


class BaselineRules(BaseModel):
    model_config = ConfigDict(frozen=True)

    amount_inr: float
    dist: float


class CostConfig(BaseModel):
    model_config = ConfigDict(frozen=True)

    currency: str
    base_win_rate_fraud_coded: float
    lift_clip: tuple[float, float]
    contest_fee_inr: float
    ops_cost_inr: float
    decision_margin_inr: float
    posture_cost_inr: dict[str, float]
    baseline_rules: BaselineRules
    completeness: Completeness
    reason_codes: dict[str, ReasonCode]


class FeatureConfig(BaseModel):
    model_config = ConfigDict(frozen=True)

    target: str
    id_column: str
    time_column: str
    numeric: list[str]
    categorical: list[str]
    engineered: list[str]

    @property
    def all_model_columns(self) -> list[str]:
        return self.numeric + self.categorical + self.engineered


@lru_cache(maxsize=1)
def load_costs() -> CostConfig:
    return CostConfig(**yaml.safe_load((CONFIG_DIR / "costs.yaml").read_text()))


@lru_cache(maxsize=1)
def load_features() -> FeatureConfig:
    return FeatureConfig(**yaml.safe_load((CONFIG_DIR / "features.yaml").read_text()))
```

- [ ] **Step 6: Run the tests**

```bash
.venv/Scripts/python -m pytest tests/test_config.py -v
```

Expected: 3 passed

- [ ] **Step 7: Commit**

```bash
git add config/ src/dispute_autopilot/config.py tests/test_config.py
git commit -m "feat: add typed cost and feature configuration"
```

---

## Phase 1 — Data (1 Sep, morning)

### Task 1.1: Load and downcast

**Files:**
- Create: `src/dispute_autopilot/ingest/load.py`
- Test: `tests/test_load.py`

**Interfaces:**
- Consumes: `data/raw/*.csv` from Task 0.3
- Produces: `load_raw(sample_n: int | None = None) -> pd.DataFrame` — merged transaction+identity frame, downcast, sorted by `TransactionDT` ascending

- [ ] **Step 1: Write the failing test**

```python
# tests/test_load.py
import pandas as pd
from dispute_autopilot.ingest.load import downcast


def test_downcast_shrinks_memory_without_changing_values():
    df = pd.DataFrame({"a": [1.0, 2.0, 3.0], "b": [1, 2, 3]})
    before = df.memory_usage(deep=True).sum()
    out = downcast(df)
    assert out.memory_usage(deep=True).sum() < before
    assert out["a"].tolist() == [1.0, 2.0, 3.0]
    assert out["b"].tolist() == [1, 2, 3]
```

- [ ] **Step 2: Run it to verify it fails**

```bash
.venv/Scripts/python -m pytest tests/test_load.py -v
```

Expected: FAIL, `ModuleNotFoundError`

- [ ] **Step 3: Write `load.py`**

```python
"""Load IEEE-CIS with dtype downcasting. 590k x 434 in float64 will not fit
comfortably in 8 GB; downcasting on load is what makes this run on a laptop."""
import pandas as pd

# Reuse the ONE definition of where raw data lives. A second literal
# Path("data/raw") here would be CWD-relative and would break the moment
# anything runs from outside the repo root -- the bug already fixed once
# in download.py. Importing download is side-effect free: it imports
# kaggle inside the function, never at module scope.
from dispute_autopilot.ingest.download import RAW


def downcast(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    for col in out.select_dtypes(include=["float64"]).columns:
        out[col] = pd.to_numeric(out[col], downcast="float")
    for col in out.select_dtypes(include=["int64"]).columns:
        out[col] = pd.to_numeric(out[col], downcast="integer")
    for col in out.select_dtypes(include=["object"]).columns:
        if out[col].nunique(dropna=False) / max(len(out), 1) < 0.5:
            out[col] = out[col].astype("category")
    return out


def load_raw(sample_n: int | None = None) -> pd.DataFrame:
    txn = pd.read_csv(RAW / "train_transaction.csv")
    ident = pd.read_csv(RAW / "train_identity.csv")
    df = txn.merge(ident, on="TransactionID", how="left")
    df = df.sort_values("TransactionDT").reset_index(drop=True)
    if sample_n is not None and sample_n < len(df):
        # Head-sample by time, never random: a random sample destroys the
        # temporal structure the split depends on.
        df = df.head(sample_n).reset_index(drop=True)
    return downcast(df)
```

- [ ] **Step 4: Run the test**

```bash
.venv/Scripts/python -m pytest tests/test_load.py -v
```

Expected: 1 passed

- [ ] **Step 5: Smoke-test on the real data and record memory**

```bash
.venv/Scripts/python -c "from dispute_autopilot.ingest.load import load_raw; d=load_raw(); print(d.shape); print(d.memory_usage(deep=True).sum()/1e9, 'GB')"
```

Expected: `(590540, 434)` and under 1.5 GB. If it exceeds available RAM, use `load_raw(sample_n=200000)` for the rest of the build and record that decision in the README (locked cut 3).

- [ ] **Step 6: Commit**

```bash
git add src/dispute_autopilot/ingest/load.py tests/test_load.py
git commit -m "feat: add IEEE-CIS loader with dtype downcasting"
```

### Task 1.2: Gate G1 — censoring diagnostic

**Files:**
- Create: `eval/gates/g1_censoring.py`, `eval/gates/__init__.py`
- Output: `eval/reports/g1_censoring.png`, `docs/gates/G1-censoring.md`

**Interfaces:**
- Consumes: `load_raw` from Task 1.1
- Produces: a documented verdict controlling whether Task 1.3 uses the full range or the matured window

**This gate is blocking. Do not proceed to Task 1.3 until it is written up.**

`eval/__init__.py` already defines `REPORTS` (the one absolute path every report
writer imports). Do not redefine it in any module.

- [ ] **Step 1: Write the diagnostic**

```python
"""Gate G1: does the 120-day label horizon right-censor the tail of the data?

The label is 'chargeback reported within 120 days' but the data spans 183 days.
If Vesta labelled at collection time rather than retrospectively, the final
120 days are under-labelled and measured precision is understated.
"""
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from dispute_autopilot.ingest.load import load_raw

# ONE definition, in eval/__init__.py -- see below. Hand-writing
# parents[N] per file gets the depth wrong the moment a module moves.
from eval import REPORTS


def run() -> dict:
    df = load_raw()
    df["day"] = df["TransactionDT"] // 86400
    daily = df.groupby("day")["isFraud"].agg(["mean", "size"])
    daily = daily[daily["size"] >= 100]

    head = daily["mean"].head(30).mean()
    tail = daily["mean"].tail(30).mean()
    ratio = tail / head if head else float("nan")

    fig, ax = plt.subplots(figsize=(10, 4))
    ax.plot(daily.index, daily["mean"], linewidth=1)
    ax.axhline(head, linestyle="--", label=f"first 30d mean = {head:.4f}")
    ax.axhline(tail, linestyle=":", label=f"last 30d mean = {tail:.4f}")
    ax.set_xlabel("day since dataset start")
    ax.set_ylabel("chargeback rate")
    ax.set_title("G1: chargeback rate over time (censoring check)")
    ax.legend()
    REPORTS.mkdir(parents=True, exist_ok=True)
    fig.savefig(REPORTS / "g1_censoring.png", dpi=120, bbox_inches="tight")

    verdict = "CENSORED" if ratio < 0.7 else "CLEAN"
    return {"head_rate": head, "tail_rate": tail, "ratio": ratio, "verdict": verdict}


if __name__ == "__main__":
    print(run())
```

- [ ] **Step 2: Run it**

```bash
.venv/Scripts/python -m eval.gates.g1_censoring
```

(`eval/__init__.py` and `eval/gates/__init__.py` were created in Task 0.1 Step 7. If this errors with `No module named eval`, they are missing.)

Expected: a dict with `verdict` either `CLEAN` or `CENSORED`, plus `eval/reports/g1_censoring.png`.

- [ ] **Step 3: Write up the verdict in `docs/gates/G1-censoring.md`**

Record the head rate, tail rate, ratio, verdict, and the consequence:

- `CLEAN` → use the full temporal range in Task 1.3. Note in the README that the check was run and passed.
- `CENSORED` → set `MATURED_MAX_DAY = 63` in Task 1.3 and restrict all data to it. Note in the README that measured precision would otherwise be biased downward, and that you found and corrected it.

Either verdict is a README paragraph. The check being run at all is the point.

- [ ] **Step 4: Commit**

```bash
git add eval/gates/ docs/gates/G1-censoring.md eval/reports/g1_censoring.png
git commit -m "feat: add G1 label-censoring gate and record verdict"
```

### Task 1.3: Temporal split

**Files:**
- Create: `src/dispute_autopilot/ingest/split.py`
- Test: `tests/test_split.py`

**Interfaces:**
- Consumes: `load_raw` from Task 1.1, the G1 verdict from Task 1.2
- Produces: `temporal_split(df, matured_max_day: int | None = None) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]` returning `(train, calib, test)` at 70/10/20 by time

- [ ] **Step 1: Write the failing test**

```python
# tests/test_split.py
import pandas as pd
import pytest
from dispute_autopilot.ingest.split import temporal_split


def _frame(n=1000):
    return pd.DataFrame({"TransactionDT": range(n), "isFraud": [0] * n})


def test_split_is_ordered_in_time_with_no_overlap():
    train, calib, test = temporal_split(_frame())
    assert train["TransactionDT"].max() < calib["TransactionDT"].min()
    assert calib["TransactionDT"].max() < test["TransactionDT"].min()


def test_split_proportions_are_70_10_20():
    train, calib, test = temporal_split(_frame())
    assert len(train) == 700 and len(calib) == 100 and len(test) == 200


def test_matured_window_truncates_the_tail():
    df = pd.DataFrame({"TransactionDT": [d * 86400 for d in range(100)],
                       "isFraud": [0] * 100})
    train, calib, test = temporal_split(df, matured_max_day=63)
    assert test["TransactionDT"].max() // 86400 <= 63


def test_rejects_unsorted_input():
    df = pd.DataFrame({"TransactionDT": [5, 1, 3], "isFraud": [0, 0, 0]})
    with pytest.raises(ValueError):
        temporal_split(df)
```

- [ ] **Step 2: Run it to verify it fails**

```bash
.venv/Scripts/python -m pytest tests/test_split.py -v
```

Expected: FAIL, `ModuleNotFoundError`

- [ ] **Step 3: Write `split.py`**

```python
"""Temporal 70/10/20 split.

A random split leaks badly on this dataset: the label definition marks
transactions posterior to a chargeback and linked by account, email or billing
address, which clusters card entities across any random partition. Protocol
precedent: Amazon Science Fraud Dataset Benchmark (arXiv 2208.14417) uses a
time-based split for IEEE-CIS.
"""
import pandas as pd

TRAIN_FRAC = 0.70
CALIB_FRAC = 0.10


def temporal_split(
    df: pd.DataFrame, matured_max_day: int | None = None
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    if not df["TransactionDT"].is_monotonic_increasing:
        raise ValueError("input must be sorted by TransactionDT ascending")

    if matured_max_day is not None:
        df = df[df["TransactionDT"] // 86400 <= matured_max_day]

    n = len(df)
    # Each boundary is derived from its OWN fraction and then accumulated.
    # int(n * (TRAIN_FRAC + CALIB_FRAC)) looks equivalent and is not:
    # 0.70 + 0.10 == 0.7999999999999999 in IEEE-754, so int() truncates a
    # row short and calib/test come out 99/201 instead of 100/200.
    i_train = int(n * TRAIN_FRAC)
    i_calib = i_train + int(n * CALIB_FRAC)
    return (
        df.iloc[:i_train].reset_index(drop=True),
        df.iloc[i_train:i_calib].reset_index(drop=True),
        df.iloc[i_calib:].reset_index(drop=True),
    )
```

- [ ] **Step 4: Run the tests**

```bash
.venv/Scripts/python -m pytest tests/test_split.py -v
```

Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add src/dispute_autopilot/ingest/split.py tests/test_split.py
git commit -m "feat: add temporal train/calibration/test split"
```

---

## Phase 2 — Features (1 Sep, afternoon)

### Task 2.1: The single feature builder

**Files:**
- Create: `src/dispute_autopilot/features/builder.py`, `src/dispute_autopilot/features/__init__.py`
- Test: `tests/test_features.py`

**Interfaces:**
- Consumes: `load_features()` from Task 0.5
- Produces: `build_features(df: pd.DataFrame) -> pd.DataFrame` returning exactly `load_features().all_model_columns`, categoricals as pandas `category` dtype

- [ ] **Step 1: Write the failing test**

```python
# tests/test_features.py
import numpy as np
import pandas as pd
from dispute_autopilot.config import load_features
from dispute_autopilot.features.builder import build_features


def _row(**over):
    base = {
        "TransactionID": 1, "TransactionDT": 86400 * 2 + 3600 * 14,
        "TransactionAmt": 149.75, "ProductCD": "W", "card4": "visa",
        "card6": "debit", "P_emaildomain": "gmail.com",
        "R_emaildomain": "yahoo.com", "DeviceType": "desktop",
        "dist1": 12.0, "dist2": np.nan,
        "C1": 1.0, "C2": 1.0, "C13": 2.0, "C14": 1.0,
        "D1": 0.0, "D2": np.nan, "D15": 3.0,
        "M1": "T", "M2": "T", "M3": "F", "M4": "M0", "M6": "T",
    }
    base.update(over)
    return pd.DataFrame([base])


def test_produces_exactly_the_configured_columns():
    out = build_features(_row())
    assert list(out.columns) == load_features().all_model_columns


def test_amt_decimal_extracts_the_fractional_part():
    out = build_features(_row(TransactionAmt=149.75))
    assert abs(out["amt_decimal"].iloc[0] - 0.75) < 1e-6


def test_hour_of_day_derives_from_transaction_dt():
    out = build_features(_row(TransactionDT=86400 * 2 + 3600 * 14))
    assert out["hour_of_day"].iloc[0] == 14


def test_email_mismatch_flag():
    assert build_features(_row())["email_domain_mismatch"].iloc[0] == 1
    same = _row(R_emaildomain="gmail.com")
    assert build_features(same)["email_domain_mismatch"].iloc[0] == 0


def test_missing_optional_columns_do_not_raise():
    df = _row().drop(columns=["dist2", "D2"])
    out = build_features(df)
    assert out["dist2"].isna().all()
```

- [ ] **Step 2: Run it to verify it fails**

```bash
.venv/Scripts/python -m pytest tests/test_features.py -v
```

Expected: FAIL, `ModuleNotFoundError`

- [ ] **Step 3: Write `builder.py`**

```python
"""THE feature builder. Imported by both training and serving.

Do not write a second feature path. Task 2.2 enforces this with a parity test;
train/serve skew is the failure mode a payments reviewer looks for first.

CATEGORY STABILITY — the subtle half of that guarantee. LightGBM consumes a
pandas category column's `.cat.codes`, not its values. If categories are inferred
per call, a batch build and a single-row serve build assign DIFFERENT integers to
the same value, and every live score is computed on wrong codes while every batch
metric still looks correct. So the fitted category sets are captured at training
time and passed back in at serving time. Never let serving infer its own.
"""
import numpy as np
import pandas as pd

from dispute_autopilot.config import load_features


def build_features(
    df: pd.DataFrame,
    categories: dict[str, pd.CategoricalDtype] | None = None,
) -> pd.DataFrame:
    """`categories` None means fit (training); provided means apply (serving).

    An unseen category at serve time becomes NaN, which is the correct and
    honest encoding for a value the model never trained on.
    """
    fc = load_features()
    out = pd.DataFrame(index=df.index)

    for col in fc.numeric:
        out[col] = pd.to_numeric(df[col], errors="coerce") if col in df else np.nan

    amt = pd.to_numeric(df.get("TransactionAmt"), errors="coerce")
    out["amt_log"] = np.log1p(amt)
    out["amt_decimal"] = (amt - np.floor(amt)).round(6)
    out["hour_of_day"] = (df["TransactionDT"] // 3600) % 24

    p = df.get("P_emaildomain")
    r = df.get("R_emaildomain")
    if p is None or r is None:
        out["email_domain_mismatch"] = 0
    else:
        both = p.notna() & r.notna()
        out["email_domain_mismatch"] = np.where(both & (p != r), 1, 0)

    for col in fc.categorical:
        series = df[col] if col in df else pd.Series([None] * len(df), index=df.index)
        series = series.astype("object")
        if categories is not None and col in categories:
            out[col] = series.astype(categories[col])   # serving: fixed codes
        else:
            out[col] = series.astype("category")        # training: fit
    return out[fc.all_model_columns]


def extract_categories(features: pd.DataFrame) -> dict[str, pd.CategoricalDtype]:
    """Capture fitted category sets so serving reproduces identical codes.

    Call this once on the TRAINING feature frame and persist the result beside
    the model. Without it, serving silently re-derives its own codes.
    """
    fc = load_features()
    return {
        col: pd.CategoricalDtype(categories=features[col].cat.categories)
        for col in fc.categorical
    }
```

- [ ] **Step 4: Run the tests**

```bash
.venv/Scripts/python -m pytest tests/test_features.py -v
```

Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add src/dispute_autopilot/features/ tests/test_features.py
git commit -m "feat: add the single shared feature builder"
```

### Task 2.2: Train/serve parity test

**Files:**
- Create: `tests/conftest.py`
- Test: `tests/test_feature_parity.py`

**Interfaces:**
- Consumes: `build_features` from Task 2.1
- Produces: the shared `batch` pytest fixture, used by Tasks 3.1 and 3.3

The fixture lives in `conftest.py`, not in a test module. Importing fixtures across test files (`from tests.test_feature_parity import batch`) works only by accident of `sys.path` and breaks the moment pytest is invoked from another directory.

- [ ] **Step 1: Write `tests/conftest.py`**

```python
"""Shared fixtures. pytest discovers conftest.py automatically — never import
fixtures from another test module."""
import numpy as np
import pandas as pd
import pytest


@pytest.fixture
def batch():
    rng = np.random.default_rng(0)
    n = 50
    return pd.DataFrame({
        "TransactionID": range(n),
        "TransactionDT": rng.integers(0, 86400 * 180, n),
        "TransactionAmt": rng.uniform(10, 5000, n).round(2),
        "ProductCD": rng.choice(["W", "C", "H"], n),
        "card4": rng.choice(["visa", "mastercard"], n),
        "card6": rng.choice(["debit", "credit"], n),
        "P_emaildomain": rng.choice(["gmail.com", "yahoo.com"], n),
        "R_emaildomain": rng.choice(["gmail.com", "hotmail.com"], n),
        "DeviceType": rng.choice(["desktop", "mobile"], n),
        "dist1": rng.uniform(0, 500, n), "dist2": rng.uniform(0, 500, n),
        "C1": rng.integers(1, 20, n), "C2": rng.integers(1, 20, n),
        "C13": rng.integers(1, 40, n), "C14": rng.integers(1, 20, n),
        "D1": rng.integers(0, 200, n), "D2": rng.integers(0, 200, n),
        "D15": rng.integers(0, 200, n),
        "M1": rng.choice(["T", "F"], n), "M2": rng.choice(["T", "F"], n),
        "M3": rng.choice(["T", "F"], n), "M4": rng.choice(["M0", "M1"], n),
        "M6": rng.choice(["T", "F"], n),
    })
```

- [ ] **Step 2: Write `tests/test_feature_parity.py`**

```python
"""Guard rail: the batch path and the single-row serving path must agree.

If this ever fails, the serving path has drifted from training and every
metric in the README is invalid.
"""
import pandas as pd
from dispute_autopilot.config import load_features
from dispute_autopilot.features.builder import build_features, extract_categories


def test_single_row_matches_batch_row(batch):
    """Values agree between a batch build and a single-row serve build."""
    full = build_features(batch)
    cats = extract_categories(full)
    for i in [0, 17, 49]:
        single = build_features(batch.iloc[[i]], categories=cats)
        for col in full.columns:
            a, b = full[col].iloc[i], single[col].iloc[0]
            if pd.isna(a) and pd.isna(b):
                continue
            assert a == b, f"train/serve skew in {col} at row {i}: {a} != {b}"


def test_categorical_CODES_match_not_just_values(batch):
    """LightGBM consumes .cat.codes, so codes are what must agree.

    Comparing values alone is blind to category-set skew: the same string can
    carry a different integer in a batch build than in a single-row build.
    """
    fc = load_features()
    full = build_features(batch)
    cats = extract_categories(full)
    for i in [0, 17, 49]:
        single = build_features(batch.iloc[[i]], categories=cats)
        for col in fc.categorical:
            assert full[col].cat.codes.iloc[i] == single[col].cat.codes.iloc[0], (
                f"categorical code skew in {col} at row {i}"
            )


def test_the_parity_guard_can_actually_detect_code_skew(batch):
    """Guard the guard.

    Without fixed categories, per-call inference MUST produce divergent codes.
    If this ever stops being true, the two tests above have gone vacuous and are
    protecting nothing — which is exactly the failure this suite once shipped.
    """
    fc = load_features()
    full = build_features(batch)
    diverged = False
    for i in [0, 17, 49]:
        naive = build_features(batch.iloc[[i]])   # no categories -> re-inferred
        for col in fc.categorical:
            if full[col].cat.codes.iloc[i] != naive[col].cat.codes.iloc[0]:
                diverged = True
    assert diverged, (
        "expected naive per-call category inference to diverge; if it does not, "
        "the parity tests above are no longer testing anything"
    )
```

- [ ] **Step 3: Run it**

```bash
.venv/Scripts/python -m pytest tests/test_feature_parity.py -v
```

Expected: PASS. If it fails, fix `builder.py` now — before a model exists — because every downstream number depends on this holding.

- [ ] **Step 4: Commit**

```bash
git add tests/conftest.py tests/test_feature_parity.py
git commit -m "test: enforce train/serve feature parity"
```

---

## Phase 3 — Model (1 Sep evening, 2 Sep morning)

### Task 3.1: Train LightGBM

**Files:**
- Create: `src/dispute_autopilot/model/train.py`, `src/dispute_autopilot/model/__init__.py`
- Test: `tests/test_train.py`

**Interfaces:**
- Consumes: `build_features`, `temporal_split`, `load_features`
- Produces: `train_model(train_df, calib_df) -> lgb.Booster`, `save_model(booster, path)`, artifact at `artifacts/model.txt`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_train.py
import numpy as np
import pandas as pd
from dispute_autopilot.model.train import train_model


def test_train_returns_a_booster_that_scores_in_unit_interval(batch):
    """`batch` comes from tests/conftest.py — pytest injects it automatically."""
    rng = np.random.default_rng(1)
    df = pd.concat([batch] * 8, ignore_index=True)
    df["isFraud"] = rng.integers(0, 2, len(df))
    booster, categories = train_model(df, num_boost_round=10)
    from dispute_autopilot.features.builder import build_features
    preds = booster.predict(build_features(df, categories=categories))
    assert preds.min() >= 0.0 and preds.max() <= 1.0
    assert set(categories), "train_model must return the fitted category sets"
```

- [ ] **Step 2: Run it to verify it fails**

```bash
.venv/Scripts/python -m pytest tests/test_train.py -v
```

Expected: FAIL, `ModuleNotFoundError`

- [ ] **Step 3: Write `train.py`**

```python
"""LightGBM training with class weighting."""
from pathlib import Path

import joblib
import lightgbm as lgb
import pandas as pd

from dispute_autopilot.config import ARTIFACTS_DIR, load_features
from dispute_autopilot.features.builder import build_features, extract_categories

ARTIFACTS = ARTIFACTS_DIR

PARAMS = {
    "objective": "binary",
    "metric": "average_precision",
    "learning_rate": 0.05,
    "num_leaves": 63,
    "min_data_in_leaf": 100,
    "feature_fraction": 0.8,
    "bagging_fraction": 0.8,
    "bagging_freq": 1,
    "verbosity": -1,
    "seed": 42,
}


def train_model(
    train_df: pd.DataFrame, num_boost_round: int = 400
) -> tuple[lgb.Booster, dict[str, pd.CategoricalDtype]]:
    """Returns the booster AND the category sets it was fitted against.

    These are returned together, as a pair, on purpose. The categories are not
    optional metadata -- they are half the model. LightGBM splits on
    `.cat.codes`, so a booster scored against re-inferred categories is scoring
    against different integers than it trained on: silently, with no error and
    no failing test.

    Returning a tuple makes that mistake a TypeError at the call site instead of
    a wrong number in the README. Every caller is forced to acknowledge them.
    """
    fc = load_features()
    X = build_features(train_df)
    categories = extract_categories(X)
    y = train_df[fc.target]
    pos = max(int(y.sum()), 1)
    params = dict(PARAMS, scale_pos_weight=(len(y) - pos) / pos)
    dataset = lgb.Dataset(X, label=y, categorical_feature=fc.categorical)
    booster = lgb.train(params, dataset, num_boost_round=num_boost_round)
    return booster, categories


def save_model(booster: lgb.Booster, path: Path = ARTIFACTS / "model.txt") -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    booster.save_model(str(path))
    return path


def save_categories(
    categories: dict, path: Path = ARTIFACTS / "categories.joblib"
) -> Path:
    """Persist the fitted category sets beside the model.

    Serving MUST reuse these. LightGBM splits on .cat.codes, so a serving path
    that re-infers its own categories scores against different integers than the
    model was trained on — silently, with no error and no failing test.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(categories, path)
    return path
```

The model artifact is now a **pair**: `model.txt` and `categories.joblib`. Loading one without the other is a bug — `Scorer.load` in Task 3.3 loads both.

- [ ] **Step 4: Run the test**

```bash
.venv/Scripts/python -m pytest tests/test_train.py -v
```

Expected: 1 passed

- [ ] **Step 5: Train on the real split and record PR-AUC**

```bash
.venv/Scripts/python -c "
from dispute_autopilot.ingest.load import load_raw
from dispute_autopilot.ingest.split import temporal_split
from dispute_autopilot.model.train import train_model, save_model, save_categories
from dispute_autopilot.features.builder import build_features
from sklearn.metrics import average_precision_score
tr, ca, te = temporal_split(load_raw())
b, cats = train_model(tr); save_model(b); save_categories(cats)
# categories=cats is what makes this a real number. Without it the test slice
# re-infers its own codes and the PR-AUC reported here is measuring a model
# against scrambled categoricals.
print('test PR-AUC', average_precision_score(te.isFraud, b.predict(build_features(te, categories=cats))))
"
```

Expected: PR-AUC materially above the 0.035 base rate. Below ~0.15 means something is wrong — stop and check the split before continuing.

- [ ] **Step 6: Commit**

```bash
git add src/dispute_autopilot/model/ tests/test_train.py
git commit -m "feat: add LightGBM chargeback-risk training"
```

### Task 3.2: Calibration

**Files:**
- Create: `src/dispute_autopilot/model/calibrate.py`
- Test: `tests/test_calibrate.py`

**Interfaces:**
- Consumes: a trained `lgb.Booster`, the calibration slice
- Produces: `fit_calibrator(booster, calib_df) -> IsotonicRegression`, `save_calibrator(iso, path)`, artifact at `artifacts/calibrator.joblib`

Calibration is not cosmetic. Every decision downstream is an expected-value computation, and EV arithmetic on uncalibrated scores is meaningless.

- [ ] **Step 1: Write the failing test**

```python
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
```

- [ ] **Step 2: Run it to verify it fails**

```bash
.venv/Scripts/python -m pytest tests/test_calibrate.py -v
```

Expected: FAIL, `ModuleNotFoundError`

- [ ] **Step 3: Write `calibrate.py`**

```python
"""Isotonic calibration on the held-out calibration slice."""
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.isotonic import IsotonicRegression

from dispute_autopilot.config import ARTIFACTS_DIR, load_features
from dispute_autopilot.features.builder import build_features

ARTIFACTS = ARTIFACTS_DIR


def fit_calibrator(
    booster,
    calib_df: pd.DataFrame,
    categories: dict[str, pd.CategoricalDtype],
) -> IsotonicRegression:
    """`categories` is REQUIRED and has no default, deliberately.

    The calibration slice is a different time window than training, so its
    inferred category sets differ from the training ones. Calibrating on
    re-inferred codes fits the mapping against a model that is effectively
    reading scrambled categoricals -- which would then be baked into every
    expected-value decision downstream.
    """
    fc = load_features()
    raw = booster.predict(build_features(calib_df, categories=categories))
    iso = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
    iso.fit(raw, calib_df[fc.target].to_numpy())
    return iso


def apply_calibrator(iso: IsotonicRegression, raw: np.ndarray) -> np.ndarray:
    return np.clip(iso.predict(raw), 0.0, 1.0)


def save_calibrator(iso, path: Path = ARTIFACTS / "calibrator.joblib") -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(iso, path)
    return path
```

- [ ] **Step 4: Run the test**

```bash
.venv/Scripts/python -m pytest tests/test_calibrate.py -v
```

Expected: 1 passed

- [ ] **Step 5: Commit**

```bash
git add src/dispute_autopilot/model/calibrate.py tests/test_calibrate.py
git commit -m "feat: add isotonic probability calibration"
```

### Task 3.3: The Scorer — serving path

**Files:**
- Create: `src/dispute_autopilot/model/predict.py`
- Test: `tests/test_predict.py`

**Interfaces:**
- Consumes: artifacts from Tasks 3.1 and 3.2, `build_features`
- Produces: `Scorer.load() -> Scorer`, `Scorer.score_one(row: pd.DataFrame) -> RiskScore`, `Scorer.score_batch(df) -> np.ndarray`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_predict.py
import numpy as np
import pandas as pd
from dispute_autopilot.contracts import RiskScore
from dispute_autopilot.model.predict import Scorer


def test_score_one_returns_a_contract_object(batch):
    from dispute_autopilot.model.train import train_model
    from dispute_autopilot.model.calibrate import fit_calibrator
    rng = np.random.default_rng(2)
    df = pd.concat([batch] * 8, ignore_index=True)
    df["isFraud"] = rng.integers(0, 2, len(df))
    booster, categories = train_model(df, num_boost_round=10)
    iso = fit_calibrator(booster, df, categories)
    scorer = Scorer(booster=booster, calibrator=iso, categories=categories)

    result = scorer.score_one(df.iloc[[0]])
    assert isinstance(result, RiskScore)
    assert 0.0 <= result.p_chargeback <= 1.0
    assert result.calibrated is True
    assert len(result.top_reasons) <= 5
```

- [ ] **Step 2: Run it to verify it fails**

```bash
.venv/Scripts/python -m pytest tests/test_predict.py -v
```

Expected: FAIL, `ModuleNotFoundError`

- [ ] **Step 3: Write `predict.py`**

```python
"""Serving path. Uses THE feature builder — never a reimplementation."""
from dataclasses import dataclass
from pathlib import Path

import joblib
import lightgbm as lgb
import numpy as np
import pandas as pd

from dispute_autopilot.config import ARTIFACTS_DIR
from dispute_autopilot.contracts import RiskScore
from dispute_autopilot.features.builder import build_features
from dispute_autopilot.model.calibrate import apply_calibrator

ARTIFACTS = ARTIFACTS_DIR


@dataclass
class Scorer:
    booster: lgb.Booster
    calibrator: object
    # No default. A Scorer without categories is a broken Scorer, so it must be
    # impossible to construct one by omission -- the same reason
    # Decision.assumption_notice has no default.
    categories: dict[str, pd.CategoricalDtype]

    @classmethod
    def load(cls, artifacts: Path = ARTIFACTS) -> "Scorer":
        return cls(
            booster=lgb.Booster(model_file=str(artifacts / "model.txt")),
            calibrator=joblib.load(artifacts / "calibrator.joblib"),
            categories=joblib.load(artifacts / "categories.joblib"),
        )

    def score_batch(self, df: pd.DataFrame) -> np.ndarray:
        # categories MUST be threaded through. Scoring one row without them makes
        # every categorical collapse to code 0, silently, with no error.
        features = build_features(df, categories=self.categories)
        return apply_calibrator(self.calibrator, self.booster.predict(features))

    def score_one(self, row: pd.DataFrame) -> RiskScore:
        if len(row) != 1:
            raise ValueError("score_one expects exactly one row")
        p = float(self.score_batch(row)[0])
        gains = self.booster.feature_importance(importance_type="gain")
        names = self.booster.feature_name()
        order = np.argsort(gains)[::-1][:5]
        total = gains.sum() or 1.0
        return RiskScore(
            transaction_id=int(row["TransactionID"].iloc[0]),
            p_chargeback=p,
            calibrated=True,
            top_reasons=[(names[i], round(float(gains[i] / total), 4)) for i in order],
        )
```

- [ ] **Step 4: Run the test**

```bash
.venv/Scripts/python -m pytest tests/test_predict.py -v
```

Expected: 1 passed

- [ ] **Step 5: Commit**

```bash
git add src/dispute_autopilot/model/predict.py tests/test_predict.py
git commit -m "feat: add calibrated scoring service path"
```

---

## Phase 4 — Economics (2 Sep)

This phase produces the headline result. Phase 3's model is table stakes; this is the differentiator.

### Task 4.1: Rupee cost model

**Files:**
- Create: `src/dispute_autopilot/economics/cost_model.py`, `src/dispute_autopilot/economics/__init__.py`
- Test: `tests/test_cost_model.py`

**Interfaces:**
- Consumes: `load_costs()` from Task 0.5
- Produces: `rupee_confusion(y_true, y_pred, amounts) -> RupeeMatrix` where `RupeeMatrix` is a dataclass with `tp_inr, fp_inr, tn_inr, fn_inr, net_inr` and counts `tp, fp, tn, fn`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_cost_model.py
import numpy as np
from dispute_autopilot.economics.cost_model import rupee_confusion


def test_false_positive_costs_the_posture_spend_not_the_amount():
    y_true = np.array([0])
    y_pred = np.array([1])
    amounts = np.array([10000.0])
    m = rupee_confusion(y_true, y_pred, amounts)
    assert m.fp == 1
    assert m.fp_inr < 0
    assert abs(m.fp_inr) < 10000.0  # a false positive never costs the full amount


def test_false_negative_costs_the_full_transaction_amount():
    m = rupee_confusion(np.array([1]), np.array([0]), np.array([10000.0]))
    assert m.fn == 1
    assert abs(m.fn_inr) >= 10000.0


def test_net_is_the_sum_of_the_four_cells():
    y_true = np.array([1, 0, 1, 0])
    y_pred = np.array([1, 1, 0, 0])
    amounts = np.array([5000.0, 2000.0, 8000.0, 1000.0])
    m = rupee_confusion(y_true, y_pred, amounts)
    assert abs(m.net_inr - (m.tp_inr + m.fp_inr + m.tn_inr + m.fn_inr)) < 1e-6
```

- [ ] **Step 2: Run it to verify it fails**

```bash
.venv/Scripts/python -m pytest tests/test_cost_model.py -v
```

Expected: FAIL, `ModuleNotFoundError`

- [ ] **Step 3: Write `cost_model.py`**

```python
"""Confusion matrix denominated in rupees. This is the money table.

METRIC FAMILY B (simulated): the rupee values depend on the cost assumptions in
config/costs.yaml, not on measured outcomes. Label every reported figure.
"""
from dataclasses import dataclass

import numpy as np

from dispute_autopilot.config import CostConfig, load_costs


@dataclass
class RupeeMatrix:
    tp: int
    fp: int
    tn: int
    fn: int
    tp_inr: float
    fp_inr: float
    tn_inr: float
    fn_inr: float

    @property
    def net_inr(self) -> float:
        return self.tp_inr + self.fp_inr + self.tn_inr + self.fn_inr


def rupee_confusion(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    amounts: np.ndarray,
    costs: CostConfig | None = None,
) -> RupeeMatrix:
    """
    TP: flagged and did charge back -> evidence vault existed, dispute defensible.
        Value = amount recovered at the published win rate, less posture cost,
        LESS the contest fee. The fee is charged win or lose (see costs.yaml), so
        omitting it here would overstate TP and contradict the constant's own
        documentation.
    FP: flagged but never disputed -> we paid for a vault nobody needed.
        Cost = posture cost only. A false positive is cheap; that is the point.
    TN: not flagged, not disputed -> zero.
    FN: not flagged but did charge back -> no vault, representment lost.
        Cost = full amount plus the contest fee we cannot recover.

    `costs` lets a caller supply a variant config (e.g. the UI's fee slider) via
    load_costs().model_copy(update={...}). CostConfig is frozen, so the shared
    cached instance can never be mutated out from under other callers.
    """
    costs = costs or load_costs()
    posture = costs.posture_cost_inr["ACTIVE"]
    win = costs.base_win_rate_fraud_coded

    y_true = np.asarray(y_true).astype(bool)
    y_pred = np.asarray(y_pred).astype(bool)
    amounts = np.asarray(amounts, dtype=float)

    tp_m, fp_m = y_true & y_pred, ~y_true & y_pred
    tn_m, fn_m = ~y_true & ~y_pred, y_true & ~y_pred

    return RupeeMatrix(
        tp=int(tp_m.sum()), fp=int(fp_m.sum()),
        tn=int(tn_m.sum()), fn=int(fn_m.sum()),
        tp_inr=float(
            (amounts[tp_m] * win).sum()
            - tp_m.sum() * posture
            - tp_m.sum() * costs.contest_fee_inr
        ),
        fp_inr=float(-fp_m.sum() * posture),
        tn_inr=0.0,
        fn_inr=float(-(amounts[fn_m].sum() + fn_m.sum() * costs.contest_fee_inr)),
    )
```

- [ ] **Step 4: Run the tests**

```bash
.venv/Scripts/python -m pytest tests/test_cost_model.py -v
```

Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add src/dispute_autopilot/economics/ tests/test_cost_model.py
git commit -m "feat: add rupee-denominated cost model"
```

### Task 4.2: The four baselines

**Files:**
- Create: `src/dispute_autopilot/economics/baselines.py`
- Test: `tests/test_baselines.py`

**Interfaces:**
- Consumes: `rupee_confusion`, `build_features`
- Produces: `baseline_predictions(df, name) -> np.ndarray` for names `"none"`, `"all"`, `"rules"`; and `compare_baselines(df, model_pred, threshold) -> dict[str, RupeeMatrix]`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_baselines.py
import numpy as np
import pandas as pd
from dispute_autopilot.economics.baselines import baseline_predictions


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
```

- [ ] **Step 2: Run it to verify it fails**

```bash
.venv/Scripts/python -m pytest tests/test_baselines.py -v
```

Expected: FAIL, `ModuleNotFoundError`

- [ ] **Step 3: Write `baselines.py`**

```python
"""Baselines. Beating 'flag everything' IN RUPEES is the headline result."""
import numpy as np
import pandas as pd

from dispute_autopilot.config import CostConfig, load_costs, load_features
from dispute_autopilot.economics.cost_model import RupeeMatrix, rupee_confusion


def baseline_predictions(
    df: pd.DataFrame, name: str, costs: CostConfig | None = None
) -> np.ndarray:
    n = len(df)
    if name == "none":
        return np.zeros(n, dtype=int)
    if name == "all":
        return np.ones(n, dtype=int)
    if name == "rules":
        # Thresholds live in costs.yaml: this baseline is REPORTED alongside the
        # model, so its parameters are published methodology, not magic numbers.
        rules = (costs or load_costs()).baseline_rules
        amt = pd.to_numeric(df["TransactionAmt"], errors="coerce").fillna(0)
        dist = pd.to_numeric(df.get("dist1"), errors="coerce").fillna(0)
        p, r = df.get("P_emaildomain"), df.get("R_emaildomain")
        # BOTH must be guarded. Guarding only `p` raises AttributeError when
        # P_emaildomain is present and R_emaildomain is absent.
        mismatch = (
            (p.notna() & r.notna() & (p != r))
            if (p is not None and r is not None)
            else False
        )
        return (
            (amt > rules.amount_inr) & ((dist > rules.dist) | mismatch)
        ).astype(int).to_numpy()
    raise ValueError(f"unknown baseline: {name}")


def compare_baselines(
    df: pd.DataFrame,
    model_scores: np.ndarray,
    threshold: float,
    costs: CostConfig | None = None,
) -> dict[str, RupeeMatrix]:
    """`costs` must reach EVERY arm. This produces the headline model-vs-baselines
    table, so a variant config that only half-applies makes the sensitivity
    analysis silently fake."""
    fc = load_features()
    y = df[fc.target].to_numpy()
    amounts = df["TransactionAmt"].to_numpy(dtype=float)
    out = {
        n: rupee_confusion(y, baseline_predictions(df, n, costs=costs), amounts, costs=costs)
        for n in ("none", "all", "rules")
    }
    out["model"] = rupee_confusion(
        y, (model_scores >= threshold).astype(int), amounts, costs=costs
    )
    return out
```

- [ ] **Step 4: Run the tests**

```bash
.venv/Scripts/python -m pytest tests/test_baselines.py -v
```

Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add src/dispute_autopilot/economics/baselines.py tests/test_baselines.py
git commit -m "feat: add four comparison baselines"
```

### Task 4.3: EV-optimal threshold search

**Files:**
- Create: `src/dispute_autopilot/economics/threshold.py`
- Test: `tests/test_threshold.py`

**Interfaces:**
- Consumes: `rupee_confusion`
- Produces: `sweep(y_true, scores, amounts, n_steps=100) -> pd.DataFrame` with columns `threshold, net_inr, precision, recall`; and `optimal_threshold(sweep_df) -> float`

The threshold is chosen by money, never by 0.5. Say this out loud in the video.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_threshold.py
import numpy as np
from dispute_autopilot.economics.threshold import optimal_threshold, sweep


def test_sweep_returns_one_row_per_step_with_required_columns():
    rng = np.random.default_rng(3)
    y = rng.integers(0, 2, 500)
    s = rng.uniform(0, 1, 500)
    a = rng.uniform(100, 10000, 500)
    df = sweep(y, s, a, n_steps=20)
    assert len(df) == 20
    assert {"threshold", "net_inr", "precision", "recall"} <= set(df.columns)


def test_optimal_threshold_maximises_net_rupees():
    rng = np.random.default_rng(4)
    y = rng.integers(0, 2, 500)
    s = rng.uniform(0, 1, 500)
    a = rng.uniform(100, 10000, 500)
    df = sweep(y, s, a, n_steps=20)
    assert optimal_threshold(df) == df.loc[df["net_inr"].idxmax(), "threshold"]
```

- [ ] **Step 2: Run it to verify it fails**

```bash
.venv/Scripts/python -m pytest tests/test_threshold.py -v
```

Expected: FAIL, `ModuleNotFoundError`

- [ ] **Step 3: Write `threshold.py`**

```python
"""Choose the operating threshold by expected value, never by 0.5."""
import numpy as np
import pandas as pd

from dispute_autopilot.config import CostConfig
from dispute_autopilot.economics.cost_model import rupee_confusion


def sweep(
    y_true: np.ndarray,
    scores: np.ndarray,
    amounts: np.ndarray,
    n_steps: int = 100,
    costs: CostConfig | None = None,
) -> pd.DataFrame:
    """`costs` threads a variant config through to rupee_confusion — used by the
    UI's fee slider, which is the sensitivity analysis, not a decoration."""
    rows = []
    for t in np.linspace(0.001, 0.999, n_steps):
        m = rupee_confusion(y_true, (scores >= t).astype(int), amounts, costs=costs)
        rows.append({
            "threshold": float(t),
            "net_inr": m.net_inr,
            "precision": m.tp / (m.tp + m.fp) if (m.tp + m.fp) else 0.0,
            "recall": m.tp / (m.tp + m.fn) if (m.tp + m.fn) else 0.0,
        })
    return pd.DataFrame(rows)


def optimal_threshold(sweep_df: pd.DataFrame) -> float:
    return float(sweep_df.loc[sweep_df["net_inr"].idxmax(), "threshold"])
```

- [ ] **Step 4: Run the tests**

```bash
.venv/Scripts/python -m pytest tests/test_threshold.py -v
```

Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add src/dispute_autopilot/economics/threshold.py tests/test_threshold.py
git commit -m "feat: add EV-optimal threshold search"
```

### Task 4.4: The decision engine

**Files:**
- Create: `src/dispute_autopilot/economics/decision.py`
- Test: `tests/test_decision.py`

**Interfaces:**
- Consumes: `load_costs`, `ASSUMPTION_NOTICE`, contracts `Dispute`, `Decision`, `Action`
- Produces: `decide(dispute: Dispute, p_chargeback: float, w: float, missing_required: list[str]) -> Decision`

`w` is passed in, computed by Task 5.3. No circular dependency.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_decision.py
from dispute_autopilot.contracts import Action, Dispute
from dispute_autopilot.economics.decision import decide


def _d(amount=50000.0):
    return Dispute(dispute_id="disp_1", transaction_id=1,
                   amount_inr=amount, reason_code="fraud_card_absent")


def test_missing_required_evidence_forces_review_regardless_of_economics():
    result = decide(_d(amount=1_000_000.0), p_chargeback=0.01, w=1.0,
                    missing_required=["shipping_proof"])
    assert result.action is Action.REVIEW
    assert "shipping_proof" in result.missing_required


def test_low_risk_high_amount_with_full_evidence_contests():
    result = decide(_d(amount=100000.0), p_chargeback=0.02, w=1.0, missing_required=[])
    assert result.action is Action.CONTEST
    assert result.delta_ev_inr > 0


def test_high_risk_small_amount_accepts():
    result = decide(_d(amount=800.0), p_chargeback=0.95, w=1.0, missing_required=[])
    assert result.action is Action.ACCEPT


def test_every_decision_carries_the_assumption_notice():
    result = decide(_d(), p_chargeback=0.3, w=1.0, missing_required=[])
    assert "not validated" in result.assumption_notice.lower()


def test_the_dispute_fee_does_not_enter_the_contest_accept_differential():
    """The fee is charged win or lose, so it is identical under both branches.

    If it creeps back into delta_ev, changing it will move the answer -- and
    every low-value dispute silently tips toward ACCEPT.
    """
    from dispute_autopilot.config import load_costs

    base = load_costs()
    pricey = base.model_copy(update={"contest_fee_inr": 25_000.0})
    a = decide(_d(), p_chargeback=0.3, w=1.0, missing_required=[])
    b = decide(_d(), p_chargeback=0.3, w=1.0, missing_required=[], costs=pricey)
    assert a.delta_ev_inr == b.delta_ev_inr
    assert a.action is b.action


def test_model_influence_is_clipped_against_the_published_base_rate():
    optimistic = decide(_d(), p_chargeback=0.0, w=1.0, missing_required=[])
    # base rate 0.171, max lift 2.5 -> p_win can never exceed 0.4275
    assert optimistic.p_win <= 0.171 * 2.5 + 1e-9
```

- [ ] **Step 2: Run it to verify it fails**

```bash
.venv/Scripts/python -m pytest tests/test_decision.py -v
```

Expected: FAIL, `ModuleNotFoundError`

- [ ] **Step 3: Write `decision.py`**

```python
"""Expected-value contest/accept/review engine.

Formulation follows US Patent 10,839,394 (representment selection by expected
value). Cited, not reinvented — see README Prior Art.

METRIC FAMILY B (simulated). The win-probability model rests on the spec 8.1
inference, which this dataset cannot validate.
"""
from dispute_autopilot.config import ASSUMPTION_NOTICE, CostConfig, load_costs
from dispute_autopilot.contracts import Action, Decision, Dispute


def _lift(p: float, clip: tuple[float, float]) -> float:
    """Bounded, monotone decreasing in p.

    A low chargeback-risk score raises the win estimate (spec 8.1: it looks like
    first-party misuse); a high score lowers it. Clipped so an unvalidated model
    score cannot overwhelm a published base rate that was actually measured.
    """
    lo, hi = clip
    return max(lo, min(hi, lo + (hi - lo) * (1.0 - p)))


def decide(
    dispute: Dispute,
    p_chargeback: float,
    w: float,
    missing_required: list[str],
    costs: CostConfig | None = None,
) -> Decision:
    costs = costs or load_costs()

    p_win = min(1.0, costs.base_win_rate_fraud_coded * _lift(p_chargeback, costs.lift_clip) * w)

    # delta_ev is CONTEST *relative to* ACCEPT, so only costs that differ
    # between the two belong here.
    #
    # contest_fee_inr is deliberately ABSENT. config/costs.yaml documents it as
    # charged win or lose once a dispute is raised, and cost_model.py subtracts
    # it on both TP and FN for exactly that reason. A cost incurred identically
    # under both branches cancels out of a differential; including it would bias
    # every low-value dispute toward ACCEPT by roughly the fee.
    #
    # ops_cost_inr is the true marginal cost of contesting: staff time we spend
    # only if we actually contest.
    #
    # If a merchant agreement adds a separate penalty for a LOST representment,
    # that is a real term -- but it is a different, currently unsourced number
    # and needs its own constant. Do not reuse contest_fee_inr for it.
    delta_ev = p_win * dispute.amount_inr - costs.ops_cost_inr

    # The evidence gate is absolute. Economics never override it.
    if missing_required:
        action = Action.REVIEW
    elif delta_ev > costs.decision_margin_inr:
        action = Action.CONTEST
    elif delta_ev < -costs.decision_margin_inr:
        action = Action.ACCEPT
    else:
        action = Action.REVIEW

    return Decision(
        dispute_id=dispute.dispute_id,
        action=action,
        p_chargeback=p_chargeback,
        p_win=p_win,
        delta_ev_inr=delta_ev,
        w_completeness=w,
        missing_required=missing_required,
        assumption_notice=ASSUMPTION_NOTICE,
    )
```

- [ ] **Step 4: Run the tests**

```bash
.venv/Scripts/python -m pytest tests/test_decision.py -v
```

Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add src/dispute_autopilot/economics/decision.py tests/test_decision.py
git commit -m "feat: add expected-value decision engine with absolute evidence gate"
```

---

## Phase 5 — Case files and the vault (3 Sep, morning)

### Task 5.1: Deterministic evidence synthesis

**Files:**
- Create: `src/dispute_autopilot/casefile/synthesize.py`, `src/dispute_autopilot/casefile/__init__.py`
- Test: `tests/test_synthesize.py`

**Interfaces:**
- Consumes: a single transaction row, `Posture`
- Produces: `synthesize_casefile(row: pd.Series, posture: Posture, seed: int) -> CaseFile`

Evidence is generated **consistently with the row's real features**: `M`-flags drive billing match, `dist1` drives shipping-address divergence. Same row plus same seed always yields the same case file.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_synthesize.py
import pandas as pd
from dispute_autopilot.contracts import CaseFile, Posture
from dispute_autopilot.casefile.synthesize import synthesize_casefile


def _row(**over):
    base = {"TransactionID": 42, "TransactionAmt": 2499.0, "TransactionDT": 86400,
            "M1": "T", "M2": "T", "M6": "T", "dist1": 5.0,
            "P_emaildomain": "gmail.com", "R_emaildomain": "gmail.com",
            "DeviceType": "desktop", "DeviceInfo": "Windows"}
    base.update(over)
    return pd.Series(base)


def test_generation_is_deterministic():
    a = synthesize_casefile(_row(), Posture.ACTIVE, seed=7)
    b = synthesize_casefile(_row(), Posture.ACTIVE, seed=7)
    assert a.model_dump() == b.model_dump()


def test_billing_proof_reflects_the_real_match_flags():
    matched = synthesize_casefile(_row(M1="T", M2="T", M6="T"), Posture.ACTIVE, seed=1)
    assert "match" in matched.items["billing_proof"].value.lower()
    unmatched = synthesize_casefile(_row(M1="F", M2="F", M6="F"), Posture.ACTIVE, seed=1)
    assert "mismatch" in unmatched.items["billing_proof"].value.lower()


def test_passive_posture_yields_fewer_items_than_active():
    p = synthesize_casefile(_row(), Posture.PASSIVE, seed=1)
    a = synthesize_casefile(_row(), Posture.ACTIVE, seed=1)
    assert len(p.items) < len(a.items)


def test_none_posture_yields_an_empty_vault():
    assert synthesize_casefile(_row(), Posture.NONE, seed=1).items == {}
```

- [ ] **Step 2: Run it to verify it fails**

```bash
.venv/Scripts/python -m pytest tests/test_synthesize.py -v
```

Expected: FAIL, `ModuleNotFoundError`

- [ ] **Step 3: Write `synthesize.py`**

```python
"""Deterministic evidence synthesis from real transaction features.

IEEE-CIS has no order records or tracking numbers, so evidence documents are
generated — but generated CONSISTENTLY with each row's real features, so the
case file never contradicts the data the model scored.

The evidence corpus is SYNTHETIC. The decision model's labels are REAL.
State this distinction in the README and the video.
"""
import hashlib

import pandas as pd

from dispute_autopilot.contracts import CaseFile, EvidenceItem, Posture

PASSIVE_FIELDS = ["billing_proof", "access_activity_log", "term_and_conditions"]
ACTIVE_EXTRA = ["shipping_proof", "customer_communication"]


def _stable_id(txn_id: int, seed: int, tag: str) -> str:
    digest = hashlib.sha256(f"{txn_id}:{seed}:{tag}".encode()).hexdigest()
    return digest[:12].upper()


def synthesize_casefile(row: pd.Series, posture: Posture, seed: int = 0) -> CaseFile:
    txn_id = int(row["TransactionID"])
    if posture is Posture.NONE:
        return CaseFile(transaction_id=txn_id, posture=posture, items={})

    flags = [str(row.get(m, "")).upper() for m in ("M1", "M2", "M6")]
    matched = sum(f == "T" for f in flags) >= 2
    dist = pd.to_numeric(pd.Series([row.get("dist1")]), errors="coerce").iloc[0]
    far = bool(pd.notna(dist) and dist > 100)

    items: dict[str, EvidenceItem] = {
        "billing_proof": EvidenceItem(
            field="billing_proof",
            value=(f"AVS match on name and postcode (M1/M2/M6 = {'/'.join(flags)})"
                   if matched else
                   f"AVS mismatch on name or postcode (M1/M2/M6 = {'/'.join(flags)})"),
            source="avs_result",
        ),
        "access_activity_log": EvidenceItem(
            field="access_activity_log",
            value=(f"Session from {row.get('DeviceType', 'unknown')} device "
                   f"({row.get('DeviceInfo', 'unknown')}), "
                   f"session {_stable_id(txn_id, seed, 'sess')}"),
            source="device_fingerprint",
        ),
        "term_and_conditions": EvidenceItem(
            field="term_and_conditions",
            value=f"T&C v3.1 accepted at checkout, ref {_stable_id(txn_id, seed, 'tnc')}",
            source="checkout_log",
        ),
    }

    if True:  # built unconditionally, then filtered by posture below
        items["shipping_proof"] = EvidenceItem(
            field="shipping_proof",
            value=(f"Delivered, signature captured, AWB {_stable_id(txn_id, seed, 'awb')}"
                   + (" — shipping address differs from billing address"
                      if far else " — shipping address matches billing address")),
            source="carrier_tracking",
        )
        items["customer_communication"] = EvidenceItem(
            field="customer_communication",
            value=(f"Order confirmation emailed to {row.get('P_emaildomain', 'customer')}; "
                   f"no reply received. Thread {_stable_id(txn_id, seed, 'mail')}"),
            source="email_log",
        )

    # PASSIVE_FIELDS / ACTIVE_EXTRA are the single source of truth for which
    # posture yields which evidence. Filtering here rather than branching above
    # keeps those constants load-bearing: if they were merely declared while the
    # dict was hand-built, the two would drift apart silently and 5.3's
    # required-evidence gate would be reasoning about the wrong field set.
    allowed = PASSIVE_FIELDS + (ACTIVE_EXTRA if posture is Posture.ACTIVE else [])
    return CaseFile(
        transaction_id=txn_id,
        posture=posture,
        items={k: v for k, v in items.items() if k in allowed},
    )
```

- [ ] **Step 4: Run the tests**

```bash
.venv/Scripts/python -m pytest tests/test_synthesize.py -v
```

Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add src/dispute_autopilot/casefile/ tests/test_synthesize.py
git commit -m "feat: add deterministic case-file synthesis"
```

### Task 5.2: Vault store and posture policy

**Files:**
- Create: `src/dispute_autopilot/casefile/store.py`
- Test: `tests/test_store.py`

**Interfaces:**
- Consumes: `synthesize_casefile`, `load_costs`
- Produces: `choose_posture(p_chargeback: float, amount_inr: float) -> Posture`; `VaultStore.put(casefile)`, `VaultStore.get(transaction_id) -> CaseFile | None`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_store.py
from dispute_autopilot.contracts import CaseFile, Posture
from dispute_autopilot.casefile.store import VaultStore, choose_posture


def test_posture_escalates_with_expected_exposure():
    assert choose_posture(0.001, 100.0) is Posture.NONE
    assert choose_posture(0.9, 100000.0) is Posture.ACTIVE


def test_posture_is_monotone_in_exposure():
    ladder = [choose_posture(p, 50000.0) for p in (0.001, 0.05, 0.9)]
    order = {Posture.NONE: 0, Posture.PASSIVE: 1, Posture.ACTIVE: 2}
    assert [order[p] for p in ladder] == sorted(order[p] for p in ladder)


def test_vault_round_trips_a_casefile(tmp_path):
    store = VaultStore(root=tmp_path)
    cf = CaseFile(transaction_id=99, posture=Posture.PASSIVE, items={})
    store.put(cf)
    assert store.get(99).transaction_id == 99
    assert store.get(12345) is None
```

- [ ] **Step 2: Run it to verify it fails**

```bash
.venv/Scripts/python -m pytest tests/test_store.py -v
```

Expected: FAIL, `ModuleNotFoundError`

- [ ] **Step 3: Write `store.py`**

```python
"""Evidence vault plus the posture policy.

METRIC FAMILY B (simulated): the vault's benefit has no counterfactual in this
data. Report it as a policy simulation, never as a measured result.
"""
import json
from pathlib import Path

from dispute_autopilot.config import CostConfig, load_costs
from dispute_autopilot.contracts import CaseFile, Posture

VAULT_ROOT = Path(__file__).resolve().parents[3] / "data" / "vault"


def choose_posture(
    p_chargeback: float, amount_inr: float, costs: CostConfig | None = None
) -> Posture:
    """Expected exposure = P(chargeback) * amount. Spend on evidence in proportion.

    Thresholds live in config/costs.yaml beside posture_cost_inr. They are the
    vault's policy dial and get reported, so they are published methodology --
    not literals buried in this module.
    """
    thresholds = (costs or load_costs()).posture_thresholds_inr
    exposure = p_chargeback * amount_inr
    if exposure >= thresholds["ACTIVE"]:
        return Posture.ACTIVE
    if exposure >= thresholds["PASSIVE"]:
        return Posture.PASSIVE
    return Posture.NONE


class VaultStore:
    def __init__(self, root: Path = VAULT_ROOT):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, transaction_id: int) -> Path:
        return self.root / f"{transaction_id}.json"

    def put(self, casefile: CaseFile) -> None:
        self._path(casefile.transaction_id).write_text(casefile.model_dump_json(indent=2))

    def get(self, transaction_id: int) -> CaseFile | None:
        path = self._path(transaction_id)
        if not path.exists():
            return None
        return CaseFile(**json.loads(path.read_text()))
```

- [ ] **Step 4: Run the tests**

```bash
.venv/Scripts/python -m pytest tests/test_store.py -v
```

Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add src/dispute_autopilot/casefile/store.py tests/test_store.py
git commit -m "feat: add evidence vault and posture policy"
```

### Task 5.3: Completeness multiplier and the required-evidence gate

**Files:**
- Create: `src/dispute_autopilot/casefile/completeness.py`
- Test: `tests/test_completeness.py`

**Interfaces:**
- Consumes: `CaseFile`, `load_costs`
- Produces: `assess(casefile: CaseFile, reason_code: str) -> tuple[float, list[str]]` returning `(w, missing_required)` — feeds Task 4.4's `decide`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_completeness.py
from dispute_autopilot.contracts import CaseFile, EvidenceItem, Posture
from dispute_autopilot.casefile.completeness import assess


def _cf(fields):
    return CaseFile(
        transaction_id=1, posture=Posture.ACTIVE,
        items={f: EvidenceItem(field=f, value="v", source="s") for f in fields},
    )


def test_all_required_present_gives_w_at_or_near_one():
    w, missing = assess(_cf(["billing_proof", "shipping_proof"]), "fraud_card_absent")
    assert missing == []
    assert 0.9 <= w <= 1.0


def test_missing_required_is_reported_and_penalised():
    w, missing = assess(_cf(["billing_proof"]), "fraud_card_absent")
    assert missing == ["shipping_proof"]
    assert w < 1.0


def test_supporting_evidence_raises_w_but_never_above_one():
    base, _ = assess(_cf(["billing_proof", "shipping_proof"]), "fraud_card_absent")
    more, _ = assess(
        _cf(["billing_proof", "shipping_proof", "customer_communication",
             "access_activity_log", "term_and_conditions"]),
        "fraud_card_absent",
    )
    assert more >= base
    assert more <= 1.0


def test_empty_vault_reports_every_required_field_missing():
    w, missing = assess(_cf([]), "fraud_card_absent")
    assert set(missing) == {"billing_proof", "shipping_proof"}
```

- [ ] **Step 2: Run it to verify it fails**

```bash
.venv/Scripts/python -m pytest tests/test_completeness.py -v
```

Expected: FAIL, `ModuleNotFoundError`

- [ ] **Step 3: Write `completeness.py`**

```python
"""Evidence completeness multiplier w, and the required-field gate.

w is configuration, not a learned parameter. Fitting it to our data would be
circular, since the data contains no dispute outcomes.
"""
from dispute_autopilot.config import load_costs
from dispute_autopilot.contracts import CaseFile


def assess(casefile: CaseFile, reason_code: str) -> tuple[float, list[str]]:
    costs = load_costs()
    rc = costs.reason_codes[reason_code]
    c = costs.completeness

    present = set(casefile.items)
    missing = [f for f in rc.required if f not in present]

    w = 1.0
    for _ in missing:
        w *= c.missing_required_penalty
    for field in rc.supporting:
        if field in present:
            w *= c.supporting_bonus

    return min(1.0, max(0.0, w)), missing
```

- [ ] **Step 4: Run the tests**

```bash
.venv/Scripts/python -m pytest tests/test_completeness.py -v
```

Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add src/dispute_autopilot/casefile/completeness.py tests/test_completeness.py
git commit -m "feat: add evidence completeness multiplier and required-field gate"
```

---

## Phase 6 — The assembler (3 Sep)

This is the AI-native part and the centre of the demo. Model: `claude-opus-5`. Structured output via `client.messages.parse()` with a Pydantic `output_format`.

### Task 6.1: Razorpay evidence schema

**Files:**
- Create: `src/dispute_autopilot/razorpay/schema.py`, `src/dispute_autopilot/razorpay/__init__.py`
- Test: `tests/test_razorpay_schema.py`

**Interfaces:**
- Consumes: `EvidenceBundle`
- Produces: `RAZORPAY_EVIDENCE_FIELDS: frozenset[str]`, `validate_bundle(bundle) -> list[str]` (returns error strings, empty means valid), `to_contest_payload(bundle) -> dict`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_razorpay_schema.py
from dispute_autopilot.contracts import EvidenceBundle
from dispute_autopilot.razorpay.schema import (
    RAZORPAY_EVIDENCE_FIELDS, to_contest_payload, validate_bundle,
)


def test_known_fields_are_accepted():
    b = EvidenceBundle(dispute_id="d1", fields={"shipping_proof": "AWB 123"})
    assert validate_bundle(b) == []


def test_unknown_fields_are_rejected():
    b = EvidenceBundle(dispute_id="d1", fields={"vibes": "good"})
    errors = validate_bundle(b)
    assert any("vibes" in e for e in errors)


def test_empty_bundle_is_rejected_because_razorpay_requires_at_least_one():
    assert validate_bundle(EvidenceBundle(dispute_id="d1", fields={})) != []


def test_payload_shape_matches_the_contest_api():
    b = EvidenceBundle(dispute_id="d1", fields={"shipping_proof": "AWB 123"})
    payload = to_contest_payload(b)
    assert payload["action"] == "submit"
    assert payload["evidence"]["shipping_proof"] == "AWB 123"


def test_the_schema_contains_the_documented_field_names():
    for f in ("shipping_proof", "billing_proof", "explanation_letter",
              "customer_communication", "refund_cancellation_policy"):
        assert f in RAZORPAY_EVIDENCE_FIELDS
```

- [ ] **Step 2: Run it to verify it fails**

```bash
.venv/Scripts/python -m pytest tests/test_razorpay_schema.py -v
```

Expected: FAIL, `ModuleNotFoundError`

- [ ] **Step 3: Write `schema.py`**

```python
"""Razorpay dispute evidence schema.

Field names from Razorpay's Submit Evidence documentation. Razorpay requires at
least one evidence attribute for a successful contest submission.
"""
from dispute_autopilot.contracts import EvidenceBundle

RAZORPAY_EVIDENCE_FIELDS = frozenset({
    "shipping_proof",
    "billing_proof",
    "cancellation_proof",
    "customer_communication",
    "proof_of_service",
    "explanation_letter",
    "refund_confirmation",
    "access_activity_log",
    "refund_cancellation_policy",
    "term_and_conditions",
})


def validate_bundle(bundle: EvidenceBundle) -> list[str]:
    errors: list[str] = []
    if not bundle.fields:
        errors.append("at least one evidence field is required by Razorpay")
    for name in bundle.fields:
        if name not in RAZORPAY_EVIDENCE_FIELDS:
            errors.append(f"unknown evidence field: {name}")
    for name, value in bundle.fields.items():
        if not str(value).strip():
            errors.append(f"empty value for evidence field: {name}")
    return errors


def to_contest_payload(bundle: EvidenceBundle) -> dict:
    """Body for PATCH /v1/disputes/:id/contest."""
    return {"action": "submit", "evidence": dict(bundle.fields)}
```

- [ ] **Step 4: Run the tests**

```bash
.venv/Scripts/python -m pytest tests/test_razorpay_schema.py -v
```

Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add src/dispute_autopilot/razorpay/ tests/test_razorpay_schema.py
git commit -m "feat: add Razorpay evidence schema validation"
```

### Task 6.2: Grounded evidence assembly

**Files:**
- Create: `src/dispute_autopilot/assembler/prompts.py`, `src/dispute_autopilot/assembler/assemble.py`, `src/dispute_autopilot/assembler/__init__.py`
- Test: `tests/test_assemble.py`

**Interfaces:**
- Consumes: `CaseFile`, `Dispute`, `RAZORPAY_EVIDENCE_FIELDS`
- Produces: `build_prompt(dispute, casefile) -> str`; `assemble(dispute, casefile, client=None) -> EvidenceBundle`

The LLM call is isolated behind a **provider seam** so tests never hit the network AND
so the build does not hard-depend on one vendor's billing working. Three providers ship:
Anthropic, OpenAI, and a deterministic template provider that needs no key at all and
guarantees the demo runs. Task 6.3's groundedness verifier sits downstream of whichever
one is used, which is what makes the choice a detail rather than a safety question.

Note the honest cost of the template provider: with it, metric family C (measured
generation quality) is trivially perfect and therefore says nothing. Family C needs a
real LLM to mean anything.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_assemble.py
from dispute_autopilot.contracts import CaseFile, Dispute, EvidenceItem, Posture
from dispute_autopilot.assembler.prompts import build_prompt


def _cf():
    return CaseFile(
        transaction_id=42, posture=Posture.ACTIVE,
        items={
            "billing_proof": EvidenceItem(
                field="billing_proof", value="AVS match on name and postcode",
                source="avs_result"),
            "shipping_proof": EvidenceItem(
                field="shipping_proof", value="Delivered, signature captured, AWB ABC123",
                source="carrier_tracking"),
        },
    )


def _d():
    return Dispute(dispute_id="disp_1", transaction_id=42,
                   amount_inr=2499.0, reason_code="fraud_card_absent")


def test_prompt_contains_every_vault_value():
    prompt = build_prompt(_d(), _cf())
    assert "AVS match on name and postcode" in prompt
    assert "AWB ABC123" in prompt


def test_prompt_forbids_facts_not_in_the_vault():
    prompt = build_prompt(_d(), _cf()).lower()
    assert "only" in prompt
    assert "do not invent" in prompt or "never invent" in prompt


def test_the_module_imports_with_no_llm_sdk_and_no_api_key(monkeypatch):
    """A missing key must not make this module unimportable.

    `import anthropic` / `import openai` at module scope would turn a billing
    problem into a red test suite -- the failure `import kaggle` already caused.
    """
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    from dispute_autopilot.assembler.assemble import assemble, default_provider

    assert default_provider() is None
    bundle = assemble(_d(), _cf())          # falls back to templates, no network
    assert bundle.fields                    # and still produces a usable bundle


def test_the_template_path_copies_vault_values_verbatim(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    from dispute_autopilot.assembler.assemble import assemble

    bundle = assemble(_d(), _cf())
    assert bundle.fields["billing_proof"] == "AVS match on name and postcode"
    assert {c.source_field for c in bundle.claims} == {"avs_result", "carrier_tracking"}


def test_a_stub_provider_is_used_when_supplied():
    """The seam must actually be a seam: substitutable, and never touching the network."""
    from dispute_autopilot.assembler.assemble import assemble

    def stub(system, prompt, schema):
        assert "AVS match on name and postcode" in prompt
        return schema(fields={"billing_proof": "x"},
                      claims=[{"text": "x", "source_field": "avs_result"}])

    bundle = assemble(_d(), _cf(), provider=stub)
    assert bundle.fields == {"billing_proof": "x"}


def test_prompt_lists_the_available_source_keys():
    prompt = build_prompt(_d(), _cf())
    assert "avs_result" in prompt and "carrier_tracking" in prompt
```

- [ ] **Step 2: Run it to verify it fails**

```bash
.venv/Scripts/python -m pytest tests/test_assemble.py -v
```

Expected: FAIL, `ModuleNotFoundError`

- [ ] **Step 3: Write `prompts.py`**

```python
"""Prompt construction for evidence assembly.

The prompt is deliberately restrictive: the model may use ONLY vault contents.
Task 6.3 verifies compliance deterministically, so this is enforced, not trusted.
"""
from dispute_autopilot.contracts import CaseFile, Dispute

SYSTEM = (
    "You are a payments dispute analyst preparing a chargeback representment. "
    "You may use ONLY the facts in the provided case file. Do not invent order "
    "numbers, tracking numbers, dates, amounts, or communications. If a fact "
    "needed for an argument is absent, omit the argument and say what is missing. "
    "Every claim you make must name the case-file source key it came from."
)


def build_prompt(dispute: Dispute, casefile: CaseFile) -> str:
    lines = [
        f"Dispute {dispute.dispute_id} for INR {dispute.amount_inr:.2f}, "
        f"reason code: {dispute.reason_code}.",
        "",
        "CASE FILE (the only facts you may use):",
    ]
    for field, item in sorted(casefile.items.items()):
        lines.append(f"- evidence_field={field} | source_key={item.source} | value={item.value}")
    lines += [
        "",
        "Available source keys: " + ", ".join(sorted(i.source for i in casefile.items.values())),
        "",
        "Produce the evidence bundle. For each Razorpay evidence field you can "
        "support, write the value using only the facts above. Then write an "
        "explanation_letter. List each factual claim separately with the "
        "source_field it relies on.",
    ]
    return "\n".join(lines)
```

- [ ] **Step 4: Run the prompt tests**

```bash
.venv/Scripts/python -m pytest tests/test_assemble.py -v
```

Expected: 6 passed

- [ ] **Step 5: Write `assemble.py`**

```python
"""Evidence assembly behind a provider seam.

No LLM SDK is imported at module scope. Importing `anthropic` or `openai` at
import time makes this module unimportable -- and the whole test suite red --
on a machine with no key, which is the same class of bug that `import kaggle`
caused in ingest/download.py. Each provider imports its own SDK inside itself.
"""
import os
from typing import Callable

from pydantic import BaseModel, Field

from dispute_autopilot.assembler.prompts import SYSTEM, build_prompt
from dispute_autopilot.contracts import CaseFile, Claim, Dispute, EvidenceBundle

ANTHROPIC_MODEL = "claude-opus-5"
OPENAI_MODEL = "gpt-4.1"

# (system, prompt, schema) -> a validated instance of schema
Provider = Callable[[str, str, type[BaseModel]], BaseModel]


class _AssembledClaim(BaseModel):
    text: str = Field(description="One factual claim used in the representment")
    source_field: str = Field(description="The case-file source key backing this claim")


class _AssembledBundle(BaseModel):
    fields: dict[str, str] = Field(
        description="Razorpay evidence field name -> value, built only from case-file facts"
    )
    claims: list[_AssembledClaim] = Field(
        description="Every factual claim made, each attributed to a source key"
    )


def anthropic_provider(system: str, prompt: str, schema: type[BaseModel]) -> BaseModel:
    import anthropic  # inside: constructing a client requires credentials

    response = anthropic.Anthropic().messages.parse(
        model=ANTHROPIC_MODEL,
        max_tokens=16000,
        system=system,
        messages=[{"role": "user", "content": prompt}],
        output_format=schema,
    )
    return response.parsed_output


def openai_provider(system: str, prompt: str, schema: type[BaseModel]) -> BaseModel:
    import openai

    completion = openai.OpenAI().beta.chat.completions.parse(
        model=OPENAI_MODEL,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ],
        response_format=schema,
    )
    return completion.choices[0].message.parsed


def default_provider() -> Provider | None:
    """Whichever key is present, else None -> the deterministic path.

    Checked in this order so a machine holding both keys uses Anthropic.
    """
    if os.getenv("ANTHROPIC_API_KEY"):
        return anthropic_provider
    if os.getenv("OPENAI_API_KEY"):
        return openai_provider
    return None


def assemble_deterministic(dispute: Dispute, casefile: CaseFile) -> EvidenceBundle:
    """Template assembly. No network, no key, no possibility of hallucination.

    Every value is copied verbatim from the vault, so groundedness is true by
    construction rather than by verification. That makes it a safe fallback and
    a useless benchmark: it cannot fail the family C metrics it would be scored
    on. Do not report family C numbers produced by this path.
    """
    return EvidenceBundle(
        dispute_id=dispute.dispute_id,
        fields={field: item.value for field, item in sorted(casefile.items.items())},
        claims=[
            Claim(text=item.value, source_field=item.source)
            for _, item in sorted(casefile.items.items())
        ],
    )


def assemble(
    dispute: Dispute,
    casefile: CaseFile,
    provider: Provider | None = None,
) -> EvidenceBundle:
    """`provider=None` resolves from the environment, then falls back to templates."""
    provider = provider or default_provider()
    if provider is None:
        return assemble_deterministic(dispute, casefile)

    parsed = provider(SYSTEM, build_prompt(dispute, casefile), _AssembledBundle)
    return EvidenceBundle(
        dispute_id=dispute.dispute_id,
        fields=parsed.fields,
        claims=[Claim(text=c.text, source_field=c.source_field) for c in parsed.claims],
    )
```

`grounded=False` is deliberate. Nothing is trusted until Task 6.3 verifies it.

- [ ] **Step 6: Smoke-test against the real API once**

```bash
.venv/Scripts/python -c "
from dispute_autopilot.contracts import *
from dispute_autopilot.assembler.assemble import assemble
cf = CaseFile(transaction_id=42, posture=Posture.ACTIVE, items={
 'billing_proof': EvidenceItem(field='billing_proof', value='AVS match on name and postcode', source='avs_result'),
 'shipping_proof': EvidenceItem(field='shipping_proof', value='Delivered, signature captured, AWB ABC123', source='carrier_tracking')})
d = Dispute(dispute_id='disp_1', transaction_id=42, amount_inr=2499.0, reason_code='fraud_card_absent')
b = assemble(d, cf)
print(b.fields.keys()); print(len(b.claims), 'claims')
"
```

Expected: several evidence fields and a non-empty claim list. If this errors on auth, check `ANTHROPIC_API_KEY` in `.env`.

- [ ] **Step 7: Commit**

```bash
git add src/dispute_autopilot/assembler/ tests/test_assemble.py
git commit -m "feat: add grounded evidence assembly via Claude structured output"
```

### Task 6.3: Groundedness verifier

**Files:**
- Create: `src/dispute_autopilot/assembler/verify.py`
- Test: `tests/test_verify.py`

**Interfaces:**
- Consumes: `EvidenceBundle`, `CaseFile`
- Produces: `verify(bundle, casefile) -> EvidenceBundle` (returns a copy with `grounded` set per claim)

This is the defense-only guarantee. It is deterministic — no model judges the model.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_verify.py
from dispute_autopilot.contracts import CaseFile, Claim, EvidenceBundle, EvidenceItem, Posture
from dispute_autopilot.assembler.verify import verify


def _cf():
    return CaseFile(
        transaction_id=1, posture=Posture.ACTIVE,
        items={"shipping_proof": EvidenceItem(
            field="shipping_proof",
            value="Delivered, signature captured, AWB ABC123",
            source="carrier_tracking")},
    )


def _bundle(claims):
    return EvidenceBundle(dispute_id="d1", fields={"shipping_proof": "x"}, claims=claims)


def test_claim_backed_by_a_real_source_is_grounded():
    out = verify(_bundle([Claim(text="Parcel delivered with signature",
                                source_field="carrier_tracking")]), _cf())
    assert out.claims[0].grounded is True


def test_claim_citing_a_nonexistent_source_is_not_grounded():
    out = verify(_bundle([Claim(text="Customer called us",
                                source_field="phone_log")]), _cf())
    assert out.claims[0].grounded is False


def test_claim_with_no_source_is_not_grounded():
    out = verify(_bundle([Claim(text="Obviously legitimate", source_field=None)]), _cf())
    assert out.claims[0].grounded is False


def test_invented_identifier_is_caught_even_with_a_valid_source():
    out = verify(_bundle([Claim(text="Shipped under AWB ZZZ999",
                                source_field="carrier_tracking")]), _cf())
    assert out.claims[0].grounded is False


def test_groundedness_property_reflects_the_verified_claims():
    out = verify(_bundle([
        Claim(text="Parcel delivered with signature", source_field="carrier_tracking"),
        Claim(text="Customer called us", source_field="phone_log"),
    ]), _cf())
    assert abs(out.groundedness - 0.5) < 1e-9
```

- [ ] **Step 2: Run it to verify it fails**

```bash
.venv/Scripts/python -m pytest tests/test_verify.py -v
```

Expected: FAIL, `ModuleNotFoundError`

- [ ] **Step 3: Write `verify.py`**

```python
"""Deterministic groundedness verification.

No model judges the model. A claim is grounded only if:
  1. it names a source key,
  2. that key exists in the case file, and
  3. every identifier-like token in the claim (AWB numbers, order refs, amounts)
     also appears in that source's value.

Rule 3 is what catches a plausible-sounding invented tracking number, which is
the failure mode that matters for a system that must not fabricate evidence.

WHAT THIS DOES NOT CATCH, stated plainly because the README claims a safety
property and the claim must be honest: rule 3 compares identifier-like tokens.
Invented PROSE carrying no identifier -- "the customer confirmed receipt by
phone" -- passes if it cites a real source key. The defence against that is
Task 7.2's refusal gate combined with a narrow source vocabulary, not this
function. Do not describe this verifier as preventing all fabrication.
"""
import re

from dispute_autopilot.contracts import CaseFile, EvidenceBundle

# Tokens that look like identifiers or quantities: things a model can invent.
IDENTIFIER = re.compile(r"\b(?=[A-Za-z]*\d)[A-Za-z0-9][A-Za-z0-9\-/]{3,}\b")


def _identifiers(text: str) -> set[str]:
    return {m.group(0).upper() for m in IDENTIFIER.finditer(text)}


def verify(bundle: EvidenceBundle, casefile: CaseFile) -> EvidenceBundle:
    by_source = {item.source: item.value for item in casefile.items.values()}
    out = bundle.model_copy(deep=True)

    for claim in out.claims:
        if not claim.source_field or claim.source_field not in by_source:
            claim.grounded = False
            continue
        source_ids = _identifiers(by_source[claim.source_field])
        claim.grounded = _identifiers(claim.text) <= source_ids

    return out
```

- [ ] **Step 4: Run the tests**

```bash
.venv/Scripts/python -m pytest tests/test_verify.py -v
```

Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add src/dispute_autopilot/assembler/verify.py tests/test_verify.py
git commit -m "feat: add deterministic groundedness verifier"
```

---

## Phase 7 — Integration (3 Sep, afternoon). SCOPE FREEZES AT THE END OF THIS PHASE.

### Task 7.1: Razorpay client with dry-run adapter

**Files:**
- Create: `src/dispute_autopilot/razorpay/client.py`
- Test: `tests/test_razorpay_client.py`

**Interfaces:**
- Consumes: `to_contest_payload`, `validate_bundle`
- Produces: `DryRunClient.contest(dispute_id, bundle) -> dict`, `LiveClient.contest(dispute_id, bundle) -> dict`, `get_client(live: bool)`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_razorpay_client.py
import pytest
from dispute_autopilot.contracts import EvidenceBundle
from dispute_autopilot.razorpay.client import DryRunClient


def test_dry_run_returns_the_validated_payload_without_transmitting():
    c = DryRunClient()
    b = EvidenceBundle(dispute_id="d1", fields={"shipping_proof": "AWB 123"})
    result = c.contest("d1", b)
    assert result["transmitted"] is False
    assert result["payload"]["evidence"]["shipping_proof"] == "AWB 123"
    assert result["endpoint"] == "PATCH /v1/disputes/d1/contest"


def test_dry_run_refuses_an_invalid_bundle():
    with pytest.raises(ValueError):
        DryRunClient().contest("d1", EvidenceBundle(dispute_id="d1", fields={}))
```

- [ ] **Step 2: Run it to verify it fails**

```bash
.venv/Scripts/python -m pytest tests/test_razorpay_client.py -v
```

Expected: FAIL, `ModuleNotFoundError`

- [ ] **Step 3: Write `client.py`**

```python
"""Razorpay adapters.

Whether the live path is usable is recorded in docs/gates/G2-razorpay-test-mode.md.
The dry-run adapter constructs and validates a real payload without transmitting,
and is what the demo uses by default.
"""
import os

from dispute_autopilot.contracts import EvidenceBundle
from dispute_autopilot.razorpay.schema import to_contest_payload, validate_bundle


class DryRunClient:
    live = False

    def contest(self, dispute_id: str, bundle: EvidenceBundle) -> dict:
        errors = validate_bundle(bundle)
        if errors:
            raise ValueError(f"invalid evidence bundle: {errors}")
        return {
            "transmitted": False,
            "endpoint": f"PATCH /v1/disputes/{dispute_id}/contest",
            "payload": to_contest_payload(bundle),
        }


class LiveClient:
    live = True

    def __init__(self):
        import razorpay
        self._client = razorpay.Client(
            auth=(os.environ["RAZORPAY_KEY_ID"], os.environ["RAZORPAY_KEY_SECRET"])
        )

    def contest(self, dispute_id: str, bundle: EvidenceBundle) -> dict:
        errors = validate_bundle(bundle)
        if errors:
            raise ValueError(f"invalid evidence bundle: {errors}")
        payload = to_contest_payload(bundle)
        response = self._client.dispute.contest(dispute_id, payload)
        return {"transmitted": True,
                "endpoint": f"PATCH /v1/disputes/{dispute_id}/contest",
                "payload": payload, "response": response}


def get_client(live: bool = False):
    return LiveClient() if live else DryRunClient()
```

- [ ] **Step 4: Run the tests**

```bash
.venv/Scripts/python -m pytest tests/test_razorpay_client.py -v
```

Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add src/dispute_autopilot/razorpay/client.py tests/test_razorpay_client.py
git commit -m "feat: add Razorpay dry-run and live contest adapters"
```

### Task 7.2: Triage orchestration

**Files:**
- Create: `src/dispute_autopilot/triage.py`
- Test: `tests/test_triage.py`

**Interfaces:**
- Consumes: `Scorer`, `VaultStore`, `assess`, `decide`, `assemble`, `verify`
- Produces: `triage(dispute, txn_row, scorer, vault, assembler=None) -> Decision`

This is the single call the API and the UI both use. It is where the refusal path becomes observable.

- [ ] **Step 1: Write the failing test**

```python
# tests/test_triage.py
import pandas as pd
from dispute_autopilot.contracts import (
    Action, CaseFile, Dispute, EvidenceBundle, EvidenceItem, Posture, RiskScore,
)
from dispute_autopilot.triage import triage


class _FakeScorer:
    def __init__(self, p): self.p = p
    def score_one(self, row):
        return RiskScore(transaction_id=int(row["TransactionID"].iloc[0]),
                         p_chargeback=self.p, calibrated=True, top_reasons=[])


class _FakeVault:
    def __init__(self, cf): self.cf = cf
    def get(self, _): return self.cf


def _row():
    return pd.DataFrame([{"TransactionID": 42, "TransactionAmt": 2499.0}])


def _full_cf():
    return CaseFile(transaction_id=42, posture=Posture.ACTIVE, items={
        f: EvidenceItem(field=f, value="v", source=f"src_{f}")
        for f in ("billing_proof", "shipping_proof")})


def _d(amount=90000.0):
    return Dispute(dispute_id="d1", transaction_id=42,
                   amount_inr=amount, reason_code="fraud_card_absent")


def test_missing_evidence_yields_review_and_never_calls_the_assembler():
    called = []
    def _assembler(*a, **k):
        called.append(1)
        return EvidenceBundle(dispute_id="d1")
    empty = CaseFile(transaction_id=42, posture=Posture.NONE, items={})
    result = triage(_d(), _row(), _FakeScorer(0.02), _FakeVault(empty), _assembler)
    assert result.action is Action.REVIEW
    assert called == []
    assert "billing_proof" in result.missing_required


def test_an_absent_vault_entry_is_treated_as_no_evidence():
    class _Empty:
        def get(self, _): return None
    result = triage(_d(), _row(), _FakeScorer(0.02), _Empty(), lambda *a, **k: None)
    assert result.action is Action.REVIEW


def test_contest_path_attaches_a_verified_bundle():
    def _assembler(dispute, casefile):
        from dispute_autopilot.contracts import Claim
        return EvidenceBundle(
            dispute_id=dispute.dispute_id, fields={"shipping_proof": "v"},
            claims=[Claim(text="delivered", source_field="src_shipping_proof")])
    result = triage(_d(), _row(), _FakeScorer(0.01), _FakeVault(_full_cf()), _assembler)
    assert result.action is Action.CONTEST
    assert result.bundle is not None
    assert result.bundle.claims[0].grounded is True


def test_a_fabricated_identifier_is_refused_and_never_contested():
    """The headline safety property: verification must change the outcome.

    Without the refusal gate this test passes CONTEST with an ungrounded claim
    attached -- the verifier runs, marks it False, and nothing acts on it.
    """
    from dispute_autopilot.contracts import Claim

    def _hallucinating_assembler(dispute, casefile):
        return EvidenceBundle(
            dispute_id=dispute.dispute_id,
            fields={"shipping_proof": "Shipped under AWB ZZZ999"},
            claims=[Claim(text="Shipped under AWB ZZZ999",
                          source_field="src_shipping_proof")])

    result = triage(_d(), _row(), _FakeScorer(0.01), _FakeVault(_full_cf()),
                    _hallucinating_assembler)
    assert result.action is Action.REVIEW
    assert result.refused_claims == ["Shipped under AWB ZZZ999"]
    assert result.bundle is not None, "the bundle is kept for a human to inspect"


def test_asserting_fields_with_no_attributable_claims_is_refused():
    """groundedness is 1.0 on an empty claim list -- that must not be a pass."""
    def _unattributed(dispute, casefile):
        return EvidenceBundle(dispute_id=dispute.dispute_id,
                              fields={"shipping_proof": "v"}, claims=[])

    result = triage(_d(), _row(), _FakeScorer(0.01), _FakeVault(_full_cf()),
                    _unattributed)
    assert result.action is Action.REVIEW
```

- [ ] **Step 2: Run it to verify it fails**

```bash
.venv/Scripts/python -m pytest tests/test_triage.py -v
```

Expected: FAIL, `ModuleNotFoundError`

- [ ] **Step 3: Write `triage.py`**

```python
"""Score -> gate -> decide -> assemble -> verify. One entry point for API and UI."""
import pandas as pd

from dispute_autopilot.assembler.assemble import assemble as default_assembler
from dispute_autopilot.assembler.verify import verify
from dispute_autopilot.casefile.completeness import assess
from dispute_autopilot.contracts import Action, CaseFile, Decision, Dispute, Posture
from dispute_autopilot.economics.decision import decide


def triage(
    dispute: Dispute,
    txn_row: pd.DataFrame,
    scorer,
    vault,
    assembler=None,
) -> Decision:
    assembler = assembler or default_assembler

    score = scorer.score_one(txn_row)
    casefile = vault.get(dispute.transaction_id) or CaseFile(
        transaction_id=dispute.transaction_id, posture=Posture.NONE, items={}
    )
    w, missing = assess(casefile, dispute.reason_code)
    decision = decide(dispute, score.p_chargeback, w, missing)

    # The assembler runs ONLY on a contest decision. On REVIEW or ACCEPT it is
    # never invoked, so the system cannot draft a representment it has no
    # evidence for. This is the defense-only guarantee in code.
    if decision.action is Action.CONTEST:
        bundle = verify(assembler(dispute, casefile), casefile)

        # THE REFUSAL GATE. Verification that cannot change the outcome is
        # decoration. A claim the verifier could not tie back to the vault is
        # never transmitted -- the decision is downgraded to REVIEW and the
        # offending claims are recorded for a human.
        #
        # The second condition guards a subtler hole: EvidenceBundle.groundedness
        # is 1.0 for an empty claim list, so a bundle that asserts evidence
        # fields while making no attributable claims would otherwise score
        # perfectly and sail through. Asserting facts without attribution is
        # exactly what this system must not do.
        ungrounded = [c.text for c in bundle.claims if not c.grounded]
        if ungrounded or (bundle.fields and not bundle.claims):
            decision = decision.model_copy(
                update={"action": Action.REVIEW, "refused_claims": ungrounded}
            )
        decision.bundle = bundle

    return decision
```

- [ ] **Step 4: Run the tests**

```bash
.venv/Scripts/python -m pytest tests/test_triage.py -v
```

Expected: 5 passed

- [ ] **Step 5: Run the whole suite**

```bash
.venv/Scripts/python -m pytest -q
```

Expected: all tests pass. Fix anything red before continuing.

- [ ] **Step 6: Commit**

```bash
git add src/dispute_autopilot/triage.py tests/test_triage.py
git commit -m "feat: add triage orchestration with evidence-gated assembly"
```

### Task 7.3: FastAPI surface

**Files:**
- Create: `src/dispute_autopilot/api/main.py`, `src/dispute_autopilot/api/__init__.py`
- Test: `tests/test_api.py`

**Interfaces:**
- Consumes: `triage`, `Scorer`, `VaultStore`
- Produces: `POST /disputes/{dispute_id}/triage`, `GET /health`

- [ ] **Step 1: Write the failing test**

```python
# tests/test_api.py
from fastapi.testclient import TestClient
from dispute_autopilot.api.main import app


def test_health_endpoint_reports_ok():
    assert TestClient(app).get("/health").json()["status"] == "ok"
```

- [ ] **Step 2: Run it to verify it fails**

```bash
.venv/Scripts/python -m pytest tests/test_api.py -v
```

Expected: FAIL, `ModuleNotFoundError`

- [ ] **Step 3: Write `main.py`**

```python
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
```

The response model is `Decision`, so `assumption_notice` ships in every API response. That was the point of making it a required field in Task 0.4.

- [ ] **Step 4: Run the test**

```bash
.venv/Scripts/python -m pytest tests/test_api.py -v
```

Expected: 1 passed

- [ ] **Step 5: Start the server and check it serves**

```bash
.venv/Scripts/python -m uvicorn dispute_autopilot.api.main:app --port 8000
```

Visit `http://localhost:8000/docs`. Expected: the OpenAPI page listing both routes.

- [ ] **Step 6: Commit**

```bash
git add src/dispute_autopilot/api/ tests/test_api.py
git commit -m "feat: add FastAPI triage endpoint"
```

**SCOPE FREEZE. Anything not working now gets cut, not fixed.**

---

## Phase 8 — The evaluation harness (4 Sep, morning)

### Task 8.1: Metric families A and B

**Files:**
- Create: `eval/run_eval.py`
- Output: `eval/reports/metrics.json`, `eval/reports/pr_curve.png`, `eval/reports/calibration.png`, `eval/reports/threshold_sweep.png`

**Interfaces:**
- Consumes: everything from Phases 1–4
- Produces: `eval/reports/metrics.json` with top-level keys `family_a`, `family_b`, `meta` — the single source of every number in the README

- [ ] **Step 1: Write `run_eval.py`**

```python
"""Regenerates EVERY number in the README. One command, no manual steps.

Family A is measured on real labels and a held-out temporal split.
Family B is simulated under the cost assumptions in config/costs.yaml.
The two are written to separate keys and must never be merged in reporting.
"""
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from sklearn.calibration import calibration_curve
from sklearn.metrics import (
    average_precision_score, brier_score_loss, precision_recall_curve, roc_auc_score,
)

from dispute_autopilot.config import load_costs, load_features
from dispute_autopilot.economics.baselines import compare_baselines
from dispute_autopilot.economics.threshold import optimal_threshold, sweep
from dispute_autopilot.features.builder import build_features
from dispute_autopilot.ingest.load import load_raw
from dispute_autopilot.ingest.split import temporal_split
from dispute_autopilot.model.calibrate import (
    apply_calibrator, fit_calibrator, save_calibrator,
)
from dispute_autopilot.model.train import save_model, train_model

# ONE definition, in eval/__init__.py -- see below. Hand-writing
# parents[N] per file gets the depth wrong the moment a module moves.
from eval import REPORTS


def main(matured_max_day: int | None = None, sample_n: int | None = None) -> dict:
    fc, costs = load_features(), load_costs()
    REPORTS.mkdir(parents=True, exist_ok=True)

    df = load_raw(sample_n=sample_n)
    train, calib, test = temporal_split(df, matured_max_day=matured_max_day)

    booster = train_model(train)
    iso = fit_calibrator(booster, calib)
    save_model(booster)
    save_calibrator(iso)

    y = test[fc.target].to_numpy()
    amounts = test["TransactionAmt"].to_numpy(dtype=float)
    raw = booster.predict(build_features(test))
    p = apply_calibrator(iso, raw)

    sweep_df = sweep(y, p, amounts, n_steps=100)
    threshold = optimal_threshold(sweep_df)
    at = sweep_df.loc[(sweep_df["threshold"] - threshold).abs().idxmin()]

    family_a = {
        "basis": "MEASURED on real labels, held-out temporal split",
        "n_test": int(len(test)),
        "positive_rate": float(y.mean()),
        "pr_auc": float(average_precision_score(y, p)),
        "roc_auc": float(roc_auc_score(y, p)),
        "brier": float(brier_score_loss(y, p)),
        "operating_threshold": float(threshold),
        "precision_at_threshold": float(at["precision"]),
        "recall_at_threshold": float(at["recall"]),
    }
    family_a["f1_at_threshold"] = float(
        2 * at["precision"] * at["recall"] / (at["precision"] + at["recall"])
        if (at["precision"] + at["recall"]) else 0.0
    )

    matrices = compare_baselines(test, p, threshold)
    family_b = {
        "basis": "SIMULATED under config/costs.yaml assumptions",
        "assumptions": {
            "contest_fee_inr": costs.contest_fee_inr,
            "ops_cost_inr": costs.ops_cost_inr,
            "base_win_rate_fraud_coded": costs.base_win_rate_fraud_coded,
        },
        "net_inr": {k: round(m.net_inr, 2) for k, m in matrices.items()},
        "confusion_counts": {
            k: {"tp": m.tp, "fp": m.fp, "tn": m.tn, "fn": m.fn}
            for k, m in matrices.items()
        },
    }
    family_b["model_uplift_vs_flag_all_inr"] = round(
        matrices["model"].net_inr - matrices["all"].net_inr, 2
    )

    # Plots
    prec, rec, _ = precision_recall_curve(y, p)
    fig, ax = plt.subplots(figsize=(5, 4))
    ax.plot(rec, prec)
    ax.axhline(y.mean(), linestyle="--", label=f"base rate {y.mean():.4f}")
    ax.set_xlabel("recall"); ax.set_ylabel("precision")
    ax.set_title(f"PR curve (PR-AUC = {family_a['pr_auc']:.4f})"); ax.legend()
    fig.savefig(REPORTS / "pr_curve.png", dpi=120, bbox_inches="tight")

    frac_pos, mean_pred = calibration_curve(y, p, n_bins=10, strategy="quantile")
    fig, ax = plt.subplots(figsize=(5, 4))
    ax.plot(mean_pred, frac_pos, marker="o")
    ax.plot([0, 1], [0, 1], linestyle="--")
    ax.set_xlabel("predicted"); ax.set_ylabel("observed")
    ax.set_title(f"Calibration (Brier = {family_a['brier']:.5f})")
    fig.savefig(REPORTS / "calibration.png", dpi=120, bbox_inches="tight")

    fig, ax = plt.subplots(figsize=(6, 4))
    ax.plot(sweep_df["threshold"], sweep_df["net_inr"])
    ax.axvline(threshold, linestyle="--", label=f"optimum = {threshold:.3f}")
    ax.set_xlabel("threshold"); ax.set_ylabel("net INR (simulated)")
    ax.set_title("Net rupees vs threshold"); ax.legend()
    fig.savefig(REPORTS / "threshold_sweep.png", dpi=120, bbox_inches="tight")

    out = {"family_a": family_a, "family_b": family_b,
           "meta": {"matured_max_day": matured_max_day, "sample_n": sample_n}}
    (REPORTS / "metrics.json").write_text(json.dumps(out, indent=2))
    print(json.dumps(out, indent=2))
    return out


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run the full evaluation**

```bash
.venv/Scripts/python -m eval.run_eval
```

Expected: `eval/reports/metrics.json` plus three PNGs. Sanity checks before trusting anything:

- `pr_auc` well above `positive_rate` (roughly 0.035)
- `operating_threshold` is **not** 0.5 — if it is, the cost model is not influencing the choice
- `model` net INR beats `all` net INR — that is the headline result

If G1 returned `CENSORED`, run `main(matured_max_day=63)` instead and record that in the README.

- [ ] **Step 3: Commit**

```bash
git add eval/run_eval.py eval/reports/metrics.json eval/reports/*.png
git commit -m "feat: add evaluation harness producing families A and B"
```

### Task 8.2: Metric family C — generation quality

**Files:**
- Create: `eval/run_generation_eval.py`
- Output: `eval/reports/generation_metrics.json`

**Interfaces:**
- Consumes: `synthesize_casefile`, `assemble`, `verify`
- Produces: `generation_metrics.json` with `groundedness_mean`, `hallucination_rate`, `refusal_rate`, `n_cases`

- [ ] **Step 1: Write the harness**

```python
"""Metric family C: does the assembler invent facts, and does it refuse when it should?

MEASURED, on a synthetic evidence corpus. Groundedness asks whether the model
invented facts absent from its source — valid regardless of the source's origin.

Half the sample is deliberately degraded (required evidence removed). Note what
that does and does not measure: the completeness refusal is DETERMINISTIC and
alternates by construction, so its rate is ~0.5 no matter how the model behaves
and is not a result. The measured safety property is gate_refusal_rate -- of the
bundles actually assembled, how many the groundedness gate stopped.

COST: every assembled case is one paid API call. At N_CASES=20 only the ~10
ACTIVE-posture cases reach the API; the rest are refused before any spend.
MAX_API_CALLS is a hard ceiling, not a warning.
"""
import json
from pathlib import Path

from dispute_autopilot.assembler.assemble import assemble
from dispute_autopilot.assembler.verify import verify
from dispute_autopilot.casefile.completeness import assess
from dispute_autopilot.casefile.synthesize import synthesize_casefile
from dispute_autopilot.contracts import Dispute, Posture
from dispute_autopilot.ingest.load import load_raw

# ONE definition, in eval/__init__.py -- see below. Hand-writing
# parents[N] per file gets the depth wrong the moment a module moves.
from eval import REPORTS

# Family C must describe the model the system actually ships with. Reporting
# generation quality from a cheap model while demoing an expensive one is the
# kind of unfalsifiable claim this project's positioning criticises.
ASSEMBLER_MODEL_NOTE = "resolved at runtime by assembler.default_provider()"

N_CASES = 20
# HARD SPEND GUARD. Every assembled case is one paid API call. The budget for
# this project is a few dollars total, so a runaway loop is a real risk, not a
# theoretical one. This ceiling raises rather than warns.
MAX_API_CALLS = 40


def main(n: int = N_CASES) -> dict:
    if n > MAX_API_CALLS:
        raise ValueError(f"n={n} exceeds MAX_API_CALLS={MAX_API_CALLS}")
    df = load_raw(sample_n=5000).sample(n, random_state=0)
    grounded_scores, complete_cases = [], 0
    incomplete_refusals = 0   # blocked by the completeness gate, no API call made
    gate_refusals = 0         # assembled, then refused for an ungrounded claim
    api_calls = 0

    for i, (_, row) in enumerate(df.iterrows()):
        # Alternate: half full evidence, half deliberately degraded.
        posture = Posture.ACTIVE if i % 2 == 0 else Posture.PASSIVE
        casefile = synthesize_casefile(row, posture, seed=i)
        _, missing = assess(casefile, "fraud_card_absent")

        if missing:
            incomplete_refusals += 1
            continue

        complete_cases += 1
        api_calls += 1
        if api_calls > MAX_API_CALLS:
            raise RuntimeError(f"spend guard tripped at {api_calls} calls")
        dispute = Dispute(dispute_id=f"eval_{i}", transaction_id=int(row["TransactionID"]),
                          amount_inr=float(row["TransactionAmt"]),
                          reason_code="fraud_card_absent")
        bundle = verify(assemble(dispute, casefile), casefile)
        grounded_scores.append(bundle.groundedness)
        if any(not c.grounded for c in bundle.claims):
            gate_refusals += 1

    mean_g = sum(grounded_scores) / len(grounded_scores) if grounded_scores else 0.0

    # Rule of three: with zero observed failures in k trials, the 95% upper
    # bound on the true rate is about 3/k. At these sample sizes an honest
    # bound matters more than a flattering point estimate -- "0 ungrounded
    # claims in 10 bundles" is worth far less than it sounds without it.
    k = len(grounded_scores)
    ungrounded_upper_95 = round(3.0 / k, 4) if k and mean_g == 1.0 else None

    out = {
        "basis": "MEASURED on a synthetic evidence corpus",
        "model": ASSEMBLER_MODEL_NOTE,
        "n_cases": n,
        "n_assembled": complete_cases,
        "n_api_calls": api_calls,
        "groundedness_mean": round(mean_g, 4),
        "hallucination_rate": round(1.0 - mean_g, 4),
        # Of the bundles actually assembled, how many did the refusal gate stop.
        # THIS is the safety property under test.
        "gate_refusal_rate": round(gate_refusals / k, 4) if k else None,
        # Reported for completeness and explicitly NOT a measured model
        # property: the harness alternates ACTIVE/PASSIVE posture, so this is
        # ~0.5 by construction. It says nothing about the assembler.
        "completeness_refusal_rate_BY_CONSTRUCTION": round(incomplete_refusals / n, 4),
        "ungrounded_rate_upper_bound_95": ungrounded_upper_95,
    }
    REPORTS.mkdir(parents=True, exist_ok=True)
    (REPORTS / "generation_metrics.json").write_text(json.dumps(out, indent=2))
    print(json.dumps(out, indent=2))
    return out


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run it**

```bash
.venv/Scripts/python -m eval.run_generation_eval
```

Expected: `groundedness_mean` above 0.9 and `refusal_rate` near 0.5 (half the sample is degraded by construction). A low groundedness score is a finding worth reporting honestly, not a bug to hide — but first check the verifier isn't over-strict on legitimate paraphrase.

- [ ] **Step 3: Commit**

```bash
git add eval/run_generation_eval.py eval/reports/generation_metrics.json
git commit -m "feat: add generation-quality evaluation (family C)"
```

---

## Phase 9 — Demo console (4 Sep)

### Task 9.1: Streamlit UI

**Files:**
- Create: `ui/app.py`

**Interfaces:**
- Consumes: `triage`, `Scorer`, `VaultStore`, `synthesize_casefile`, `metrics.json`
- Produces: the demo surface used in the video

Three tabs, mapping to the video beats. The fee slider is the twenty-second moment that proves the system is economic, not decorative.

- [ ] **Step 1: Write `ui/app.py`**

```python
"""Demo console. Three tabs matching the video beats."""
import json
from pathlib import Path

import pandas as pd
import streamlit as st

from dispute_autopilot.casefile.store import VaultStore, choose_posture
from dispute_autopilot.casefile.synthesize import synthesize_casefile
from dispute_autopilot.config import load_costs
from dispute_autopilot.contracts import Action, Dispute
from dispute_autopilot.economics.threshold import optimal_threshold, sweep
from dispute_autopilot.ingest.load import load_raw
from dispute_autopilot.model.predict import Scorer
from dispute_autopilot.triage import triage

st.set_page_config(page_title="Dispute Autopilot", layout="wide")
# ONE definition, in eval/__init__.py -- see below. Hand-writing
# parents[N] per file gets the depth wrong the moment a module moves.
from eval import REPORTS


@st.cache_resource
def _load():
    return Scorer.load(), load_raw(sample_n=5000), VaultStore()


scorer, data, vault = _load()
tab_triage, tab_metrics, tab_econ = st.tabs(["Triage", "Metrics", "Economics"])

with tab_triage:
    st.header("Dispute triage")
    idx = st.number_input("Transaction row", 0, len(data) - 1, 0)
    row = data.iloc[[idx]]
    amount = float(row["TransactionAmt"].iloc[0])

    score = scorer.score_one(row)
    posture = choose_posture(score.p_chargeback, amount)
    casefile = synthesize_casefile(row.iloc[0], posture, seed=int(idx))
    vault.put(casefile)

    dispute = Dispute(dispute_id=f"disp_{idx}",
                      transaction_id=int(row["TransactionID"].iloc[0]),
                      amount_inr=amount, reason_code="fraud_card_absent")
    decision = triage(dispute, row, scorer, vault)

    c1, c2, c3 = st.columns(3)
    c1.metric("P(chargeback)", f"{score.p_chargeback:.4f}")
    c2.metric("Amount", f"INR {amount:,.2f}")
    c3.metric("Evidence posture", posture.value)

    colour = {Action.CONTEST: "success", Action.ACCEPT: "info", Action.REVIEW: "warning"}
    getattr(st, colour[decision.action])(
        f"{decision.action.value} — delta EV INR {decision.delta_ev_inr:,.2f}"
    )
    if decision.missing_required:
        st.error(f"Refused to contest. Missing required evidence: "
                 f"{', '.join(decision.missing_required)}")

    st.subheader("Vault contents")
    st.json({k: v.value for k, v in casefile.items.items()})

    if decision.bundle:
        st.subheader("Assembled evidence bundle")
        st.json(decision.bundle.fields)
        st.subheader("Claim grounding")
        st.dataframe(pd.DataFrame([
            {"claim": c.text, "source": c.source_field, "grounded": c.grounded}
            for c in decision.bundle.claims
        ]))

    st.caption(decision.assumption_notice)

with tab_metrics:
    st.header("Measured metrics")
    if (REPORTS / "metrics.json").exists():
        m = json.loads((REPORTS / "metrics.json").read_text())
        st.subheader("Family A — measured, real labels, held-out temporal split")
        st.json(m["family_a"])
        st.subheader("Family B — simulated, stated cost assumptions")
        st.json(m["family_b"])
        for name in ("pr_curve", "calibration", "threshold_sweep"):
            if (REPORTS / f"{name}.png").exists():
                st.image(str(REPORTS / f"{name}.png"))
    else:
        st.warning("Run `python -m eval.run_eval` first.")
    if (REPORTS / "generation_metrics.json").exists():
        st.subheader("Family C — measured generation quality, synthetic corpus")
        st.json(json.loads((REPORTS / "generation_metrics.json").read_text()))

with tab_econ:
    st.header("The threshold is chosen by money, not by 0.5")
    # Default 750 matches costs.yaml. Razorpay publishes no dispute fee, so the
    # slider is not a toy: it IS the sensitivity analysis. Cited range is Rs 200-2000.
    fee = st.slider("Contest fee (INR)", 0, 3000, 750, 50)
    st.caption("Razorpay does not publish a dispute fee. Cited third-party range: "
               "Rs 200-2000, negotiated per merchant agreement, charged win or lose.")
    sample = data.head(2000)
    p = scorer.score_batch(sample)

    # CostConfig is frozen, so the slider builds a variant and threads it through
    # rather than mutating the shared cached instance. An in-place override would
    # leak into the Triage tab and make its decisions silently disagree with
    # costs.yaml — which is exactly the bug this design removes.
    variant = load_costs().model_copy(update={"contest_fee_inr": float(fee)})
    sweep_df = sweep(sample["isFraud"].to_numpy(), p,
                     sample["TransactionAmt"].to_numpy(dtype=float),
                     n_steps=60, costs=variant)
    best = optimal_threshold(sweep_df)

    st.line_chart(sweep_df.set_index("threshold")["net_inr"])
    st.metric("EV-optimal threshold", f"{best:.3f}")
    st.caption("Simulated (family B). Raising the fee makes contesting less "
               "attractive and moves the optimal threshold.")
```

- [ ] **Step 2: Run it and click every tab**

```bash
.venv/Scripts/python -m streamlit run ui/app.py
```

Expected: all three tabs render. **Find a transaction index that produces each of CONTEST, ACCEPT, and REVIEW, and write those three indices down — the video needs all three.**

- [ ] **Step 3: Commit**

```bash
git add ui/app.py
git commit -m "feat: add Streamlit demo console"
```

---

## Phase 10 — Documentation and ship (4–5 Sep)

### Task 10.1: README

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: `eval/reports/metrics.json`, `generation_metrics.json`, `docs/gates/*`
- Produces: the document the panel actually reads

- [ ] **Step 1: Write `README.md` with these sections in this order**

1. **Title and one-line description.**
2. **Defense-only statement** — first thing after the title. The system scores disputes and drafts grounded responses; it cannot generate evidence and refuses to proceed without it.
3. **What this is, in one paragraph** — predict, vault, respond.
4. **Prior Art** — Stripe Smart Disputes, Chargeflow, Justt, Midigator/Kount, Verifi Order Insight, Ethoca Consumer Clarity, US Patent 10,839,394, the SSRN paper. Then the honest claim: *these ship commercially and publish win rates, which are unfalsifiable from outside; none publish precision, recall, calibration, or false-positive cost. This is the open, measurable version.*
5. **Results** — three clearly separated tables: family A (measured), family B (simulated), family C (measured, synthetic corpus). Every number copied from `metrics.json`.
6. **The label, and why it matters** — `isFraud` means a reported chargeback within 120 days. Cite the competition host. State that this makes the model a chargeback predictor by construction, and that the dataset cannot separate first-party misuse from third-party fraud.
7. **Known limitations** — the §8.1 assumption; label noise from unreported fraud; the G1 censoring finding; synthetic evidence corpus; simulated policy layer.
8. **Reproduce every number** — `python -m eval.run_eval` and `python -m eval.run_generation_eval`.
9. **Setup** — venv, requirements, Kaggle rules acceptance, `.env`.
10. **Architecture** — link to `docs/ARCHITECTURE.md`.

- [ ] **Step 2: Verify every number in the README against `metrics.json`**

```bash
.venv/Scripts/python -c "
import json; m=json.load(open('eval/reports/metrics.json'))
print(json.dumps(m, indent=2))
"
```

Read your README beside this output. Any number that does not appear here must be deleted or regenerated. **Do not hand-write a metric.**

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add README with prior art, results, and limitations"
```

### Task 10.2: Architecture document

**Files:**
- Create: `docs/ARCHITECTURE.md`

- [ ] **Step 1: Write it, covering**

- The three stages and why they are one system rather than three features
- The data flow: transaction → score → posture → vault → dispute → gate → decide → assemble → verify → payload
- Why one feature builder, and how the parity test enforces it
- Why isotonic calibration is required for the EV computation to mean anything
- Why the evidence gate outranks the economics
- Why the groundedness verifier is deterministic (no model judges the model)
- The three metric families and why they are never merged
- Component boundaries: what each module owns and depends on

- [ ] **Step 2: Commit**

```bash
git add docs/ARCHITECTURE.md
git commit -m "docs: add architecture document"
```

### Task 10.3: Video

**Files:**
- Create: `docs/VIDEO-SCRIPT.md`

- [ ] **Step 1: Write the script against the beat table**

| Time | Beat |
|---|---|
| 0:00–0:30 | The problem in rupees. Merchants win only 17.1% of fraud-coded chargebacks they contest, so blanket contesting loses money. |
| 0:30–1:00 | What it does, one sentence, plus the architecture frame. |
| 1:00–2:30 | Live demo, all three outcomes, ending on **the refusal** — missing evidence, system declines to contest. |
| 2:30–3:45 | Metrics. PR-AUC not accuracy. Why a temporal split. Calibration curve. The rupee chart against baselines. |
| 3:45–4:30 | Fee slider moving the optimal threshold. Then limitations, out loud. |
| 4:30–5:00 | Real vs synthetic, prior art, next steps. |

Rules for the recording:

- The model gets **60 seconds at most**. It is not the differentiator.
- Say the words "this is not novel" and name the commercial products. Then say what they do not publish.
- Show the refusal. It is the most memorable thing in the demo.
- State the §8.1 assumption on camera.

- [ ] **Step 2: Record, upload unlisted to YouTube, add the link to the README**

- [ ] **Step 3: Commit**

```bash
git add docs/VIDEO-SCRIPT.md README.md
git commit -m "docs: add video script and demo link"
```

### Task 10.4: Final verification

- [ ] **Step 1: Full test suite**

```bash
.venv/Scripts/python -m pytest -q
```

Expected: all pass. A red test at submission is worse than a missing feature.

- [ ] **Step 2: Clean-clone reproducibility check**

```bash
cd /tmp && rm -rf verify && git clone <repo-url> verify && cd verify
python -m venv .venv && .venv/Scripts/python -m pip install -r requirements.txt
.venv/Scripts/python -m pytest -q
```

Expected: install and tests pass on a clean clone. This catches the missing-file class of failure that is invisible in your working directory.

- [ ] **Step 3: Secret scan**

```bash
git log -p | grep -iE "rzp_(test|live)_|sk-ant-|BEGIN [A-Z ]*PRIVATE KEY" | head
```

Expected: no output. Any hit means a key is in history — rotate it immediately and do not merely delete the file.

- [ ] **Step 4: Confirm the deliverables**

- Public GitHub repository
- 5-minute pitch video, linked in the README
- `docs/ARCHITECTURE.md`
- `eval/reports/metrics.json` committed, and every README number traceable to it

- [ ] **Step 5: Final commit and push**

```bash
git add -A
git commit -m "chore: final submission state"
git push -u origin main
```

---

## Cut List (apply in this order if a day slips)

1. Task 8.2 (family C) → report groundedness on 5 cases rather than 20
2. Task 9.1 tab 3 (fee slider) → keep tabs 1 and 2
3. Task 10.2 → fold architecture into the README
4. SHAP → already cut; LightGBM importances only
5. Live Razorpay path → dry-run only
6. Full dataset → `sample_n=200000`, documented

Never cut: the G1 gate, calibration, the three metric families, the evidence gate, the groundedness verifier, the Prior Art section, or the video.




