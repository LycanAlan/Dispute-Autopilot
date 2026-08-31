# Gate G1 — Label Censoring Diagnostic

## Why this check exists

The IEEE-CIS `isFraud` label means "a chargeback was reported against this
transaction within a 120-day window", not "this transaction was fraudulent."
The dataset spans 183 days of `TransactionDT`. If Vesta assigned labels at a
fixed collection date rather than retrospectively per-transaction, any
transaction occurring within the last ~120 days of the window would not have
had the full 120 days to accrue a chargeback by the time the label was
frozen. That would right-censor the tail of the dataset: transactions there
would be systematically under-labelled, not because they were less fraudulent
but because they were seen for less time. Any precision computed on a test
split drawn from that tail would then be understated — a real methodological
risk for a project whose headline numbers are precision and recall on a
held-out temporal split.

This gate exists to check that assumption against the data before Task 1.3
builds a split on top of it, rather than discovering the problem after
metrics are already published.

## Method

`eval/gates/g1_censoring.py` loads the full merged frame (`load_raw()`),
buckets transactions by day (`TransactionDT // 86400`), and computes the
daily chargeback rate (`isFraud` mean), dropping any day with fewer than 100
transactions to avoid noise from sparse days. It then compares the mean rate
over the first 30 days of the window against the mean rate over the last 30
days. If retrospective labelling held, both should be measured on an equal
footing and the ratio should sit near 1. If the tail were censored, the tail
rate should be visibly depressed relative to the head, with the ratio well
below 1.

## Result

| Metric | Value |
|---|---|
| Head rate (first 30 days, day-level mean of daily means) | 0.026368 |
| Tail rate (last 30 days, day-level mean of daily means) | 0.035229 |
| Ratio (tail / head) | 1.336038 |
| Verdict | **CLEAN** |

The full run:

```
{'head_rate': 0.026368090553036228, 'tail_rate': 0.035228766182100996,
 'ratio': 1.336037818561135, 'verdict': 'CLEAN'}
```

See `eval/reports/g1_censoring.png` for the daily series with both means
overlaid. The tail of the series shows no downward taper toward the end of
the window — if anything, the last 30 days run slightly *above* the first
30 days and above the dataset-wide mean of 0.0350. There is no visual or
numeric evidence of the labels thinning out near the collection boundary.

## Verdict and consequence

**CLEAN** (ratio 1.336 ≥ the 0.7 threshold). The tail rate is higher than
the head rate, which is the opposite of what right-censoring would produce,
so the hypothesis that Vesta labelled at collection time rather than
retrospectively is not supported by this data. This is consistent with
Vesta having assigned `isFraud` retrospectively once each transaction's
120-day window had fully elapsed, rather than as a live label at a fixed
collection date.

Because the verdict is CLEAN, Task 1.3's temporal split uses the **full**
183-day range — `matured_max_day` is left unset. No data is discarded on
account of this check. Had the verdict come back CENSORED (ratio < 0.7),
the correct response would have been to accept a smaller, but honest,
dataset (`matured_max_day = 63`) rather than report a precision number
computed partly on unlabelled ground truth — but that trade was not needed
here.

The point of this gate is not the specific verdict; it is that the check
was run at all, before a single metric was computed on top of the split.
