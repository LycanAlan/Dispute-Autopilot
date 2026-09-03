# Project status

**Submission deadline: 5 September 2026.** Track 02 — AI Risk Manager, Razorpay
AI Buildathon. Author: Ali Ansari.

This file replaces an earlier working handoff that described the state after
the first day of implementation (19 tests, 10 of 33 tasks). That version was
kept for session continuity and is now several dozen commits out of date; git
history has it if the process is of interest.

Start with [README.md](../README.md) for what the project is and what it
measures. This file records only what a person picking the repo up needs to
know that the README does not say.

## State

| | |
|---|---|
| Test suite | 84 passing |
| Metric families | A, B and C all measured |
| Gates | G1 CLEAN, G2 DRY RUN |
| Total API spend for all generation measurement | under $0.40 |
| Public git remote | **not yet configured** |

Everything in the plan is implemented. The remaining work is not code.

## What is left

1. **Record the 5-minute video.** Script and shot list: [VIDEO-SCRIPT.md](VIDEO-SCRIPT.md).
   Demo rows are pre-selected and confirmed: row 7 CONTEST, row 780 ACCEPT,
   row 0 REVIEW. `python -m eval.find_demo_rows` regenerates them without
   spending anything.
2. **Push to a public GitHub repository.** The submission requires a public
   repo and no remote is configured yet.
3. **Submit the application form** if that has not already been done.

## Things a reader should not have to rediscover

**The demo costs nothing by default.** `ui/app.py` defaults its assembler to
Deterministic, which needs no API key. Selecting "Claude (live)" bills roughly
$0.008 per contested case. "Fault injection" is free and is what demonstrates
the refusal gate firing.

**The evidence corpus is synthetic; the labels are real.** The model is trained
and measured on real IEEE-CIS chargeback labels. The evidence documents it
later argues from are generated, because IEEE-CIS contains no order records or
tracking numbers. Groundedness is still a valid property to measure on a
synthetic source — it asks whether the assembler invented facts absent from its
source — but no representment win rate should be inferred from this corpus.

**`isFraud` means "a chargeback was reported within 120 days"**, not "this
transaction was fraudulent". The model is a chargeback predictor by
construction. The dataset cannot separate first-party misuse from third-party
fraud, which is why the contest-recommendation logic carries an assumption
notice that no `Decision` can be constructed without.

**Artifacts are gitignored and regenerate in about 40 seconds.** A fresh clone
must run `python -m eval.run_eval` before the API or UI will start, because
`Scorer.load()` needs `artifacts/model.txt`, `categories.joblib` and
`calibrator.joblib`. The README setup section says this.

**Two open weaknesses**, both documented in the README rather than hidden:
evidence *favourability* is not factored into the contest decision
(`w_completeness` measures presence, not helpfulness), and the groundedness
verifier compares identifier-like tokens, so invented prose citing a real
source key passes.

## How this was built

Spec and plan under `docs/superpowers/`, executed task by task with a separate
review of each. The defects that process caught, and the ones it did not, are
logged in [FINDINGS.md](FINDINGS.md) — that file is the most direct evidence of
how the engineering decisions here were actually made.
