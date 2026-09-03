# Standalone frontend: design spec

**Date:** 2026-09-04
**Author:** Ali Ansari (LycanAlan)
**Status:** approved, in implementation
**Revert point:** git tag `v1-streamlit-submission`

## Why this exists

The Streamlit app was a means to an end. It proves the pipeline runs; it does not
sell it. The submission is judged largely through a five minute video, so the
site is the artifact a panel actually sees. It has to carry the whole argument
with no narration crutch.

The deadline is 5 September 2026 and this was specified on 4 September. Scope was
set to maximum ambition by the author after an explicit recommendation against
it. That is a legitimate call, so the mitigation is not to cut scope but to make
every ambitious layer independently disableable:

- `?flat=1` disables WebGL. Canvas and SVG fallbacks render every section.
- `?still=1` freezes all motion. Every section shows its final state.

The story must be complete and legible with both flags set. That is the floor.
Everything above it is upside.

## Architecture

```
src/dispute_autopilot/api/main.py   backend, plus three endpoints
scripts/export_site_data.py         NEW, bakes artifacts into static data
frontend/                           NEW, standalone Vite app
  data/snapshot.json                real metrics + demo decisions, committed
  data/points.bin                   Float32 point cloud, committed
  src/core/                         scroll engine, tokens, section registry
  src/three/                        WebGL scene
  src/sections/                     one module per scroll section
ui/app.py                           Streamlit, untouched
```

Vite, vanilla TypeScript, Three.js, Lenis, GSAP ScrollTrigger.

**No React.** The reconciler competes with scroll-linked animation and there is
no application state here worth the cost.

**No Tailwind.** Utility class soup is the loudest visual tell that a page was
generated rather than designed, and not looking generated is an explicit
requirement. Hand written CSS with custom properties.

Streamlit stays. It is referenced by `docs/gates/` and the README, and
`eval/check_docs.py` currently passes against those references.

## The three-dimensional scene, and why it is not decoration

Points are the real dataset on real axes:

| axis | meaning |
|---|---|
| x | `TransactionDT`, transaction time |
| y | `TransactionAmt`, log scale |
| z | predicted chargeback probability |
| colour | the `isFraud` label |

This pays for the third dimension twice. Looking down z raises a risk landscape
out of the plane. Sweeping along x lets the 70/10/20 temporal split slide across
as two planes. Both are real methodological decisions being explained by being
looked at, not ornament.

**Honesty constraint.** The buffer holds a stratified sample of 100,000 points
and the page says so, adjacent to the headline figure of 590,540. A site whose
argument is that measurement beats assertion cannot round its own numbers up.

## Sections

| # | id | content | motion |
|---|---|---|---|
| 1 | `hero` | title, subtitle, 590,540 | cloud materialises, slow camera drift |
| 2 | `label` | isFraud means a chargeback was reported within 120 days, not that a transaction was fraudulent | colour remaps to the label |
| 3 | `split` | why the split is temporal and not random | two planes sweep along x |
| 4 | `model` | LightGBM, isotonic calibration, family A figures | camera tilts to z, landscape rises, PR and calibration curves draw |
| 5 | `zoom` | from 590,540 to one | cloud collapses to a single point, dispute 7 |
| 6 | `gate1` | theft or regret, the backwards lift | annotated single case |
| 7 | `gate2` | expected value, the fee that correctly cancels out | **interactive**, drag amount, decision flips |
| 8 | `refusal` | the payoff, see below | **interactive**, the strike |
| 9 | `measured` | three families, never blended, real figures | counters and small multiples |
| 10 | `live` | call the running API | **interactive**, LIVE badge on `/health` |
| 11 | `colophon` | defense-only notice, limitations, author | static |

### Section 8 is the point of the whole page

Everything upstream exists to set it up.

The representment assembles claim by claim. The verifier walks each claim and
draws a connector to the case-file source key backing it. One claim finds
nothing. It strikes through, its connector snaps, and the decision stamp rolls
from CONTEST to REVIEW. A caption states that this is the fault injection case
and is reproducible from the repo.

It must be replayable from a button, because a video take will need more than
one attempt.

## Copy rules

- No em dashes anywhere.
- Short declarative lines. No paragraph longer than three lines.
- No "seamless", "leverage", "robust", "cutting-edge", "delve", "empower".
- Every number traceable to `snapshot.json`, which comes from real artifacts.
- Hero subtitle: "Three-stage chargeback loss prevention for Razorpay merchants.
  Predict the risk, preserve the evidence, decide on expected value."
- The defense-only notice is its own block in `colophon`, not a subtitle.

## Palette

Alternating light narrative and dark data, giving the video visual rhythm.

```
--paper       #F4F1EA   warm off-white, narrative ground
--ink         #17150F   near black, body text
--charcoal    #14161A   data ground
--bone        #E8E4DA   text on charcoal
--contest     #1F6F4A   deep green
--review      #B5822B   amber
--accept      #A54334   clay red
--rule        rgba ink 12%
```

No purple, no indigo, no gradient buttons. Serif display face for headlines,
system sans for body, monospace for all numerals.

## Data contract

`scripts/export_site_data.py` writes both files and is committed, so the site
builds without the dataset present.

`frontend/data/points.bin` is a flat `Float32Array`, four values per point,
`[x, y, z, label]`, 100,000 points, roughly 1.6 MB.

`frontend/data/snapshot.json`:

```jsonc
{
  "generated_at": "ISO 8601",
  "n_total": 590540,
  "n_sampled": 100000,
  "split": { "train_end_x": 0.70, "calib_end_x": 0.80 },
  "family_a": { /* verbatim from eval/reports/metrics.json */ },
  "family_b": { /* verbatim */ },
  "family_c": { /* verbatim from generation_metrics.json */ },
  "curves": { "pr": [[r, p]], "calibration": [[pred, obs]] },
  "cases": {
    "contest": { "row": 7,   "decision": {}, "casefile": {}, "bundle": {} },
    "accept":  { "row": 780, "decision": {}, "casefile": {} },
    "review":  { "row": 0,   "decision": {}, "casefile": {} }
  },
  "refusal": {
    "casefile": {},
    "claims": [ { "text": "", "source_field": "", "grounded": true } ],
    "before": "CONTEST",
    "after": "REVIEW"
  }
}
```

The refusal payload is produced by the existing fault injection path, not
hand written.

## Section module contract

Every section is a class implementing this interface. Parallel agents depend on
it, so it does not change without updating this spec.

```ts
export interface Section {
  id: string;
  mount(root: HTMLElement, data: Snapshot): void | Promise<void>;
  update(progress: number): void;   // 0..1 within the section
  unmount(): void;
  readonly needsScene?: boolean;    // true if it drives the Three.js camera
}
```

`update` must be pure with respect to `progress`. Given the same progress it
produces the same visual state, which is what makes `?still=1` work and what
makes a scrub-back during filming look correct.

## Backend endpoints

Added to `src/dispute_autopilot/api/main.py`:

- `GET /health` exists already. CORS must allow the site origin.
- `GET /demo/cases` returns the three pre-selected demo rows with features, so
  the live panel can submit one without the browser holding the dataset.
- `GET /metrics` returns the contents of both report JSONs.

Live is a bonus layer. Section 10 probes `/health` once on mount with a short
timeout and falls back to `snapshot.json` silently on any failure. No spinner
is ever the terminal state of anything on this page.

## Build and deploy

GitHub Pages from `frontend/dist`, Vite `base: '/Dispute-Autopilot/'`.
Committed data means the deployed site needs no Python at all.

## Work breakdown

Wave one, parallel, no shared files:

- **A** `scripts/export_site_data.py` and the API endpoints
- **B** the shell: Vite scaffold, tokens, typography, scroll engine, section
  registry, both kill switches

Wave two, parallel, four agents, after A and B land:

- **C** `src/three/` scene and sections 1 to 5
- **D** sections 6 and 7
- **E** section 8, the refusal theatre, retained by the lead
- **F** sections 9 to 11

Wave three:

- copy pass across every string, applying the copy rules above
- browser verification on the running site, including both kill switches

File ownership is exclusive per agent within a wave. No two agents write the
same file.

## Out of scope

Mobile layout. Internationalisation. Analytics. Any change to model, economics,
assembler, verifier, or evaluation code. Any new claim not already measured.

## Risks

| risk | mitigation |
|---|---|
| WebGL fails on the recording machine | `?flat=1`, canvas fallback, tested before filming |
| Scroll animation stutters while screen recording | `?still=1` plus section anchors, so takes can be filmed per section |
| Point buffer slow to load on camera | 1.6 MB committed local file, no network, decoded off the main thread |
| Live API not running during the take | snapshot fallback is the default path, LIVE badge is additive |
| Running out of time | waves land in order of narrative importance, so a partial build still tells a complete story from section 1 to wherever it stopped |
