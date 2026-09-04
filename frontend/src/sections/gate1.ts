/*
 * gate1.ts
 *
 * Section 6, id "gate1": "Theft, or regret?"
 *
 * The counter-intuitive core of the economics: decision.py's _lift() is
 * bounded and monotone DECREASING in p_chargeback. A transaction that looks
 * like the real cardholder (low model risk score) raises the win estimate,
 * because it points to first-party misuse rather than a stolen card. Stolen
 * cards are not winnable; friendly fraud is.
 *
 * This section plots that real function and drops the real case
 * (snapshot.cases.contest, row 7, p_chargeback approx 0.058) onto it, next to
 * the actual grounded evidence signals the case carries. Nothing here is
 * synthesised: the curve is _lift() reimplemented verbatim, and the numbers
 * are read from the snapshot.
 */

import { register, ORDER } from '../core/registry';
import type { Section, Snapshot } from '../core/section';
import type { DemoCase } from '../core/data';

import './gate1.css';

/**
 * Bounds decision.py's _lift() clips to. Not present in snapshot.json (only
 * per-case results are baked in, not the cost config), so this is a literal
 * read here rather than a hardcoded metric on the page: verified 2026-09-04
 * against config/costs.yaml, key `lift_clip: [0.5, 2.5]`.
 */
const LIFT_CLIP: readonly [number, number] = [0.5, 2.5];

/** decision.py's _lift(), reimplemented exactly. Bounded, monotone decreasing. */
function lift(p: number, clip: readonly [number, number]): number {
  const [lo, hi] = clip;
  return Math.max(lo, Math.min(hi, lo + (hi - lo) * (1.0 - p)));
}

/**
 * scripts/export_site_data.py bakes more fields onto each demo case than
 * core/data.ts types (amount_inr, raw features among them). Extending the
 * type locally rather than editing core/data.ts, which is owned by the shell
 * agent, not this one.
 */
interface CaseExtra {
  amount_inr: number;
  features: { P_emaildomain?: string | null; [key: string]: unknown };
}
type FullCase = DemoCase & CaseExtra;

/**
 * Evidence text baked from the synthesizer can carry an em dash. House style
 * bans them from anything user visible, so this is the one seam where data
 * crosses into markup: sanitised on the way in, not trusted as already clean.
 */
function deDash(text: string): string {
  return text.replace(/\s*[–—]\s*/g, ', ');
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

class Gate1 implements Section {
  readonly id = 'gate1';

  private lineEl: SVGPathElement | null = null;
  private lineLen = 0;
  private markerGroupEl: SVGGElement | null = null;
  private figureEl: HTMLElement | null = null;
  private signalsEl: HTMLElement | null = null;

  mount(root: HTMLElement, data: Snapshot): void {
    const c = data.cases.contest as FullCase;
    const p = c.decision.p_chargeback;
    const [lo, hi] = LIFT_CLIP;
    const liftVal = lift(p, LIFT_CLIP);

    root.classList.add('section--runway');
    root.classList.add('on-charcoal');
    root.style.height = '220svh';

    // Chart geometry, computed once from the real bounds and the real case.
    // The line is straight by construction: lo + (hi - lo) * (1 - p) hits
    // exactly hi at p=0 and exactly lo at p=1, so the clip in _lift() is a
    // safety rail that this case never needs, not decoration on the plot.
    const W = 340;
    const H = 210;
    const padL = 34;
    const padR = 18;
    const padT = 22;
    const padB = 30;
    const xOf = (pp: number): number => padL + pp * (W - padL - padR);
    const yOf = (l: number): number => padT + (1 - (l - lo) / (hi - lo)) * (H - padT - padB);
    const x0 = xOf(0);
    const y0 = yOf(hi);
    const x1 = xOf(1);
    const y1 = yOf(lo);
    const mx = xOf(p);
    const my = yOf(liftVal);
    const baseY = yOf(lo);

    const items = c.casefile.items;
    const device = items['access_activity_log'];
    const address = items['billing_proof'];
    const emailDomain = c.features?.['P_emaildomain'];

    root.innerHTML = `
      <div class="section__stage">
        <div class="section__inner gate1">
          <div class="gate1__text">
            <div class="ruled-kicker"><span class="kicker">Gate one</span></div>
            <h2 class="title">Theft, or regret?</h2>
            <div class="prose">
              <p>Two disputes arrive wearing the same reason code.</p>
              <p>One is a stolen card. You will not win that, and the customer is telling the truth. The other is a customer who forgot, or whose kid ordered it, or who wants it free. That one you can win.</p>
              <p>The tell is whether the transaction looks like the cardholder. Same device, same city, same email domain, ordinary amount.</p>
            </div>
            <blockquote class="gate1__quote">So a low fraud score raises the odds of winning. This part runs backwards on purpose.</blockquote>
          </div>

          <div class="gate1__panel">
            <span class="kicker">Dispute ${c.row}, the real case</span>

            <svg class="gate1__chart" viewBox="0 0 ${W} ${H}" role="img"
              aria-label="Lift against chargeback score. A straight line from ${hi.toFixed(1)} at p equals zero down to ${lo.toFixed(1)} at p equals one. This case sits at p equals ${p.toFixed(3)}, lift ${liftVal.toFixed(2)}.">
              <line class="gate1__axis" x1="${x0}" y1="${baseY}" x2="${x1}" y2="${baseY}" />
              <line class="gate1__axis" x1="${x0}" y1="${y0}" x2="${x0}" y2="${baseY}" />
              <path class="gate1__line" data-line d="M ${x0} ${y0} L ${x1} ${y1}" />
              <g class="gate1__marker-group" data-marker-group>
                <line class="gate1__guide" x1="${mx}" y1="${baseY}" x2="${mx}" y2="${my}" />
                <circle class="gate1__marker" cx="${mx}" cy="${my}" r="4.5" />
              </g>
              <text class="gate1__tick" x="${x0}" y="${y0 - 8}">${hi.toFixed(1)} clip</text>
              <text class="gate1__tick" x="${x0}" y="${baseY + 18}">${lo.toFixed(1)} clip</text>
              <text class="gate1__tick" x="${x0}" y="${baseY + 30}">p = 0</text>
              <text class="gate1__tick" x="${x1}" y="${baseY + 30}" text-anchor="end">p = 1</text>
            </svg>

            <div class="gate1__figure" data-figure>
              <span class="micro">Lift applied at this case's score, p(chargeback) ${(p * 100).toFixed(1)}%</span>
              <span class="figure-num">&times;${liftVal.toFixed(2)}</span>
            </div>

            <div class="gate1__signals" data-signals>
              <div class="readout">
                <span class="readout__label">Device, session</span>
                <span class="readout__value">${device ? deDash(device.value) : 'not recorded'}</span>
              </div>
              <div class="readout">
                <span class="readout__label">Email domain</span>
                <span class="readout__value">${emailDomain ?? 'unknown'}</span>
              </div>
              <div class="readout">
                <span class="readout__label">Address check</span>
                <span class="readout__value">${address ? deDash(address.value) : 'none on file'}</span>
              </div>
              <div class="readout">
                <span class="readout__label">Disputed amount</span>
                <span class="readout__value">${inr.format(c.amount_inr)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.lineEl = root.querySelector('[data-line]');
    if (this.lineEl) {
      this.lineLen = this.lineEl.getTotalLength();
      this.lineEl.style.setProperty('stroke-dasharray', String(this.lineLen));
    }
    this.markerGroupEl = root.querySelector('[data-marker-group]');
    this.figureEl = root.querySelector('[data-figure]');
    this.signalsEl = root.querySelector('[data-signals]');
  }

  // Pure with respect to progress: the same input always produces the same
  // reveal state. Nothing here reads the clock or accumulates.
  update(progress: number): void {
    const lineP = clamp01(progress / 0.5);
    const markerP = clamp01((progress - 0.3) / 0.25);
    const restP = clamp01((progress - 0.5) / 0.35);

    if (this.lineEl) {
      this.lineEl.style.setProperty('stroke-dashoffset', String(this.lineLen * (1 - lineP)));
    }
    if (this.markerGroupEl) {
      this.markerGroupEl.style.opacity = String(markerP);
    }
    if (this.figureEl) {
      this.figureEl.style.opacity = String(restP);
      this.figureEl.style.transform = `translateY(${(1 - restP) * 10}px)`;
    }
    if (this.signalsEl) {
      this.signalsEl.style.opacity = String(restP);
      this.signalsEl.style.transform = `translateY(${(1 - restP) * 10}px)`;
    }
  }

  unmount(): void {
    this.lineEl = null;
    this.markerGroupEl = null;
    this.figureEl = null;
    this.signalsEl = null;
  }
}

register({
  order: ORDER.gate1,
  id: 'gate1',
  create: () => new Gate1(),
});
