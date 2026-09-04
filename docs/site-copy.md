# Site copy

Every user-visible string on the frontend. Sections apply this verbatim.

Rules that produced it: no em dashes, no en dashes as punctuation. No sentence
longer than about fifteen words. Specifics instead of adjectives. State the
awkward part rather than hiding it. Nothing here that is not traceable to
`snapshot.json` or to a cited source.

Numbers in `{braces}` are read from the data at runtime, never typed into the
markup. If a figure is not in the snapshot it does not go on the page.

Brace paths are the real key paths in `frontend/data/snapshot.json`. Four of
them were wrong when this file was first written: `family_c.groundedness`,
`family_c.ungrounded_upper_bound_95`, `family_b.net_loss_before` and
`net_loss_after` do not exist. Family C is stratified into `contestable` and
`adverse` rather than reported flat, and family B holds `net_inr` keyed by
policy. The section agent that hit this mapped them and said so instead of
inventing values, which is the only reason the page is not currently showing
four blanks.

---

## 1. hero

**Title:** Dispute Autopilot

**Subtitle:**
Three-stage chargeback loss prevention for Razorpay merchants.
Predict the risk, preserve the evidence, decide on expected value.

**Stat:** {n_total} transactions
**Caption under the cloud:** {n_sampled} of them drawn here, sampled evenly across time.

**Scroll cue:** Scroll.

---

## 2. label

**Kicker:** The label

**Headline:** isFraud does not mean fraud

**Body:**
In IEEE-CIS it means a chargeback was reported within 120 days.
Nothing in the data separates a stolen card from a customer who changed their mind.

So this predicts chargebacks. Calling it a fraud detector would be the first lie,
and every downstream number would inherit it.

---

## 3. split

**Kicker:** The split

**Headline:** A random split would have flattered us

**Body:**
Card entities repeat across rows. Shuffle them and the same card lands in train
and in test, so the model recognises the answer instead of predicting it.

Train on the past. Score the future. 70 / 10 / 20, in time order.

**Footnote:** Precedent for the temporal split: arXiv 2208.14417.

---

## 4. model

**Kicker:** The model

**Headline:** Calibration is not decoration here

**Body:**
The next stage multiplies this number by a rupee amount.
That only works if it is a probability, not a ranking score.

**Stats:**
- Brier score {family_a.brier_uncalibrated} to {family_a.brier} after isotonic calibration
- PR-AUC {family_a.pr_auc_uncalibrated} to {family_a.pr_auc}
- Precision {family_a.precision_at_threshold}, recall {family_a.recall_at_threshold}

**The part worth saying out loud:**
Calibration makes PR-AUC slightly worse, and it is kept anyway.

Isotonic regression is a step function. It collapses scores into fewer distinct
levels, and average precision pays for that through ties. Ranking quality is
unchanged. Brier score, which measures whether the number means what it says,
improves by a factor of three.

Every decision after this one is an expected value computation, and expected
value arithmetic on a ranking score is meaningless.

**Caption:** Held out in time, never shuffled.

---

## 5. zoom

**Headline:** Now just one of them.

**Body:**
Transaction {cases.contest.transaction_id}. The money is already gone.
The bank took it back this morning.

You have about a week to decide what to do about it.

---

## 6. gate1

**Kicker:** Gate one

**Headline:** Theft, or regret?

**Body:**
Two disputes arrive wearing the same reason code.

One is a stolen card. You will not win that, and the customer is telling the truth.
The other is a customer who forgot, or whose kid ordered it, or who wants it free.
That one you can win.

The tell is whether the transaction looks like the cardholder.
Same device, same city, same email domain, ordinary amount.

**Pull quote:** So a low fraud score raises the odds of winning. This part runs backwards on purpose.

---

## 7. gate2

**Kicker:** Gate two

**Headline:** Winnable is not the same as worth it

**Body:**
Expected recovery, minus what it costs to chase.

The contest fee is charged win or lose, so it is identical either way and cancels
out of the comparison. It is deliberately absent from the formula.
Only staff time is a real marginal cost.

**Interaction label:** Drag the amount

**Result caption:** {action} at {amount}

**Pull quote:** The system accepts disputes it would probably win. On a small enough
transaction, winning costs you money.

---

## 8. refusal

**Kicker:** Gate three

**Headline:** Did the model make it up?

**Body:**
An LLM asked for a representment will produce one.
Tracking number, delivery date, signature. Fluent and complete, whether or not
any of it happened.

Every sentence here has to point at a key in the evidence file.
A deterministic check walks each one. No model marks its own work.

**During the strike:** This claim points at nothing.

**After:** CONTEST becomes REVIEW. A person sees the sentence that was rejected.

**Pull quote:** The model drafts. It never decides.

**Replay button:** Run it again

---

## 9. measured

**Kicker:** What was measured

**Headline:** Three numbers that are never averaged together

**Body:**
**A, measured.** Model quality on held-out data.
PR-AUC {family_a.pr_auc}, precision {family_a.precision_at_threshold}, recall {family_a.recall_at_threshold}.

**B, simulated.** What the policy would have saved.
Net loss {family_b.net_inr.none} to {family_b.net_inr.model}. Uplift over
flag-everything: {family_b.model_uplift_vs_flag_all_inr}.

**C, measured.** Whether the model invents facts.
Groundedness {family_c.contestable.groundedness_mean_over_attributed} on cases
with a real argument to make, and the same on adverse cases. Upper bound on the
ungrounded rate, {family_c.contestable.ungrounded_upper_bound_95} at 95%
confidence, which is what a sample this small will support.

**Footnote:** Blending A and B once made precision read 3.7 percent. That mistake
is written up in the repo rather than quietly fixed.

---

## 10. live

**Kicker:** Try it

**Headline:** Run one through yourself

**Body:**
Pick a transaction. It goes to the scoring model, the evidence gate, and the
economics, in that order.

**Live badge:** LIVE, calling the local API
**Offline badge:** Precomputed. Start the API to run this live.

---

## 11. colophon

**Notice block, set apart:**

This system is defense-only.
It scores disputes and drafts grounded chargeback responses.
It cannot generate, alter, or synthesise evidence for real use.
When the evidence it would need is not in the vault, it refuses to contest and
downgrades the decision to REVIEW.

**Headline:** What this does not show

**Body:**
The evidence documents are synthetic. IEEE-CIS has no order records or tracking
numbers, so they were generated. The chargeback labels are real.

No representment win rate can be inferred from any of this, and nothing here
claims one.

Evidence favourability is not yet part of the contest decision. The verifier
compares identifier-like tokens, so invented prose citing a real source key
would still pass. Both are open.

**Author:**
Ali Ansari
LycanAlan
github.com/LycanAlan
lycanalan205@gmail.com

**Repo:** github.com/LycanAlan/Dispute-Autopilot

**Footer:** 112 tests. Every figure on this page is checked against its artifact
by a script in the repo.
