# Architecture

This document covers the three stages and why they are one system, the data flow between them, and the design reasoning a payments reviewer is most likely to probe: calibration, the evidence gate, feature parity, the deterministic verifier, and the three metric families. Component boundaries and their dependencies are listed at the end.

## Why three stages, one system

Prediction, evidence preservation, and dispute response are usually built and sold as separate products. They are one system here because each stage's output is the next stage's binding input, and none of the three is defensible alone:

- A risk score with nothing downstream is an academic exercise — Track 02 asks for a working detector *and* responder, not a leaderboard entry.
- Evidence preservation with no risk signal driving it means either vaulting everything (expensive, and most transactions are never disputed) or vaulting nothing (useless the moment a dispute arrives).
- A dispute-response generator with no evidence gate is the one thing this system must never be: something that can be asked to argue a case it has no facts for.

The chain also determines what each stage is allowed to claim. Stage 1's precision and recall are measured against real chargeback labels (Family A). Stage 2 and Stage 3's rupee benefit cannot be measured the same way — there is no labelled counterfactual for "what would this dispute's outcome have been with different evidence" — so their contribution is reported as a simulation under stated cost assumptions (Family B), never blended into Family A's measured numbers. Section "Three metric families" below covers why this separation is structural, not a formatting choice.

## Data flow

```
transaction row
      |
      v
Stage 1  [features/builder.py] -> [model/predict.py: Scorer]
      |     RiskScore.p_chargeback (calibrated, Family A)
      v
Stage 2  [casefile/store.py: choose_posture]
      |     p_chargeback * amount_inr  ->  Posture (NONE / PASSIVE / ACTIVE)
      v
      [casefile/synthesize.py: synthesize_casefile]  ->  CaseFile
      v
      [casefile/store.py: VaultStore.put]              (the vault)
      .
      .  <-- time passes; a real dispute may or may not ever arrive -->
      .
Dispute arrives
      |
      v
Stage 3  [triage.py: triage()]  is the single entry point, called by
      |   both api/main.py and ui/app.py -- there is no second orchestration path
      v
      [casefile/store.py: VaultStore.get]           retrieve whatever was vaulted
      v
      [casefile/completeness.py: assess]            GATE: w, missing_required
      v
      [economics/decision.py: decide]               DECIDE: CONTEST / ACCEPT / REVIEW
      |
      | (only if action == CONTEST)
      v
      [assembler/assemble.py: assemble]             ASSEMBLE: LLM or deterministic template
      v
      [assembler/verify.py: verify]                 VERIFY: per-claim groundedness check
      v
      [triage.py: refusal gate]                     any ungrounded claim -> downgrade to REVIEW
      v
      [razorpay/schema.py + razorpay/client.py]      EMIT: schema-valid contest payload
```

Every arrow above is a real function call in the committed code, not a diagram of an aspiration — `triage()` in `src/dispute_autopilot/triage.py` is the literal sequence: score → gate/decide → (assemble → verify → refusal-gate) → return `Decision`.

## Why one feature builder

`src/dispute_autopilot/features/builder.py` is imported by both `model/train.py` and `model/predict.py`. There is no second feature-construction path anywhere in the codebase. This matters for a specific, well-known failure mode in payments ML: train/serve skew, where the features computed at training time and the features computed at serving time diverge in some subtle way and the model silently scores against inputs it was never fitted on.

The subtle half of this guarantee is categorical encoding, not the numeric columns. LightGBM consumes a pandas `category` column's integer codes (`.cat.codes`), not its string values. If categories were inferred fresh on every call, a batch build over many rows and a single-row serving build would assign *different integers* to the same string value, and every live score would be computed against wrong codes — with no exception raised and every offline batch metric still looking correct, because the batch path is internally consistent with itself. `extract_categories()` captures the fitted category set once, at training time, and `build_features(df, categories=...)` at serving time is required to reuse it; an unseen category at serve time becomes `NaN`, which is the honest encoding for a value the model never trained on.

`tests/test_feature_parity.py` enforces this with three tests, not one: single-row-vs-batch value parity, categorical-*code* parity specifically (comparing values alone would miss code-set skew), and a test that deliberately proves the naive per-call-inference path *does* diverge — a guard on the guard, so that if LightGBM's categorical handling ever changes underneath these tests, the parity tests do not silently stop testing anything.

## Why isotonic calibration is required

Stage 1's raw LightGBM output is a score that ranks transactions well (PR-AUC 0.4405 uncalibrated, per `eval/reports/metrics.json`) but is not a probability — gradient-boosted trees are not calibrated by construction, and this one materially overstates P(chargeback) relative to the true 3.44% base rate. That would be a cosmetic problem if Stage 1's output were only ever read by a human as a ranking. It is not: Stage 3's entire decision rule is `delta_EV = p_win * amount - ops_cost`, an expected-value computation that multiplies a probability by a rupee amount. Running that arithmetic on an uncalibrated score does not produce a wrong number — it produces a number with no defensible relationship to money at all.

`model/calibrate.py` fits an isotonic regression (`IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)`) on the calibration slice — a third, distinct temporal window that neither trains the model nor evaluates it — and every downstream consumer (`Scorer.score_batch`, `eval/run_eval.py`) applies it before the score is used for anything beyond display. Calibration is fit using the *same* categorical codes the booster was trained on (`fit_calibrator` takes `categories` as a required argument with no default), for the identical reason feature parity is enforced elsewhere: calibrating against re-inferred codes would fit the isotonic mapping to a model that is effectively reading scrambled inputs.

The cost of calibration is visible and disclosed rather than hidden: PR-AUC drops from 0.4405 (raw) to 0.4243 (calibrated), because isotonic regression is a step function that collapses many distinct raw scores into a small number of levels, and the resulting ties cost average precision. That tradeoff is accepted deliberately — ranking quality is not what calibration is for.

## Why the evidence gate outranks the economics

`economics/decision.py: decide()` checks `missing_required` before it looks at `delta_ev` at all:

```python
if missing_required:
    action = Action.REVIEW
elif delta_ev > costs.decision_margin_inr:
    action = Action.CONTEST
elif delta_ev < -costs.decision_margin_inr:
    action = Action.ACCEPT
else:
    action = Action.REVIEW
```

A dispute with a large positive expected value but a missing required evidence field (`billing_proof`, `shipping_proof`, per the `fraud_card_absent` reason code in `config/costs.yaml`) is forced to `REVIEW` regardless of how favourable the arithmetic looks. This is a deliberate ordering, not an oversight: expected value is a statement about what the *system* thinks it will win on average; the evidence gate is a statement about what the system can actually *prove* for this specific dispute. Letting attractive economics override a missing required field would mean contesting disputes the vault cannot substantiate — the exact behaviour a defense-only system must not exhibit. The gate is unconditional in code, not a threshold that a sufficiently large `delta_ev` can clear.

There is a second, independent gate downstream of this one: the refusal gate in `triage.py`, which fires after assembly and verification, on grounds the economics never see at all (whether the *drafted claims*, not just the *raw evidence fields*, trace back to the vault). Two gates, checking different things, both capable of downgrading to `REVIEW`, neither overridable by a favourable number.

## Why the groundedness verifier is deterministic

`assembler/verify.py` contains no model call. Verification is a fixed function: a claim is grounded only if it names a source key, that key exists in the retrieved case file, and every identifier-like token in the claim text (matched by a regex for alphanumeric strings that look like tracking numbers, order references, or amounts) is a subset of the identifier-like tokens present in that source's own value.

This is deliberately *not* "ask a second model whether the first model's output looks grounded." An LLM judging another LLM's factual claims inherits the same failure mode it is meant to catch — a judge model can be persuaded by a plausible-sounding fabrication as easily as the generator can produce one, and a failure here is invisible until a real dispute is lost on it. A regex-and-set-membership check over retrieved, already-trusted vault text has no such failure mode: it either finds the identifier in the source or it does not, and that outcome is reproducible and auditable by inspection, not by re-querying a model, on every run.

The verifier's docstring states its own limit, and the same limit is stated in the README rather than only here: it compares *identifier-like tokens*. A fabricated claim that carries no identifier — invented prose citing a real, existing source key, such as "the customer confirmed receipt by phone" attributed to a source that never said this — passes verification if the cited key exists. That gap is real and is not closed by this function; the system's defence against it is the assembler's system prompt (`assembler/prompts.py`: "You may use ONLY the facts in the provided case file... Every claim you make must name the case-file source key it came from") combined with the refusal gate acting on whatever the deterministic check *can* catch. This project does not claim the verifier prevents all fabrication — it claims a specific, narrower, and true thing: it structurally cannot let an invented identifier reach the Razorpay payload undetected.

## Three metric families, and why they are never merged

| Family | What | Basis |
|---|---|---|
| A — Detection | PR-AUC, ROC-AUC, precision/recall/F1 at threshold, calibration, Brier | **Measured.** Real chargeback labels, held-out temporal split, touched once |
| B — Policy | Net rupees vs. four baselines, threshold sensitivity, EV-optimal threshold | **Simulated.** Stated cost assumptions in `config/costs.yaml`; no labelled counterfactual exists for "what a preserved-evidence dispute would have recovered" |
| C — Generation | Groundedness, hallucination rate, refusal rate | **Measured** in principle, on a synthetic evidence corpus — not yet run; no `generation_metrics.json` exists in this repository |

The separation is structural, not a reporting convention, because the three families rest on different kinds of ground truth: Family A has real, held-out labels the model never saw; Family B has no labelled outcome to check against at all, only a set of published, cited cost priors that could each be individually wrong; Family C's ground truth (the synthetic case file) is itself generated by this project rather than observed externally. Reporting a Family B rupee figure with Family A's confidence, or vice versa, would misrepresent what kind of claim is being made. `eval/run_eval.py` writes Family A and Family B to separate top-level keys in `metrics.json` specifically so they cannot be silently concatenated downstream, and the same separation is kept everywhere the numbers are displayed — the README, and the Streamlit UI's Metrics tab (`ui/app.py`), each render Family A and Family B under distinct headers rather than one combined table.

One further discipline inside Family A itself, worth stating because it is easy to get wrong by accident: Family A's operating threshold (0.3337, chosen to maximise F1 — a model-quality criterion) and Family B's EV-optimal threshold (0.001, chosen by the cost sweep) are different numbers for different purposes, and `eval/run_eval.py` computes precision/recall against each threshold separately rather than reporting Family A's precision at Family B's threshold. Blending the two would be internally consistent-looking and wrong: evidence-vaulting is cheap relative to a missed chargeback's average exposure, so the EV-optimal threshold collapses toward the bottom of the sweep and precision there reads near 3.7% — a fact about the cost assumptions, not about the classifier's discriminative power.

## Component boundaries

| Module | Owns | Depends on |
|---|---|---|
| `contracts.py` | Every Pydantic model crossing a stage boundary (`Posture`, `Action`, `RiskScore`, `EvidenceItem`, `CaseFile`, `Dispute`, `Claim`, `EvidenceBundle`, `Decision`) | Nothing else in this package — it is the dependency root |
| `config.py` | Typed, frozen, cached loaders for `costs.yaml` and `features.yaml`; `ASSUMPTION_NOTICE` | Nothing else in this package |
| `ingest/download.py` | Kaggle download | `kaggle` (imported lazily, inside the function, so a missing key never breaks an import) |
| `ingest/load.py` | CSV load, merge, dtype downcast | `ingest/download.py` (for the raw-data path constant only) |
| `ingest/split.py` | Temporal 70/10/20 split, optional matured-window truncation | Nothing else in this package |
| `features/builder.py` | The one feature builder; category-set capture and reuse | `config.py` |
| `model/train.py` | LightGBM training, returns `(booster, categories)` as a pair | `features/builder.py`, `config.py` |
| `model/calibrate.py` | Isotonic calibration, fit on the calibration slice with fixed categories | `features/builder.py`, `config.py` |
| `model/predict.py` | `Scorer` — the serving path, loads model + calibrator + categories together | `features/builder.py`, `model/calibrate.py`, `contracts.py` |
| `economics/cost_model.py` | USD→INR conversion (once, at the boundary), the rupee confusion matrix | `config.py` |
| `economics/baselines.py` | The four baselines, compared together | `economics/cost_model.py` |
| `economics/threshold.py` | The EV sweep and `optimal_threshold` | `economics/cost_model.py` |
| `economics/decision.py` | The `decide()` EV engine and the evidence-gate-first ordering | `config.py`, `contracts.py` |
| `casefile/synthesize.py` | Deterministic, seeded evidence generation from real transaction features | `contracts.py` |
| `casefile/store.py` | `VaultStore` (put/get) and `choose_posture` | `config.py`, `contracts.py` |
| `casefile/completeness.py` | The `w` multiplier and the required-field gate | `config.py`, `contracts.py` |
| `assembler/prompts.py` | System prompt and per-dispute prompt construction, restricting the model to vault facts | `contracts.py` |
| `assembler/assemble.py` | Provider seam (Anthropic / OpenAI / deterministic template fallback); no SDK imported at module scope | `assembler/prompts.py`, `contracts.py` |
| `assembler/verify.py` | The deterministic groundedness verifier | `contracts.py` |
| `razorpay/schema.py` | Razorpay's documented evidence field names, payload validation and construction | `contracts.py` |
| `razorpay/client.py` | `DryRunClient` (default everywhere) and `LiveClient` (implemented, unexercised — see `docs/gates/G2-razorpay-test-mode.md`) | `razorpay/schema.py`, `contracts.py` |
| `triage.py` | The single orchestration entry point: score → gate/decide → assemble → verify → refusal gate | every module above except `ingest/*` and `razorpay/client.py` |
| `api/main.py` | FastAPI surface, one endpoint (`POST /disputes/{id}/triage`) | `triage.py`, `model/predict.py`, `casefile/store.py` |
| `eval/run_eval.py` | Regenerates every Family A and Family B number and plot in one run | almost the entire package |
| `eval/gates/g1_censoring.py` | The G1 label-censoring diagnostic, run once before the split was built | `ingest/load.py` |
| `ui/app.py` | The Streamlit demo console (Triage / Metrics / Economics tabs), calling `triage()` exactly as `api/main.py` does | `triage.py` and most of the package |

`triage.py` and `ui/app.py` both call the same `triage()` function with the same signature — there is exactly one orchestration path, exercised identically by the API and the demo UI, not two paths that happen to agree today.
