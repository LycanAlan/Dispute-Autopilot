# Video script — Dispute Autopilot

5-minute pitch, recorded for a hiring-panel audience (Razorpay AI Buildathon,
Track 02 — AI Risk Manager). Every number below is copied from `README.md`,
which is itself regenerated from `eval/reports/metrics.json` — **read the
current README beside this script before recording**; if a number here and
the README ever disagree, the README wins and this script is stale.

**Demo rows.** Computed once, ahead of time, by `python -m eval.find_demo_rows`
(zero API calls — it calls `decide()` directly, never the assembler). Drive
the Triage tab straight to these row indices; do not hunt for outcomes live,
which would call the paid assembler an unknown number of times.

| Outcome | Row | p(chargeback) | Amount | Posture | Delta-EV (INR) | Note |
|---|---|---|---|---|---|---|
| CONTEST | 7 | 0.0581 | INR 35,067.50 | ACTIVE | +14,044.42 | low risk now, but the §8.1 assumption says a later dispute on a low-risk transaction leans first-party misuse — winnable, and the amount is large |
| ACCEPT | 780 | 0.8067 | INR 830.00 | — | −124.16 | **the strongest beat** — 80.7% chargeback probability and the system still declines; ₹830 doesn't cover the contest fee and ops cost even at a favorable win rate |
| REVIEW | 0 | 0.0404 | INR 5,685.50 | — | — | missing `shipping_proof`, a required field for `fraud_card_absent` — the evidence gate fires regardless of what the economics say |

**Do not invent other rows.** These three are the only ones verified in
advance. If a different index is shown live, the EV numbers on screen may
not match this script and must be read off the app, not recited from memory.

---

## Rules for the recording (do not skip)

1. **The classifier gets 60 seconds of airtime, total, across the whole
   video.** It is not the differentiator — the evidence gate and the
   groundedness verifier are. The Metrics beat (2:30–3:45) is long, but most
   of it is about *methodology* (why a temporal split, why PR-AUC, why
   calibration matters for EV math) and the rupee comparison against
   baselines, not the model itself. See the timing check at the bottom of
   this file.
2. **Say "this is not novel."** Name the commercial products. Then say what
   they do not publish. Do not soften this into "differentiated" or
   "innovative" language — the README's own Prior Art section makes the same
   claim in writing, and the video must not claim more than the document it
   accompanies.
3. **Show a refusal.** Both kinds, in fact — it is the most memorable thing
   in the demo, and this system is defense-only precisely because it can
   decline. Missing-evidence REVIEW (row 0) and the fault-injection
   groundedness refusal are different mechanisms; show both.
4. **Fault injection is a deliberate demonstration, never spontaneous model
   behaviour.** Say this out loud on camera at the moment it fires. The UI's
   own warning banner ("Fault injection active... it is not in the vault")
   must be visible on screen when you say it — do not cut away before it
   renders.
5. **State the §8.1 assumption on camera**, in the Limitations beat, close to
   verbatim.
6. **Gate G2 language.** Say "constructs and validates a Razorpay contest
   payload." Never say "submits to Razorpay" or "sends to Razorpay" — no run
   of this project has transmitted a contest payload; `docs/gates/G2-razorpay-test-mode.md`
   records this as the DRY RUN verdict, and overclaiming it is the single
   fastest way to lose credibility with a payments-engineering panel.

---

## Script

### 0:00–0:30 — The problem, in rupees

**[ON SCREEN: title card, then straight to a payments-dashboard-style visual
or just the presenter to camera]**

> "Hi, I'm Ali Ansari. Merchants who fight fraud-coded chargebacks only win
> them 17.1% of the time — that's the published rate. Contest every dispute
> and you lose money on 83 out of every 100. Accept every dispute and you eat
> every loss you could have fought. The right answer isn't 'always' or
> 'never' — it's a rupee expected-value calculation, per transaction. That's
> what this system does."

*(~65 words, ~28s at a brisk pitch pace)*

### 0:30–1:00 — What it does

**[ON SCREEN: a simple 3-box diagram — predict → vault → respond — or the
architecture section of the README]**

> "Dispute Autopilot is a three-stage pipeline. Stage one scores every
> transaction for chargeback risk at collection time. Stage two turns that
> score into an evidence-preservation posture — because vaulting evidence
> costs money, and most transactions are never disputed. Stage three runs
> only when a real dispute lands: it checks whether the required evidence
> actually exists, computes the expected value of contesting, and — only if
> the answer is yes — asks an LLM to draft a response using nothing but the
> vault, which a deterministic verifier checks claim by claim before
> anything gets near Razorpay's API."

*(~100 words, ~30s)*

### 1:00–2:30 — Live demo, all three outcomes

**[SCREEN: Streamlit app, Triage tab throughout this section]**

**Shot 1 — CONTEST (row 7), ~25s**

**[Set "Transaction row" to 7. Let the app render.]**

> "Row 7: 5.8% chargeback risk, but ₹35,067 on the line. Low risk sounds
> safe — but if a transaction that looked this safe *still* gets disputed
> later, our assumption is that it's more likely to be first-party misuse
> than genuine fraud, which means it's winnable. Expected value: plus
> ₹14,044. CONTEST."

**[Point at the delta-EV figure and the ACTIVE posture badge. Do not linger
on the assembled bundle here — save assembler screen time for the fault
injection shot below.]**

**Shot 2 — ACCEPT (row 780), ~30s — THE STRONGEST BEAT**

**[Set row to 780.]**

> "Now watch this one. Row 780: 80.7% chargeback probability. Four out of
> five odds this transaction gets disputed. Every instinct says fight it.
> The system says ACCEPT. Why? It's ₹830. Even at a favorable win rate, the
> contest fee and the ops cost don't clear ₹830 in expectation — delta-EV is
> negative ₹124. This is the whole pitch in one screen: the system isn't
> reacting to risk, it's reacting to *money*."

**[Hold on this screen for a beat before cutting — this is the line the
panel should remember.]**

**Shot 3 — REVIEW, missing evidence (row 0), ~20s**

**[Set row to 0.]**

> "Row 0 looks fine on paper — low risk, ₹5,685. But the vault is missing
> shipping proof, which `fraud_card_absent` requires. The economics never
> get a vote here: no required evidence, no contest, full stop. REVIEW."

**Shot 4 — the fault-injection refusal, ~15s**

**[Switch the "Evidence assembler" radio to "Fault injection." Let the
orange warning banner render fully before speaking.]**

> "One more refusal, and I want to be completely upfront about this one: I'm
> about to force it. This mode inserts a fabricated tracking number — 'AWB
> ZZZ999' — that does not exist anywhere in the vault. It's a deliberate
> demonstration, not the model going rogue."

**[Trigger it. Let the groundedness gate fire on screen — the claim shows as
ungrounded, the decision downgrades to REVIEW.]**

> "There — the verifier caught it, claim by claim, and downgraded the
> decision. That's the mechanism that keeps this defense-only: it doesn't
> trust the model, it checks it."

*(Total demo section: ~90s across four shots)*

### 2:30–3:45 — Metrics

**[SCREEN: Metrics tab, then the PR curve / calibration curve images]**

> "Quickly, on measurement — this is methodology, not the model, so I'll
> move fast. We report PR-AUC, not accuracy, because chargebacks are 3.4% of
> transactions and a model that predicts 'never' is 96.6% accurate and
> useless. Calibrated PR-AUC is 0.4243, ROC-AUC 0.87. The train/test split is
> temporal, not random — IEEE-CIS links related transactions by account and
> billing address, so a random split leaks information across the boundary.
> We ran a censoring check on that split before trusting it — clean. And
> this is the calibration curve: predicted probability against observed
> frequency. Every downstream rupee number is an expected-value calculation,
> so if the probabilities are wrong, the money is wrong — calibration is
> what makes stage three's math mean anything."

**[Cut to the rupee bar chart / net_inr table]**

> "Against real baselines, in rupees, not accuracy: flagging nothing loses
> 53.7 million. Flagging everything loses 3.2 million. The model loses 2.7
> million — better than flag-everything by ₹542,539. That margin is real but
> it's not huge relative to the two numbers being subtracted, and the README
> says so."

*(~190 words, ~75s. Cumulative "about the classifier itself" airtime so far:
roughly 20–25s inside this beat, well under the 60s budget.)*

### 3:45–4:30 — Fee slider, then limitations, out loud

**[SCREEN: Economics tab, move the fee slider live]**

> "Razorpay doesn't publish a dispute fee, so we built a slider instead of
> guessing one number. Push the fee up — contesting gets less attractive,
> and the optimal threshold moves. That's the sensitivity analysis, live, not
> a static chart."

**[Cut to camera or a text card with the assumption notice]**

> "Now the limitations, because a submission that hides its own weak points
> doesn't deserve to be trusted on the strong ones. The core assumption:
> 'Contest recommendations rest on an inference that is not validated by
> this dataset: a transaction scored as low chargeback risk that is
> nevertheless charged back is treated as more likely to be first-party
> misuse. IEEE-CIS cannot separate first-party misuse from third-party
> fraud, so this is calibrated to published industry base rates, not
> measured here.' That's quoted verbatim — it's in the README, and it's on
> every decision this system returns. Second: the evidence corpus is
> synthetic, built deterministically from real transaction features, but
> synthetic. Third: the groundedness verifier catches invented identifiers —
> tracking numbers, order refs — it does not catch invented prose that cites
> a real source key. That's the refusal gate's job, not this function's, and
> the README says so."

*(~185 words, ~45s)*

### 4:30–5:00 — Real vs synthetic, prior art, next steps

**[SCREEN: back to camera, or the Prior Art table in the README]**

> "One more time, plainly: the decision model is real — IEEE-CIS labels,
> held-out temporal split, published metrics. The evidence documents it
> argues from are synthetic, because this dataset has no order records or
> tracking numbers. Don't confuse the two.
>
> And this is not novel. Stripe Smart Disputes, Chargeflow, Justt,
> Midigator, Kount, Visa's Verifi Order Insight, Mastercard's Ethoca
> Consumer Clarity — all of this ships today, in production, to real
> merchants. What none of them publish is precision, recall, calibration, or
> a false-positive cost. This project is the open, measurable version of the
> same idea.
>
> On the Razorpay side specifically: Stage three constructs and validates a
> Razorpay contest payload against their documented evidence schema — it
> does not submit one. Test-mode credentials authenticate, but a test
> account has no real chargebacks to contest against, so that last step is
> implemented and unexercised, not demonstrated. That's the honest next
> step: run this against a real test-mode dispute the moment one exists."

*(~155 words, ~30s)*

---

## Timing check

| Beat | Budget | Approx. word count | Approx. spoken time |
|---|---|---|---|
| 0:00–0:30 | 30s | ~65 | ~28s |
| 0:30–1:00 | 30s | ~100 | ~30s |
| 1:00–2:30 | 90s | 4 shots, screen-heavy | ~90s |
| 2:30–3:45 | 75s | ~190 | ~75s |
| 3:45–4:30 | 45s | ~185 | ~45s |
| 4:30–5:00 | 30s | ~155 | ~30s |
| **Total** | **5:00** | | **~5:00** |

**Classifier-airtime budget (rule 1):** the only segments that talk about the
LightGBM model itself, as opposed to methodology, the evidence system, or
economics, are inside the 2:30–3:45 beat — roughly the PR-AUC/ROC-AUC/
calibration sentences, about 20–25 seconds. Comfortably under the 60s cap.

## Family C — what to say if the numbers exist by recording time

As of this script being written, `eval/reports/generation_metrics.json` does
not exist — `eval/run_generation_eval.py` (Task 8.2) has been written but
deliberately not run, because every case it assembles is one paid API call
and nothing in this project's budget has been spent yet. **Do not hand-type
Family C numbers into this script or say them on camera from memory.**

If, by the time this video is recorded, the project owner has run
`python -m eval.run_generation_eval` deliberately and
`eval/reports/generation_metrics.json` exists, read `groundedness_mean` and
`gate_refusal_rate` directly from that file and add one sentence to the
fault-injection shot (1:00–2:30) or the limitations beat (3:45–4:30), e.g.:

> "Across a batch of assembled cases, groundedness averaged
> {groundedness_mean} — and remember, `completeness_refusal_rate` in that
> report is ~0.5 by construction, not a finding; `gate_refusal_rate` is the
> number that matters."

If the file does not exist, say nothing about batch numbers — the fault
injection shot already proves the mechanism works on one case, live, and the
script above does not depend on the batch metric existing.

## Recording checklist

- [ ] Read the current `README.md` immediately before recording; if any
      number in this script has changed, fix the script first.
- [ ] Confirm rows 7, 780, and 0 still produce the outcomes in the table
      above by running `python -m eval.find_demo_rows` (zero API calls) —
      if the model or config changed since this script was written, the
      indices may no longer match.
- [ ] Record with the "Deterministic (free)" or the row-7/row-780/row-0 path
      that does not require the live assembler, except for the single
      fault-injection shot, which never touches the network either — it
      fabricates the claim locally and lets the *verifier* reject it.
- [ ] Upload unlisted to YouTube.
- [ ] Add the link to `README.md`.
