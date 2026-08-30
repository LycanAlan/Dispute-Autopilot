# Dispute Autopilot — Design Spec

**Date:** 2026-08-31
**Target:** Razorpay AI Buildathon, Track 02 (AI Risk Manager)
**Deadline:** submission before 5 September 2026
**Status:** approved design, pre-implementation

---

## 1. What we are building

A three-stage system that reduces merchant losses from card chargebacks:

1. **Predict** — score each transaction for the probability it will result in a chargeback.
2. **Vault** — for high-risk transactions, preserve dispute evidence at transaction time, while the facts are still fresh.
3. **Respond** — when a dispute arrives, decide contest-vs-accept on expected value, then assemble a grounded evidence bundle in Razorpay's evidence schema.

The measured artifact is Stage 1. Stages 2 and 3 make the score actionable and are what distinguishes this from a scoring dashboard.

## 2. Positioning (read this before writing any README copy)

**This project is not novel, and must never be presented as novel.**

Prior art, all verified:

| Prior art | What it covers |
|---|---|
| Stripe Smart Disputes | AI dispute handling inside a PSP |
| Chargeflow | Fully automated evidence collection, drafting, submission, tracking |
| Justt | Per-dispute dynamic argument construction, A/B tested |
| Midigator / Kount | Template-assisted representment |
| Verifi Order Insight (Visa), Ethoca Consumer Clarity (Mastercard) | Pre-dispute deflection by pushing order data to the issuer; Visa CE 3.0 |
| US Patent 10,839,394 | Representment selection by expected value: `P*(A-F)-(1-P)*C` |
| SSRN: "AI-Powered Chargeback Prediction and Dispute Automation Using Explainable Deep Learning Models" | The same problem, academically |

The track brief asks for a working detector/verifier/auto-responder with **measured precision and recall on a held-out test set** and **honest metrics including false-positive cost**. It does not ask for novelty. Every example direction it lists is an existing commercial category.

**The claim we make instead:** commercial vendors publish win rates, which are unfalsifiable from outside. None publish precision, recall, calibration, or false-positive cost. This is the open, measurable version — public data, a published split protocol, and a confusion matrix denominated in rupees.

**Defensible differentiation (only these four):**

1. Published, reproducible held-out metrics. Nobody in this space publishes a confusion matrix.
2. Razorpay-native. Incumbents integrate Stripe/Adyen/Braintree; Razorpay's evidence schema is underserved.
3. A groundedness verifier and a refusal gate. Incumbents optimise win rate; none publish a hallucination rate or refuse to file. This is also the cleanest answer to "strictly defense-only".
4. Indian context — complementary to Razorpay Thirdwatch (which covers RTO/COD), not duplicative.

The README carries a **Prior Art** section citing the above. Citing the patent our formula matches reads as rigour. Reinventing it silently reads as naivety.

## 3. Non-goals

- Not a better fraud model. The classifier is table stakes; 60 seconds of video time at most.
- Not RTO/COD return prediction (Razorpay Thirdwatch already ships this, and no public dataset with real labels exists).
- Not pre-dispute deflection via issuer data-sharing (Verifi/Ethoca operate this at network level; we cannot).
- No offensive capability of any kind. The system cannot generate, alter, or synthesise evidence for real use.

## 4. Data

**Source:** IEEE-CIS Fraud Detection (Vesta Corporation), via Kaggle competition `ieee-fraud-detection`.
590,540 transactions, 394 transaction features plus an identity table, 20,663 positives (3.50%), spanning 183 days (`TransactionDT` max approximately 15,811,131 seconds; unit is seconds from an unstated reference).

**Label semantics — the single most important fact in this project.**
Per the competition host, `isFraud=1` means *a chargeback was reported on the card*, plus transactions posterior to it linked by user account, email, or billing address. If nothing is reported within 120 days, the transaction is labelled legit.

Consequences:

- The label **is** the chargeback event. Stage 1 is a chargeback predictor by construction, with no proxy assumption. This is a strength and must be stated explicitly.
- The dataset **cannot** distinguish true fraud from friendly fraud within `isFraud=1`. Any design requiring that distinction is invalid.
- Known label noise: unreported fraud is labelled legit, so there are false negatives in the ground truth. State this.
- The "linked posterior transactions" rule clusters card entities across the label, which is exactly why a random split leaks.

**Test labels were never released** for the competition test set, so the held-out set comes from splitting the train file.

**Split:** temporal, on `TransactionDT`.

- train: earliest 70%
- calibration: next 10%
- test: final 20%, held out, touched once at the end

Temporal splitting protocol precedent: Amazon Science's Fraud Dataset Benchmark (arXiv 2208.14417) uses a time-based 95/5 split for IEEE-CIS. We cite the protocol; we do **not** take the dependency (its tooling requires Kaggle auth plus an AWS account, and 403s unless you have joined the competition).

**Gate G1 — censoring diagnostic (Day 1, ~10 minutes, blocking).**
The label horizon is 120 days but the data spans 183. If Vesta labelled at collection time rather than retrospectively, the final 120 days are under-labelled and test precision is systematically understated.

Test: plot chargeback rate by day.

- Flat through the tail → no censoring; proceed with the full temporal split.
- Collapses in the tail → restrict to the matured window (days 0–63) or document the downward bias on precision.

Either outcome produces a README paragraph. Do not skip this gate.

## 5. Features

Deliberately the named, interpretable columns, because the model's reasons become the response letter's arguments.

| Signal | Columns |
|---|---|
| Billing/shipping mismatch | `dist1`, `dist2`, `addr1`, `addr2` |
| Identity match flags (AVS-like) | `M1`–`M9` |
| Card entity | `card1`–`card6` |
| Velocity / recency | `C1`–`C14`, `D1`–`D15` |
| Email | `P_emaildomain`, `R_emaildomain`, mismatch flag |
| Device | `DeviceType`, `DeviceInfo`, `id_*` |
| Amount | `TransactionAmt`, log, decimal residue |
| Time | hour-of-day, day-of-week derived from `TransactionDT` |

`M1`–`M9` are match indicators and map directly onto Razorpay's `billing_proof` evidence field. Top model features and cited evidence are the same objects — that coherence is the design.

**Constraint: one feature builder, imported by both training and serving.** A test asserts identical output for the same row on both paths. Train/serve skew is the failure mode a payments panel will look for.

## 6. Stage 1 — Prediction model

LightGBM, class-weighted, then **isotonic calibration** fitted on the calibration slice.

Calibration is not optional: the Stage 3 decision is an expected-value computation, and EV arithmetic on uncalibrated scores is meaningless.

**Reported metrics (family A — measured, real labels):**

- PR-AUC (primary; correct for 3.5% prevalence)
- ROC-AUC (secondary, for comparability with published work)
- Precision, recall, F1 at the chosen operating threshold
- Calibration curve and Brier score
- Confusion matrix denominated in rupees
- Threshold sweep: net rupees saved vs threshold

**Baselines (all four, reported together):**

1. Flag nothing
2. Flag everything
3. Hand-written rules (amount threshold plus billing/shipping mismatch plus email mismatch)
4. The model

Beating baseline 2 *in rupees* is the headline result.

Explainability: LightGBM native feature importances. SHAP only if Day 2 finishes early.

## 7. Stage 2 — Evidence posture policy

Calibrated risk multiplied by transaction amount selects a posture:

| Posture | Action | Cost |
|---|---|---|
| NONE | no action | 0 |
| PASSIVE | snapshot AVS/CVV result, device fingerprint, T&C acceptance, delivery tracking | low |
| ACTIVE | passive plus signature-on-delivery plus confirmation email creating a customer-communication record | higher |

Postures cost money, which is what makes the EV math load-bearing rather than decorative.

- False positive: paid to preserve evidence for a dispute that never came.
- False negative: dispute arrived, vault empty, representment lost.

**Stage 2's benefit is simulated, not measured** — there is no counterfactual in the data. It is reported in metric family B and labelled as simulation everywhere it appears. Implement thin (~4 hours). Its purpose is to be the causal link between prediction and response, not to be a claim.

## 8. Stage 3 — Dispute response

### 8.1 The load-bearing inference (a panel will ask about this)

Stage 1 predicts P(chargeback) *at transaction time*. Stage 3 acts *after* a chargeback has already occurred, so that probability is no longer a forecast. The inference we make is:

> A transaction the model scored as **low** chargeback risk, which nevertheless got charged back, is disproportionately likely to be **first-party misuse** (friendly fraud) rather than genuine third-party fraud — because it carried none of the signals that precede real fraud.

That is the entire basis for using `(1 - p)` as a win-probability input. It is an **inference, not a measured quantity**: IEEE-CIS cannot distinguish friendly fraud from real fraud within `isFraud=1`, so we cannot validate it on this data. It is supported by the industry base rate — friendly fraud is 43.8% to over 45% of chargebacks — but it remains an assumption.

Consequences that must be honoured:

- State this assumption explicitly in the README, the video, and the API response payload.
- Any claim derived from it belongs to metric family B (simulated), never family A (measured).
- `w` and the constants below are calibrated to published industry base rates, not fitted to our data. Fitting them would be circular.

### 8.2 Decision rule

Following the formulation in US 10,839,394:

```
P(win | contest) = base_win_rate * lift(p) * w

  where  p             = calibrated P(chargeback) from Stage 1
         base_win_rate = 0.171   # published fraud-coded representment win rate
         lift(p)       = a bounded monotone decreasing function of p, so that a
                         low-risk-scored transaction raises the win estimate and a
                         high-risk-scored one lowers it; clipped to [0.5x, 2.5x]
         w             = evidence completeness multiplier, defined in 8.3

delta_EV = P(win) * A - (1 - P(win)) * contest_fee - ops_cost

CONTEST if delta_EV >  margin
ACCEPT  if delta_EV < -margin
REVIEW  otherwise, or whenever required evidence is missing
```

The clip on `lift` is deliberate: it prevents the model score, which was never validated against dispute outcomes, from dominating a published base rate that was.

### 8.3 The evidence completeness multiplier `w`

`w` is a deterministic function of which evidence fields the vault actually holds for the dispute's reason code, defined in `costs.yaml`:

- Each reason code declares **required** and **supporting** evidence fields.
- `w` starts at 1.0, is multiplied by a penalty per missing **required** field, and by a smaller bonus per present **supporting** field.
- `w` is capped at 1.0 and floored at 0.0.
- **Any missing required field forces REVIEW regardless of `delta_EV`.** The economics never override the evidence gate.

The weights are configuration, not learned parameters, and are documented as such.

Priors, cited in `costs.yaml`, not invented. **Verified 2026-08-31 — do not edit without re-checking sources:**

| Prior | Value | Source |
|---|---|---|
| Win rate on **fraud-coded** chargebacks | **17.1%** | chargeback.io 2026 compilation |
| Win rate across all reason codes | 41–54% | Source-dependent; Chargebacks911 puts US at 54% |
| **Net recovery rate** | **10.7%** | Merchants win 43.8% of what they represent but net-recover only 10.7% after second-cycle disputes and undetected friendly fraud |
| Total cost multiplier | **$5.13** per $1 of fraud loss | LexisNexis True Cost of Fraud **2026** |
| First-party misuse share of chargebacks | **40–75%**, a range | Source- and definition-dependent |
| Razorpay dispute fee | ₹750 (midpoint of ₹200–2,000) | **Razorpay publishes no dispute fee.** See below. |

Three of these carry corrections worth stating explicitly, because each was wrong in an earlier draft and each would have been indefensible under questioning:

- The cost multiplier is **$5.13 (2026)**, not $4.61 — that figure is the 2025 study.
- **Never assert 43.8% as the first-party-misuse share.** That number appears in Chargebacks911 material as the *representment win rate*, a different statistic that happens to share a value. Cite the 40–75% range with its sources instead. A range that is defensible beats a precise number that is not.
- **Razorpay does not publish a dispute fee.** Their pricing page carries transaction fees (2% domestic) and refund fees (₹0) and nothing for chargebacks; third-party figures scatter across ₹200–2,000 and the fee is negotiated per merchant agreement and charged win or lose. There is no true value to await, so `costs.yaml` must not label it a placeholder. This is precisely why the threshold sensitivity sweep and the UI fee slider are **methodologically required rather than decorative** — we report the decision boundary across the whole cited range rather than asserting one number.

**The thesis, in its sharpest form:** merchants win 43.8% of the disputes they represent but keep only 10.7% of the money. At a 17.1% win rate on fraud-coded disputes specifically, blanket contesting loses money outright. "Do not fight this one" is frequently the correct answer, and a system willing to say so is more credible than one that always fights.

**Assembler pipeline:**

1. **Retrieve** the case file from the vault.
2. **Gate** — check required evidence for the reason code. Missing → do not contest; return REVIEW with the explicit gap list.
3. **Assemble** — Claude emits a structured object matching Razorpay's evidence schema (`shipping_proof`, `billing_proof`, `cancellation_proof`, `customer_communication`, `proof_of_service`, `explanation_letter`, `refund_confirmation`, `access_activity_log`, `refund_cancellation_policy`, `term_and_conditions`), every claim tagged with its source field.
4. **Verify** — deterministic check that every factual claim traces to a retrieved field. Unsupported claims trigger one regeneration, then downgrade to REVIEW.
5. **Emit** — schema-valid `PATCH /v1/disputes/:id/contest` payload.

Step 4 makes the system structurally incapable of manufacturing evidence. That is the defense-only guarantee, and it is demonstrable on camera.

**Metric family C — generation quality (measured, synthetic corpus):**

- Groundedness: share of claims traceable to vault contents
- Hallucination rate
- Refusal rate on deliberately incomplete case files

## 9. The case-file corpus

IEEE-CIS contains no order records, tracking numbers, or support tickets. Evidence documents are **synthesised deterministically from each transaction's real features**: if `M`-flags indicate a billing name match, the generated order record matches; if `dist1` is large, the shipping address genuinely differs. Seeded and reproducible.

State plainly, in README and video: **the decision model runs on real labelled data; the evidence corpus is synthetic.** Groundedness remains a valid measurement on synthetic sources, because it asks whether the model invented facts absent from its source — true or false regardless of the source's provenance.

## 10. Metrics: three families, never blended

| Family | What | Basis |
|---|---|---|
| **A — Detection** | PR-AUC, P/R at threshold, calibration, rupee confusion matrix, 4 baselines | **Measured.** Real labels, held-out temporal split |
| **B — Policy** | Net rupees saved vs baselines, threshold sensitivity | **Simulated.** Stated cost assumptions |
| **C — Generation** | Groundedness, hallucination rate, refusal rate | **Measured.** Synthetic corpus |

Publishing this separation explicitly is the most credible element of the submission. Most entrants will blend measured and simulated numbers.

## 11. Architecture

```
razorpay-dispute-autopilot/
├── data/                      # gitignored, populated by script
├── src/
│   ├── ingest/                # IEEE-CIS load, dtype downcast, temporal split
│   ├── features/              # ONE builder, shared by train + serve
│   ├── model/                 # train, calibrate, importances
│   ├── economics/             # costs.yaml, EV engine, threshold search
│   ├── casefile/              # evidence synthesis + retrieval
│   ├── assembler/             # LLM assembly + groundedness verifier
│   ├── razorpay/              # client, schema validation, dry-run adapter
│   └── api/                   # FastAPI: POST /disputes/{id}/triage
├── eval/
│   ├── run_eval.py            # regenerates EVERY number in the README
│   └── reports/               # metrics.json + plots, committed
├── ui/                        # Streamlit demo console
├── docs/ARCHITECTURE.md
└── README.md
```

**`eval/run_eval.py` regenerates every number in the README.** "All metrics here are reproduced by one command" is a line most submissions cannot write.

## 12. Razorpay integration

- Test-mode API keys.
- **Gate G2 (Day 0, 30-minute timebox):** determine whether disputes can be created or simulated in test mode. Docs state test and live modes have the same functionality except real payments, but test-mode dispute creation is unconfirmed.
- Fallback regardless of outcome: dry-run adapter that constructs and schema-validates the `contest` payload without transmitting. Clearly labelled in the demo.
- Live API calls only if G2 shows they are trivially available.

## 13. Setup requirements

**Accounts (Day 0):**

| # | Item | Gotcha |
|---|---|---|
| 1 | Submit the Buildathon application form | Deadline unpublished. Do this first. |
| 2 | Razorpay account, Test Mode keys | Available without full KYC |
| 3 | Kaggle account plus `kaggle.json` | **Must accept competition rules on the `ieee-fraud-detection` rules page first, or the API 403s** |
| 4 | Anthropic API key | About $5 of credit is ample |
| 5 | Public GitHub repo | Public from day one; commit history is evaluated |
| 6 | Screen recorder and mic, YouTube unlisted | Test the mic on Day 0 |

**Environment:** Python 3.11 or 3.12 (not 3.13); ~8 GB free disk; 8 GB RAM with dtype downcasting on load; Git.

**Dependencies:** `pandas numpy pyarrow lightgbm scikit-learn matplotlib pydantic fastapi uvicorn anthropic python-dotenv pyyaml kaggle razorpay pytest streamlit`

**Hygiene before first commit:** `.gitignore` covering `data/`, `.env`, `*.pkl`, `__pycache__`; `.env.example` committed, `.env` never; MIT license; README opens with the defense-only statement.

## 14. Schedule

| Day | Ships by end of day |
|---|---|
| Aug 31 | Accounts and keys, **application submitted**, G2 checked, dataset downloading, repo scaffolded |
| Sep 1 | **G1 censoring gate**, temporal split, features, first LightGBM. A real PR-AUC exists. |
| Sep 2 | Calibration, `costs.yaml`, EV engine, threshold search, 4 baselines. The rupee chart exists. |
| Sep 3 | Case files, assembler, verifier, schema emitter, FastAPI. End-to-end triage works. **SCOPE FREEZES.** |
| Sep 4 | Streamlit UI, README, ARCHITECTURE.md, reproducibility check, **record video** |
| Sep 5 AM | Buffer, submit |

Estimated ~36 hours with the cuts below applied.

**Locked cuts (decided now, not at 2am on Sep 4):**

1. Streamlit, not Next.js — decided, not a fallback
2. LightGBM native importances, not SHAP
3. Sample to ~200k rows if RAM bites, documented as a sampling decision
4. One reason-code family
5. Razorpay dry-run adapter unless G2 says otherwise

Below the freeze line, nothing gets *fixed* after Sep 3. It gets *cut*.

## 15. Deliverables

1. Public GitHub repo
2. 5-minute pitch video
3. Architecture documentation

**Video structure:**

| Time | Beat |
|---|---|
| 0:00–0:30 | The problem, in rupees |
| 0:30–1:00 | What it does, one sentence plus architecture frame |
| 1:00–2:30 | Live: dispute → triage → all three outcomes. **Show the refusal case.** |
| 2:30–3:45 | Metrics: PR-AUC, why a temporal split, calibration, the rupee chart vs baselines |
| 3:45–4:30 | Fee slider moving the threshold; limitations stated out loud |
| 4:30–5:00 | Real vs synthetic; prior art; what is next |

The model gets 60 seconds at most. Economics, assembler and honesty get the rest.

## 16. Risks

| Risk | Mitigation |
|---|---|
| Label censoring understates precision | Gate G1 on Day 1; document either outcome |
| The low-risk-implies-friendly-fraud inference (8.1) cannot be validated on this data | State it as an assumption everywhere; keep derived claims in family B; clip its influence against a published base rate |
| Test-mode disputes unavailable | Gate G2 on Day 0; dry-run adapter regardless |
| Prior art makes the work look derivative | Prior Art section; position on measurement, never novelty |
| Stage 2 unverifiable | Labelled simulation with sensitivity; kept thin |
| Memory pressure on 590k by 434 | Downcast on load; sample to 200k if needed |
| Timeline slips | Locked cut list; Sep 3 scope freeze; full buffer day |
| Model resembles saturated repos | Not the differentiator; 60s of video; lead with the decision system |

## 17. Open items

1. **Buildathon application deadline** — unpublished on the site. OPEN; submit early regardless.
2. ~~Razorpay dispute fee~~ — **RESOLVED 2026-08-31.** Razorpay publishes no dispute fee. Settled at ₹750 with the cited range documented in `costs.yaml`; see §8.2. The sensitivity sweep covers the full range, which is the correct treatment for a genuinely unpublished parameter.
3. **Gate G2 outcome** — test-mode dispute availability. OPEN; requires the human partner's Razorpay login. The dry-run adapter ships either way.
4. **LICENSE copyright holder** — currently "Dispute Autopilot Contributors". Requires the human partner's decision; an agent should not invent a person's legal name.
