/*
 * label.ts
 *
 * Section 2. What the label actually is.
 *
 * This was a small bordered box floating in a left-hand column with most of
 * the page empty beside it. The author: "one small box not oriented
 * correctly and lot of space left making it look empty and a wasted page
 * instead, remake this one."
 *
 * It is now centred, and it carries the one diagram this section has an
 * honest use for. The argument the copy makes is that isFraud marks a
 * chargeback, not a cause, so two very different things are inside the same
 * label and nothing in the data separates them. That argument is visual:
 *
 *   a full-width track, with the chargebacks as a clay sliver at real scale,
 *   then that sliver magnified into a second bar, cut by a hatched band that
 *   is explicitly of unknown position.
 *
 * The hatched band is the whole point, and it is why this diagram is honest
 * rather than decorative. IEEE-CIS does not say how the chargebacks divide
 * between a stolen card and a customer changing their mind, so the divider
 * is drawn as a band of unknown position rather than a line at some invented
 * split. Drawing it as a line anywhere, 50/50 included, would be inventing
 * the very number the section says does not exist.
 *
 * Every figure comes from the snapshot at runtime. The positive count is
 * derived rather than typed, and it agrees with family_b's confusion counts
 * (none.fn is every positive in the test set) at 4,064.
 *
 * ON PURITY. Everything here is a ramp over progress. update(1) draws the
 * finished diagram, so ?still=1 gets the whole thing in one call.
 */
import { ORDER, register } from '../core/registry';
import type { Section, Snapshot } from '../core/section';
import { fmtInt } from '../three/format';

import './label.css';

/** Ramp from 0 to 1 across [a, b], flat outside it. */
function span(p: number, a: number, b: number): number {
  if (b <= a) return p >= b ? 1 : 0;
  return Math.min(1, Math.max(0, (p - a) / (b - a)));
}

/** Slow start and slow stop, so a bar does not snap to its width. */
function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

interface Cue {
  el: HTMLElement;
  prop: string;
  from: number;
  to: number;
  eased: boolean;
}

class LabelSection implements Section {
  readonly id = 'label';

  private cues: Cue[] = [];

  mount(root: HTMLElement, data: Snapshot): void {
    root.classList.add('on-charcoal', 'section--runway', 'label-section');
    root.style.height = '240svh';

    const nTest = data.family_a.n_test;
    const rate = data.family_a.positive_rate;
    const positives = Math.round(nTest * rate);
    const negatives = nTest - positives;

    // The clay segment is drawn at true scale, which is about one part in
    // thirty. A floor keeps it from vanishing under a hairline at narrow
    // widths; MIN is well below the real value, so it never overstates.
    const MIN_VISIBLE = 1.2;
    const clayPct = Math.max(MIN_VISIBLE, rate * 100);

    root.innerHTML = `
      <div class="section__stage">
        <div class="section__inner label__inner">
          <div class="label__column">
            <div class="ruled-kicker label__cue" data-cue="head"><span class="kicker">The label</span></div>

            <h2 class="title label__head label__cue" data-cue="head">isFraud does not mean fraud</h2>

            <p class="lede label__lede label__cue" data-cue="lede">
              In IEEE-CIS it means a chargeback was reported within 120 days.
              Nothing in the data separates a stolen card from a customer who
              changed their mind.
            </p>

            <figure class="label__figure">
              <figcaption class="visually-hidden">
                Chargebacks as a share of the held-out transactions, then
                magnified to show that their cause is unlabelled.
              </figcaption>

              <!-- ---------------------------------------- the real scale -->
              <div class="label__scalerow label__cue" data-cue="track">
                <span class="micro label__scalelabel">All held out</span>
                <span class="micro label__scalevalue" data-fig="test"></span>
              </div>

              <div class="label__track" data-track>
                <span class="label__clay" data-clay></span>
              </div>

              <div class="label__keys label__cue" data-cue="keys">
                <span class="micro label__key label__key--clay">
                  <span class="label__swatch" aria-hidden="true"></span>
                  <span data-fig="pos"></span> chargebacks, <span data-fig="rate"></span>
                </span>
                <span class="micro label__key label__key--rest">
                  <span data-fig="neg"></span> with no chargeback
                </span>
              </div>

              <!-- ------------------------------------------- the magnifier -->
              <svg class="label__fan" viewBox="0 0 100 10" preserveAspectRatio="none"
                   aria-hidden="true" data-fan>
                <polygon class="label__fanshape" data-fanshape points="0,0 0,0 100,10 0,10" />
                <line class="label__fanedge" x1="0" y1="0" x2="0" y2="10" />
                <line class="label__fanedge" data-fanedge x1="0" y1="0" x2="100" y2="10" />
              </svg>

              <div class="label__zoomlabel micro label__cue" data-cue="zoom">
                Those <span data-fig="pos2"></span>, magnified
              </div>

              <!-- --------------------------------------- the unknown split -->
              <div class="label__split" data-splitbar>
                <span class="label__splitband" data-band></span>
              </div>

              <div class="label__splitkeys label__cue" data-cue="split">
                <span class="micro label__splitkey">Stolen card</span>
                <span class="micro label__splitkey label__splitkey--unknown">
                  the data does not say where this falls
                </span>
                <span class="micro label__splitkey">Changed their mind</span>
              </div>
            </figure>

            <p class="label__foot label__cue" data-cue="foot">
              So this predicts chargebacks. Calling it a fraud detector would be
              the first lie, and every downstream number would inherit it.
            </p>
          </div>
        </div>
      </div>
    `;

    const put = (key: string, text: string): void => {
      root.querySelectorAll<HTMLElement>('[data-fig="' + key + '"]').forEach((el) => {
        el.textContent = text;
      });
    };

    put('test', fmtInt(nTest));
    put('pos', fmtInt(positives));
    put('pos2', fmtInt(positives));
    put('neg', fmtInt(negatives));
    put('rate', (rate * 100).toFixed(2) + '%');

    const clay = root.querySelector<HTMLElement>('[data-clay]');
    if (clay) clay.style.setProperty('--width', clayPct.toFixed(3) + '%');

    // The fan's top edge spans exactly the clay segment, so the magnifier
    // visibly starts at the thing it magnifies rather than near it.
    const shape = root.querySelector<SVGPolygonElement>('[data-fanshape]');
    if (shape) {
      shape.setAttribute('points', '0,0 ' + clayPct.toFixed(3) + ',0 100,10 0,10');
    }
    const edge = root.querySelector<SVGLineElement>('[data-fanedge]');
    if (edge) edge.setAttribute('x1', clayPct.toFixed(3));

    const cue = (sel: string, prop: string, from: number, to: number, eased = false): void => {
      root.querySelectorAll<HTMLElement>(sel).forEach((el) => {
        this.cues.push({ el, prop, from, to, eased });
      });
    };

    cue('[data-cue="head"]', '--in', 0.02, 0.14);
    cue('[data-cue="lede"]', '--in', 0.08, 0.22);
    cue('[data-cue="track"]', '--in', 0.18, 0.30);
    cue('[data-track]', '--in', 0.20, 0.34);
    cue('[data-clay]', '--grow', 0.26, 0.44, true);
    cue('[data-cue="keys"]', '--in', 0.40, 0.52);
    cue('[data-fan]', '--in', 0.50, 0.64);
    cue('[data-cue="zoom"]', '--in', 0.56, 0.68);
    cue('[data-splitbar]', '--in', 0.62, 0.74);
    cue('[data-band]', '--in', 0.70, 0.82);
    cue('[data-cue="split"]', '--in', 0.74, 0.86);
    cue('[data-cue="foot"]', '--in', 0.82, 0.94);

    this.update(0);
  }

  update(progress: number): void {
    for (const c of this.cues) {
      const raw = span(progress, c.from, c.to);
      c.el.style.setProperty(c.prop, (c.eased ? ease(raw) : raw).toFixed(3));
    }
  }

  unmount(): void {
    this.cues = [];
  }
}

register({
  order: ORDER.label,
  id: 'label',
  create: () => new LabelSection(),
});
