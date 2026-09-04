# Video script, 5 minutes

Razorpay AI Buildathon, Track 02 (AI Risk Manager). Ali Ansari / LycanAlan.

**This script is filmed entirely off the website.** No Streamlit, no terminal,
no IDE. One browser window, one scroll, twelve sections. The only thing running
behind it is the API, and only section 10 needs that.

---

## Read this first

The previous version of this script was written against the Streamlit demo and
built its centrepiece on **row 780 producing an ACCEPT decision**. That case
does not exist. `cases.accept` in the snapshot is `null`, and the snapshot says
why in `notes.accept_case`:

> ACCEPT needs ACTIVE posture, which takes a large expected exposure, together
> with an expected value below the negative margin, which takes a small amount.
> The rows satisfying both are ProductCD C and S, and those products never
> record the M1/M2/M6 address-match flags. With no flags `synthesize_casefile`
> files no `billing_proof`, `billing_proof` is required for
> `fraud_card_absent`, and the evidence gate returns REVIEW before expected
> value is consulted.

Filming that beat would have meant narrating a demo case that does not exist.

The beat itself was a good one, though, and it survives: **section 7's slider
reaches ACCEPT live.** Drag the amount to ₹250 and the expected value goes
negative and the badge reads ACCEPT, for exactly the reason the old script
wanted to make, that a small amount does not cover the cost of working the
case. The difference is that this one is computed on screen from the real cost
assumptions rather than read off a row that was never there.

---

## Before you record

```bash
# 1. Figures on the page must match the artifacts, and the copy rules must hold
python eval/check_site.py

# 2. Nothing may be cut off at whatever resolution you are recording at
python eval/check_layout.py

# 3. The API, for section 10 only
.venv/Scripts/python -m uvicorn dispute_autopilot.api.main:app --port 8000

# 4. The site
cd frontend && npm run dev
```

Record at **1920x1080**. Every section is verified to fit at 1920x1080,
1440x900 and 1366x768, but 1080p is what the layout was tuned for.

Hide bookmarks and use a clean browser profile. The masthead carries the
section name and number, so the recording is self-labelling.

### Filming switches

| Switch | What it does | When to use it |
| --- | --- | --- |
| `?still=1` | Freezes every section in its finished state | Stills, thumbnails, a retake of one panel |
| `?section=<id>` | Lands directly on a section | Re-shooting one beat without scrolling to it |
| `?flat=1` | Legacy switch, kept | Not needed now that no section uses WebGL |

Section ids in order: `hero`, `label`, `split`, `model`, `zoom`, `gate1`,
`gate2`, `refusal`, `measured`, `pipeline`, `live`, `colophon`.

**Read the numbers off the screen, not off this page.** Figures below are
correct as of the current export and are here so you can rehearse. If
`check_site.py` passes, the screen is right.

---

## The script

Timings are cumulative. Total 4:55, which leaves slack.

### 0:00 to 0:20 — Section 1, the title

**[Scroll slowly. Title, then the three figures.]**

> Chargebacks cost Indian merchants real money, and most of that loss is
> avoidable. Dispute Autopilot scores every transaction, keeps the evidence,
> and decides which disputes are worth fighting.
>
> Five hundred and ninety thousand real transactions. A hundred and eighteen
> thousand of them held back, never seen during training.

### 0:20 to 0:45 — Section 2, what the label means

**[Let the proportion bar draw, then the magnified bar with the hatched band.]**

> Here is the first honest thing. The dataset's fraud label does not mean
> fraud. It means a chargeback was reported within a hundred and twenty days.
>
> Three point four percent of transactions. And inside that sliver are two
> completely different things: a stolen card, and a customer who changed their
> mind. The data never says which. That hatched band is not a design choice.
> It is the honest answer.
>
> So this predicts chargebacks. Calling it a fraud detector would be the first
> lie, and every number after it would inherit that.

### 0:45 to 1:05 — Section 3, the split

**[Let both axes draw and the connectors lean.]**

> Card entities repeat across rows. Shuffle them and the same card lands in
> training and in test, and the model recognises the answer instead of
> predicting it. So the split is temporal. Train on the past, score the future.
>
> Seventy percent of the rows is not the first seventy percent of the clock.
> That is what these two axes show, and why the connectors lean.

### 1:05 to 1:40 — Section 4, calibration

**[Both curves draw. Hover along the PR curve so the readout tracks.]**

> The next stage multiplies this score by a rupee amount, so it has to be a
> probability, not a ranking. Isotonic calibration takes the Brier score from
> point zero seven eight to point zero two four. Three times better.
>
> And it makes PR-AUC slightly worse, from forty four percent to forty two.
> That is on the screen, in the panel, because hiding it would be the second
> lie. Isotonic regression is a step function, so it collapses scores into
> fewer levels and average precision pays for that in ties. The ranking is
> unchanged, and the arithmetic that follows only works on a probability.

### 1:40 to 2:00 — Section 5, one dispute

> Now one of them. Transaction two nine eight seven zero zero seven, thirty
> five thousand rupees, pulled back this morning under a card-absent fraud
> code. The money is already gone and there is about a week to respond.
>
> Contesting is not free and it is not automatic. Fight every dispute and you
> lose money. Fight none and you lose more. Three gates decide.

### 2:00 to 2:25 — Section 6, gate one

> Gate one. Theft, or regret?
>
> This runs backwards from what people expect. A low chargeback score raises
> the probability of winning, because first-party misuse, the customer who
> changed their mind, is the winnable kind. Genuine card theft is not.

### 2:25 to 3:00 — Section 7, gate two

**[Drag the amount slider all the way down, then back up. It passes through
all three decisions. Verified: ACCEPT at ₹250, REVIEW at ₹750, CONTEST at
₹1,500, with ops cost fixed at ₹250.]**

> Gate two. Winnable is not the same as worth it.
>
> Expected value: probability of winning, times the amount, minus what it costs
> to work the case. Watch what happens as I drag the amount down.
>
> **[Drag to the bottom. Badge reads ACCEPT, expected value goes negative.]**
>
> At two hundred and fifty rupees the expected value is negative. The system
> says accept the loss. Not because it would lose the dispute, the win
> probability has not moved, but because winning it costs more than it
> recovers.
>
> **[Drag back up through REVIEW to CONTEST.]**
>
> Same case, same win probability, and the decision walks from accept, through
> review, to contest. That is the whole argument for expected value over a
> fixed rule. A rule cannot do this.
>
> Note the contest fee is struck through. It is charged win or lose, so it
> cancels in the comparison and counting it would double-charge the decision.

### 3:00 to 3:45 — Section 8, gate three, the refusal

**[The centrepiece. Let all five claims resolve, then the struck one.]**

> Gate three, and this is the part I care most about.
>
> Ask a language model for a representment and it will produce one. Tracking
> number, delivery date, signature. Fluent and complete, whether or not any of
> it happened.
>
> So every sentence in the draft has to point at a key in the evidence file. A
> deterministic check walks each one. No model marks its own work.
>
> **[Pause on the struck claim.]**
>
> This claim points at nothing. There is no such tracking number in the vault.
> So the decision is downgraded: CONTEST becomes REVIEW, and a person sees the
> sentence that was rejected.
>
> The model drafts. It never decides.

### 3:45 to 4:15 — Section 9, what was measured

**[Hover a figure so its snapshot key path appears underneath.]**

> Three families of number, and they are never averaged together.
>
> A is measured on held-out data: precision fifty six percent, recall thirty
> nine.
>
> B is simulated under stated cost assumptions. Net loss falls from five point
> three seven crore to twenty seven lakh, and beats flagging everything by
> about five and a half lakh. Simulated, and labelled simulated.
>
> C is measured generation quality. Every attributed claim was grounded. The
> sample is small, so the honest ceiling is a thirty percent upper bound on the
> ungrounded rate, and that bound is on the screen too.
>
> Hover any figure and it prints the exact key in the artifact it came from.

### 4:15 to 4:40 — Section 10, the pipeline running

**[Press run. Let the rows stream.]**

> None of that is a recording. This calls the API, scores real rows, and shows
> the decisions as they land.
>
> The evidence gate runs before the model does, so a case with nothing to cite
> never reaches an API call at all. Across the whole generation evaluation,
> seven cases refused that way, and the entire run cost fifteen cents.

> **Accuracy note.** The "seven cases refused before any API call" figure is
> `family_c.cases_refused_before_any_api_call`, measured across the offline
> generation evaluation. It is **not** a count of what section 10 produces on
> screen. Say it as a fact about the system, as worded above, not as a
> narration of the rows streaming past.

### 4:40 to 4:55 — Sections 11 and 12, close

**[Scroll through the try-it section to the colophon.]**

> You can run one yourself.
>
> This system is defense-only. It scores disputes and drafts grounded
> responses. It cannot generate, alter, or synthesise evidence, and when the
> evidence it needs is not there, it refuses and asks for a human.
>
> The evidence documents are synthetic and the page says so. The chargeback
> labels are real. A hundred and twelve tests, and every figure on that page is
> checked against its artifact by a script in the repo.

---

## Pre-flight checklist

- [ ] `python eval/check_site.py` passes
- [ ] `python eval/check_layout.py` passes at your recording resolution
- [ ] API is up on 8000, `curl localhost:8000/health` returns 200
- [ ] Site is up, and the masthead does **not** show a `SAMPLE` stamp
      (if it does, `snapshot.json` is missing and every figure is a placeholder)
- [ ] Section 7's slider walks ACCEPT to REVIEW to CONTEST when dragged up
- [ ] Section 8's replay button works, for a second take without rescrolling
- [ ] Section 10's run button reaches the API and rows stream
- [ ] Browser zoom at 100%, bookmarks hidden, notifications off

## What not to claim on camera

- Do **not** say the system detects fraud. It predicts chargebacks.
- Do **not** quote a representment win rate. None can be inferred from this
  data and nothing in the project claims one.
- Do **not** present family B's rupee figures as measured. They are simulated
  under the assumptions in `config/costs.yaml`.
- Do **not** describe the evidence documents as real. They are synthetic, and
  the colophon says so on screen.
- Do **not** film an ACCEPT decision **as a demo case**. `cases.accept` is
  `null` and no row in the snapshot reaches ACCEPT through the full triage
  path. Section 7's slider showing ACCEPT is a live expected-value computation
  and is completely legitimate to film, which is where that beat now lives.
