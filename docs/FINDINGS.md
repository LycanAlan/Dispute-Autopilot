# What measurement caught

Every defect in this list was found by running something, not by reading it.
None of them failed a test at the time they existed. Several were introduced by
a fix for an earlier one.

This file exists because the submission claims that measuring beats asserting,
and the honest way to support that claim is to show what measuring actually
caught in this codebase — including the cases where the author was the one who
got it wrong.

---

## The defects, and what each would have cost

### 1. Categorical code skew between training and serving

`build_features` inferred pandas category sets per call. LightGBM splits on
`.cat.codes`, not on values, so the same email domain received a different
integer at training time than at serving time.

**Cost if shipped:** every batch metric in this README correct, every live score
in the demo computed against different integers than the model was trained on.
Silent. No error, no failing test.

**Why nothing caught it:** the parity test compared `.iloc[i]` scalar *values*,
which agree. It was structurally blind to the codes.

**Fix:** `train_model` returns `(booster, categories)` as a pair, so omitting
the categories is a `TypeError` at the call site rather than a wrong number in
a report. A guard-the-guard test asserts that naive per-call inference *does*
diverge, so the parity tests cannot go vacuous again.

### 2. `TransactionAmt` is US dollars, and the economics read it as rupees

IEEE-CIS amounts are USD — the competition host states this. Median $68.77,
mean $135.03.

**Cost if shipped:** a ₹750 contest fee exceeding the disputed amount for 98% of
transactions, and a published "hand-written rules baseline" that fired on
**2 rows out of 590,540**. The submission would have compared its model against
a baseline that did nothing.

**How it surfaced:** the rules baseline reported 0 true positives and 0 false
positives. A baseline that never fires is a visible absurdity; the units error
behind it was not.

**Fix:** one documented constant, `usd_to_inr: 83.0`, applied once at the
boundary, so a reader who disputes the rate can divide it back out.

### 3. Metric families A and B were blended

Family A's precision and recall were computed at family B's EV-optimal
threshold.

**Cost if shipped:** with correct rupee amounts, evidence costs ₹75 against
~₹11,000 of average exposure, so expected value says vault almost everything,
the threshold collapses to the sweep floor, and **precision reads 3.7%**. A
fraud model reporting 3.7% precision to a payments panel, with the real
explanation buried in a threshold choice.

**Fix:** family A reports at an F1-maximising threshold chosen on model quality
alone; family B reports the EV-optimal policy separately, and declares that its
optimum sits on the sweep boundary rather than passing a search artifact off as
an interior solution.

### 4. The groundedness verifier ran, and nothing consumed its verdict

`triage` called `verify()`, attached the result to the decision, and returned
CONTEST regardless of whether any claim was grounded.

**Cost if shipped:** a fabricated tracking number correctly marked
`grounded=False` and then transmitted anyway. The refusal gate — the property
that makes this system defence-only — did not exist.

**Why nothing caught it:** `verify()` had five passing tests. All of them tested
the function in isolation. None tested that verification *changes what happens*.

### 5. Absent AVS data was filed as an assertion of mismatch

`M1`/`M2`/`M6` are missing in 57%/57%/23% of rows; 22% of transactions have all
three absent. The rule `sum(f == "T") >= 2` collapsed missing into "mismatch",
so the case file asserted a **failed billing check for data that was never
recorded** — fabricating adverse evidence, the mirror image of the fabrication
the verifier exists to prevent.

**Cost if shipped:** worse than bad prose. `billing_proof` is *required* for
`fraud_card_absent`, so those cases satisfied the completeness gate and the
system would have contested on billing evidence it did not hold — contradicting
the one claim the design rests on.

**How it surfaced:** the assembler returned empty bundles for 7 of 10 cases. Two
runs and a prompt rewrite were spent blaming the model before reading what was
actually being sent to it. The model was correctly declining to argue a case the
evidence did not support. **The model was right and the vault was wrong.**

### 6. A declined assembly counted as a contest

On adverse evidence the model returns a completely empty bundle. The gate's
condition was `bundle.fields and not bundle.claims`, which cannot fire when
`fields` is empty too.

**Cost if shipped:** the model refusing to build a case became a CONTEST
decision carrying nothing. Razorpay schema validation would have rejected the
payload downstream, but the decision was already wrong and the demo would have
shown a validation error where it should show a clean REVIEW.

### 7. A metric that was true by construction

Family C reported `refusal_rate` as a measured result. The harness alternated
ACTIVE/PASSIVE posture, so that rate was ~0.5 **regardless of model behaviour**.
It described the test harness, not the assembler.

### 8. A groundedness score that was perfect by vacuity

`EvidenceBundle.groundedness` returns `1.0` for an empty claim list. The first
family C run reported `groundedness_mean: 1.0` — and recorded no claim counts,
so a model attributing nothing was indistinguishable from one attributing
everything correctly. A re-run with counts recorded showed **7 of 10 bundles had
zero claims**. The perfect score was the model saying almost nothing.

### 9. Three prompt rewrites spent on a schema defect

`fields` was typed `dict[str, str]` — an object with no declared properties,
which structured output can satisfy with `{}`. The model returned an empty dict
on every single call while filling `claims`, a list of a typed model, perfectly
every time.

**The asymmetry was visible in the first result and was read as the model
ignoring instructions.** Two prompt revisions made the output worse, and one of
them leaked engineering commentary about the model's own past failures into the
live prompt. Typing `fields` as `list[_AssembledField]` fixed it immediately.

### 10. Smaller ones, same shape

- `import kaggle` authenticated at module scope, so a missing credentials file
  broke the module rather than the download.
- `python-dotenv` was a declared dependency that nothing ever called. A valid
  API key sat in `.env` while `os.getenv` returned `None`, so the assembler
  silently used its template fallback — and would have reported a perfect
  groundedness score for a model that never ran.
- `eval/reports/*.png` was gitignored, so the plan's own "commit the chart" step
  silently no-opped.
- `0.70 + 0.10 == 0.7999999999999999`, so the calibration split boundary
  truncated one row short.
- Missing device and email data rendered into evidence as the literal string
  `"nan"`, which the assembler then quoted back as fact.
- A test fixture built its columns with `rng.choice`, producing plain strings
  where production produces pandas categoricals — so an entire class of dtype
  bug was invisible to the suite. The fixture now runs through the same
  `downcast()` that real loading uses.

---

## The pattern

Nine of these are the same shape: **something was produced, verified, or
configured, and nothing downstream consumed it.**

Ignored category sets. An ignored `git add` path. An unconsumed
`save_categories`. An ignored verification verdict. A `.env` nobody loaded. A
declared field list that nothing filtered on. A dry-run payload rendered
nowhere. A refusal signal discarded. A fixture that could not produce the
failing case.

In every instance the test suite was green, because each component worked. What
was missing was any test that the components were *wired to each other*.

## What this cost, and what it bought

The evaluation harness itself contained three defects — items 3, 7 and 8 above.
A measurement apparatus is code, and it gets audited like code or it lies
confidently.

Total API spend for all generation-quality measurement: **under $0.40**. The two
most expensive defects on this list — the units error and the missing refusal
gate — cost nothing to find, because both were found by reading output that had
already been produced.
