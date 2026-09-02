# Gate G2 — Razorpay live contest path

## What this gate decides

Whether the submission may claim it submits contest evidence to Razorpay, or
only that it constructs and validates the payload Razorpay documents.

## Method

Read-only check against Razorpay's API using test-mode credentials
(`rzp_test_...`) from the gitignored `.env`. No write call was made — no
`contest`, no `accept`. A dispute is a real financial object and this project
is defence-only; exercising a write path against a live account to satisfy a
gate would be the wrong trade.

```python
client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))
client.dispute.all()          # read only
```

## Result

| | |
|---|---|
| Credentials authenticate | **Yes** |
| Mode | Test (`rzp_test_` prefix confirmed) |
| Disputes available | **None** — the collection is empty |
| Live `PATCH /v1/disputes/:id/contest` exercised | **No** |

The API accepted the credentials and returned an empty dispute collection.
There is nothing to contest, because a dispute is created when an issuing bank
raises a chargeback against a real settled payment — not something a merchant
can conjure in a test account on demand.

## Verdict: DRY RUN

The live path is **implemented but unexercised**. `LiveClient` exists and is
covered by the same schema validation as the dry-run adapter, but no run of
this project has transmitted a contest payload to Razorpay, and the submission
must not imply otherwise.

What is genuinely demonstrated:

- the evidence bundle is validated against Razorpay's documented evidence field
  names before it is allowed anywhere near the wire
- `DryRunClient.contest()` constructs the exact request — endpoint
  `PATCH /v1/disputes/:id/contest` and an `{"action": "submit", "evidence": {...}}`
  body — and returns it with `transmitted: False`
- the demo renders that payload on screen, labelled as a dry run

What is not:

- that Razorpay accepts the payload. The schema is built from Razorpay's public
  documentation; agreement with the documentation is not the same as an
  acceptance from their servers, and only a real chargeback on a real payment
  would settle that.

## Consequence

`get_client(live=False)` is the default everywhere, including the demo. The
README and video must say "constructs and validates a Razorpay contest payload"
and must not say "submits to Razorpay".

This is the conservative reading and it costs the submission a stronger-sounding
claim. That is the correct direction to be wrong in: a panel of payments
engineers can check this one in about thirty seconds, and an overclaim here
would discredit every other number in the repository.
