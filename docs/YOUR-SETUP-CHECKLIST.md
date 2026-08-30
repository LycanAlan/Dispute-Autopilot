# Your Setup Checklist

Five things only you can do. Each has a verification command — run it, and if you get the
expected output, that item is done.

Total time: about 15 minutes. **Item 1 gates roughly half the project. Item 2 could make
the whole thing moot.**

Open Git Bash in `C:\Users\lycan\OneDrive\Desktop\projs\RazorPay_AI` for the verification
commands.

---

## 1. Kaggle dataset access — DO THIS FIRST

Without this there is no dataset, so no model, no precision/recall, no charts, no demo,
and nothing to put in the README. It blocks Phases 1, 3, 8 and 9 — over half the plan.

**Step 1a — accept the competition rules.** This is the step everyone misses, and skipping
it makes the download fail with a `403` whose error message never mentions the cause.

1. Sign in at <https://www.kaggle.com>
2. Go to <https://www.kaggle.com/c/ieee-fraud-detection/rules>
3. Click **"I Understand and Accept"**

You must be able to see the **Data** tab on that competition without a prompt to join.

**Step 1b — get your API token.**

1. Go to <https://www.kaggle.com/settings>
2. Scroll to **API** → click **Create New API Token**
3. A `kaggle.json` file downloads
4. Move it to exactly: `C:\Users\lycan\.kaggle\kaggle.json`

Create the `.kaggle` folder if it does not exist:

```bash
mkdir -p ~/.kaggle
# then move the downloaded file into it
```

**Verify:**

```bash
ls ~/.kaggle/kaggle.json && .venv/Scripts/python.exe -c "import kaggle; print('kaggle auth ok')"
```

Expected: the path prints, then `kaggle auth ok`.

If you see `401` or `403`, the token is wrong. If the import works but a later download
403s, you skipped Step 1a.

---

## 2. Buildathon application form

No deadline is published anywhere on the site. If it closes, everything else is wasted.

<https://forms.gle/d9r2gvxp8cmoZhon9>

Two minutes. Please do it tonight rather than on the 4th.

**Verify:** you received a confirmation, or your response is recorded.

---

## 3. Anthropic API key

Needed for Phase 6 (the evidence assembler) and the generation-quality metrics. Actual
usage will be a few cents; put ~$5 of credit on it so nothing stalls.

1. <https://console.anthropic.com> → **API Keys** → create one
2. Add it to `.env` in the project root (create the file if needed):

```
ANTHROPIC_API_KEY=sk-ant-...
```

**Verify:**

```bash
grep -c ANTHROPIC_API_KEY .env
```

Expected: `1`

---

## 4. Razorpay test-mode keys

Not a hard blocker — the dry-run adapter ships either way — but it decides Gate G2 and
makes the Razorpay integration real rather than simulated.

1. Sign up / sign in at <https://dashboard.razorpay.com>
2. **Switch the dashboard to Test Mode** (toggle, usually top-right)
3. **Settings → API Keys → Generate Test Key**
4. Add both to `.env`:

```
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
```

**While you are in there:** look for the **chargeback / dispute fee** on their pricing or
fees page. I could not find it published anywhere — their public pricing lists only
transaction and refund fees. If you find a real number, tell me the figure **and the URL**.
We are currently using ₹750 with the reasoning documented; a sourced number would be
better.

**Verify:**

```bash
grep -c RAZORPAY_KEY .env
```

Expected: `2`

---

## 5. LICENSE copyright holder

The `LICENSE` currently says `Copyright (c) 2026 Dispute Autopilot Contributors`. For a
repo whose entire purpose is showing a hiring panel your work, that should be your name.

I deliberately did not guess — your git config says `LycanAlan`, but a license is the one
file where a handle may not be what you want.

**Tell me what it should read** and I will change it. No command to run.

---

## Do it all at once

```bash
ls ~/.kaggle/kaggle.json 2>/dev/null && echo "1. kaggle token OK" || echo "1. KAGGLE TOKEN MISSING"
grep -q ANTHROPIC_API_KEY .env 2>/dev/null && echo "3. anthropic OK" || echo "3. ANTHROPIC KEY MISSING"
grep -q RAZORPAY_KEY_ID .env 2>/dev/null && echo "4. razorpay OK" || echo "4. RAZORPAY KEYS MISSING"
```

Items 2 and 5 have no command — the form submission and the licence name are on you to
confirm.

---

## What happens at 06:00 IST

A scheduled session picks up automatically and checks for `kaggle.json` first.

**If it is there:** it downloads IEEE-CIS (~1.2 GB), runs the G1 label-censoring
diagnostic, builds the temporal split, trains the first model, and gets you a real PR-AUC
number. That is the moment the project stops being scaffolding and starts being a
submission.

**If it is not:** it continues the offline spine — the decision engine, case-file
synthesis, the vault, the Razorpay schema, the groundedness verifier — and stops when
that runs out. Useful work, but it produces no numbers, no charts, and nothing you can
demo.

The difference between those two mornings is about ten minutes of clicking tonight.
