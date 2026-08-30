# Session Handoff — 2026-08-31

**Resume target: 06:00 IST, 1 September 2026. Submission deadline: 5 September 2026.**

Read this file, then `.superpowers/sdd/2026-08-31-dispute-autopilot/progress.md` (the ledger).
The ledger is gitignored scratch; this file is the durable record. If they disagree, trust
git history over both.

---

## 1. What this project is

A submission for **Razorpay AI Buildathon, Track 02 (AI Risk Manager)**. Not a prize
hackathon — a hiring funnel: ₹75,000/month, 6 or 12 months, in-person Bangalore, panel
review. Deliverables are a **public repo, a 5-minute pitch video, and architecture docs**.

**The build: "Dispute Autopilot"** — a three-stage chargeback loss-prevention system.

1. **Predict** — score each transaction for P(chargeback) on real labels
2. **Vault** — preserve dispute evidence at transaction time, while facts are fresh
3. **Respond** — decide contest-vs-accept on expected value, then assemble a grounded
   evidence bundle in Razorpay's evidence schema

Authoritative documents, both committed:

- Spec (binding authority): `docs/superpowers/specs/2026-08-31-dispute-autopilot-design.md`
- Plan (33 tasks, 11 phases): `docs/superpowers/plans/2026-08-31-dispute-autopilot.md`

## 2. Positioning — read before writing any README or video copy

**This project is NOT novel and must never be presented as novel.** Stripe Smart Disputes,
Chargeflow, Justt, Midigator/Kount all ship this commercially; Verifi Order Insight and
Ethoca Consumer Clarity do the pre-dispute half at network level; US Patent 10,839,394
already specifies the expected-value formula the design uses; an SSRN paper covers the
same ground academically.

The track brief never asks for novelty. It asks for *measured precision and recall on a
held-out test set* and *honest metrics including false-positive cost*.

**The claim we make instead:** commercial vendors publish win rates, which are
unfalsifiable from outside. None publish precision, recall, calibration, or
false-positive cost. This is the open, measurable version. A **Prior Art** section in the
README is mandatory.

Defensible differentiation is only these four: published reproducible metrics;
Razorpay-native evidence schema; a groundedness verifier plus refusal gate; Indian
context complementary to Razorpay Thirdwatch (which covers RTO/COD, not card disputes).

## 3. The single most important technical fact

IEEE-CIS's `isFraud` label means **"a chargeback was reported within 120 days"**, not
"this transaction was fraudulent". Per the competition host, it marks the charged-back
transaction plus later ones linked by account, email, or billing address.

Consequences that shape everything:

- The model is a **chargeback predictor by construction** — no proxy assumption.
- The dataset **cannot** separate first-party misuse (friendly fraud) from real fraud
  within `isFraud=1`. Any design needing that distinction is invalid.
- The label has known false negatives (unreported fraud labelled legit).
- The "linked posterior transactions" rule clusters card entities, which is exactly why
  a random split leaks and a **temporal split** is required.

## 4. Where the work stands

Branch `main` (human partner explicitly consented to working directly on main).
**Suite: 19 passed, pristine.**

| Commit | What |
|---|---|
| `648eac8` | spec + plan |
| `d8fec82` | scaffold, deps, editable install (Python 3.12.10) |
| `f55350d` | data contracts frozen |
| `b8b69de` | typed cost + feature config |
| `55a53c6` | spec/plan citation corrections |
| `6de124c` | fix round: costs.yaml arithmetic, frozen config, notice casing, CONFIG_DIR |
| `9db6c8e` | plan: explicit `costs` param, config mutation removed |
| `f231118` | the single feature builder |
| `4444eee` | train/serve parity guard |
| `778bbb5` | rupee-denominated cost model |
| `6e57aed` | four comparison baselines |
| `c06a1ac` | EV-optimal threshold search |
| `bab7406` | plan: categorical train/serve skew fix (2.1, 2.2, 3.1, 3.3) |

**Tasks complete and reviewed:** 0.1, 0.4, 0.5
**Tasks implemented, review outcome pending action:** 2.1, 2.2 (see §5), 4.1, 4.2, 4.3
**Roughly 10 of 33 tasks through implementation.**

## 5. ⚠️ THE FIRST THING TO DO ON RESUME

**Task 2.1/2.2 has an unfixed Critical finding. The plan is updated; the code is not.**

`build_features` casts categoricals with categories inferred *per call*. A batch build
gets categories spanning the batch; a single-row serve build gets exactly one. **LightGBM
splits on `.cat.codes`, not values**, so the same value receives a different integer at
train time than at serve time. The existing parity test compares `.iloc[i]` scalar values
and is structurally blind to it.

Impact if shipped: every batch metric in the README looks perfect while **every live
score in the demo is computed on wrong codes**. Silent. No error, no failing test.

The fix is fully specified in the plan at `bab7406` and spans four tasks:

1. `build_features` gains `categories: dict[str, pd.CategoricalDtype] | None = None`
   (None = fit at training, provided = apply at serving; unseen values → NaN)
2. New `extract_categories(features)` captures the fitted sets
3. `train.py` persists them to `artifacts/categories.joblib` via `save_categories`
4. `Scorer` holds `categories`, `Scorer.load()` reads the artifact, `score_batch` threads
   it through
5. Parity tests compare `.cat.codes`, **plus** a guard-the-guard test asserting that naive
   per-call inference *does* diverge — so the suite cannot go vacuous again

**Action:** dispatch a fix round for Tasks 2.1+2.2 against the updated plan. Regenerate
those briefs first (see §7). Tasks 3.1/3.3 are unbuilt, so they will pick the fix up
naturally from the plan.

**Also pending:** Phase 4 (4.1/4.2/4.3, commits `778bbb5`..`c06a1ac`) has been
implemented but **not yet reviewed**. Dispatch that task review.

## 6. Blocked on the human partner — the real critical path

None of this can be delegated, and the first item gates the entire measured half of the
project:

1. **Kaggle** — sign in, click "I Understand and Accept" at
   `kaggle.com/c/ieee-fraud-detection/rules`, then save the API token to
   `C:\Users\lycan\.kaggle\kaggle.json`. **Without this there is no dataset, therefore no
   model, no metrics, no charts, no demo, and nothing to put in the README.** Blocks
   Phases 1, 3, 8, 9.
2. **Buildathon application form** — `https://forms.gle/d9r2gvxp8cmoZhon9`. No published
   deadline. If it closes, everything else is moot.
3. **Razorpay test-mode keys** — for Gate G2 (`docs/gates/G2-razorpay-test-mode.md`, not
   yet written). The dry-run adapter ships either way, so this is not a hard blocker.
4. **Anthropic API key** — needed for Phase 6 (the assembler) and Task 8.2.
5. **LICENSE copyright holder** — currently "Dispute Autopilot Contributors". Should be
   the author's name. An agent should not invent a person's legal name; ask.

Keys go in `.env` (gitignored), never in `.env.example`.

## 7. Process in use, and one standing hazard

Executing via the **superpowers:subagent-driven-development** skill: one implementer
subagent per task (batched where tasks are small and same-shape), a task review after
each, fix rounds capped at five, then a whole-branch review at the end.

- Ledger: `.superpowers/sdd/2026-08-31-dispute-autopilot/progress.md`
- Scripts: `<superpowers>/skills/subagent-driven-development/scripts/{task-brief,review-package,sdd-workspace}`
- Briefs and reports live beside the ledger

**STANDING HAZARD — stale briefs.** Briefs are snapshots of the plan at generation time.
Any plan edit silently invalidates every brief generated earlier. This nearly shipped the
mutable-config design a second time. **Regenerate briefs after every plan edit.** Briefs
for 2.1, 2.2, 3.1, 3.3 are stale as of `bab7406` and MUST be regenerated before dispatch.

## 8. Rulings made (each with what it costs if wrong)

1. **Work directly on `main`** — human partner consented explicitly. The repo history is
   the artifact a panel reads; a throwaway branch adds merge noise to an empty repo.
2. **Batch small same-shape tasks** into one dispatch (0.4+0.5, 2.1+2.2, 4.1+4.2+4.3).
   Cost: a larger review surface per dispatch.
3. **`artifacts/` gitignored** — a LightGBM booster on 590k rows is multi-MB and
   reproducible via `python -m eval.run_eval`. Cost: a clean clone must train before the
   API/UI run, which the README already instructs.
4. **Task 9.1's UI must render the dry-run Razorpay payload on a CONTEST decision.** The
   plan built `DryRunClient` but nothing consumed it, so the schema-valid contest payload
   — the entire Razorpay-native claim — would have been emitted nowhere the demo could
   show it. Spec §12 requires it be "clearly labelled in the demo".
5. **`contest_fee_inr = 750.0`, labelled unpublished, not placeholder.** Razorpay
   publishes no dispute fee. ₹750 is the top of the cited India band (₹200–750); choosing
   high is deliberately conservative, since a higher fee makes contesting less attractive
   and so understates rather than inflates the model's measured benefit. This is why the
   sensitivity sweep and the UI fee slider are methodologically **required**.
6. **Citation corrections** — LexisNexis is **$5.13 (2026)**, not $4.61 (2025). **Never
   assert 43.8% as the first-party-misuse share** — that number appears in Chargebacks911
   material as the *representment win rate*, a different statistic. Cite the 40–75% range.
   The verified thesis figure is **17.1%** fraud-coded win rate vs 41–54% overall, and the
   sharpest framing is **net recovery 10.7%**: merchants win 43.8% of what they represent
   but keep only 10.7% of the money.
7. **Config models frozen**; economics functions take an optional
   `costs: CostConfig | None`. Removed a shared-mutable-singleton footgun the plan had
   shipped as a feature (the UI slider mutated the cached instance under a try/finally).
8. **Accepted:** Pydantic `frozen=True` does not deep-freeze `list[str]` fields, so
   `reason_codes[...].required.append(...)` could still mutate shared state. Retyping to
   tuples is contract churn for a hazard no planned code exhibits. Documented in the
   module docstring instead.
9. **Accepted:** TDD RED evidence cannot be verified from a diff. The tests exist, assert
   real behaviour, and pass.
10. **Dispatched a review and an unrelated implementer concurrently** (Phase 2 review
    alongside Phase 4 implementation) because they touch disjoint files and only one
    writes to git. Cost: fix-scoped diff ranges need care when commits interleave.

**Deferred minors** (in the ledger, for the final whole-branch review to triage):
`*.egg-info/`+`build/` added beyond brief (accepted); a near-trivial contracts test;
an unsourced causal aside in a costs.yaml comment; `builder.py` hardcodes engineered-
feature source column names instead of reading them from `features.yaml`;
`email_domain_mismatch` encodes "unknown" as "matched".

## 9. Next actions, in order

1. Regenerate stale briefs (2.1, 2.2, 3.1, 3.3) from the plan at `bab7406`
2. Dispatch the **fix round for 2.1+2.2** — the categorical skew (§5)
3. Dispatch the **task review for Phase 4** (`4444eee`..`c06a1ac`)
4. Continue the data-independent spine: 4.4 (decision engine), 5.1–5.3 (case files,
   vault, completeness), 6.1 (Razorpay schema), 6.3 (groundedness verifier), 7.1
   (dry-run client)
5. **Then work stops** until `kaggle.json` exists. Phases 1, 3, 8, 9 all need the dataset.

## 10. Schedule reality

The plan estimated ~36 hours of work. The scope freeze is **end of 3 September** — after
it, incomplete work is *cut*, never fixed. The cut list, in order: family C sample size →
UI economics tab → architecture doc folded into README → live Razorpay path → sample the
dataset to 200k rows.

**Never cut:** the G1 censoring gate, calibration, the three separated metric families,
the evidence gate, the groundedness verifier, the Prior Art section, or the video.

A submission without a video scores nothing. The buffer day exists for the video.
