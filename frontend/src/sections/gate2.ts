/*
 * gate2.ts
 *
 * Section 7, id "gate2": "Winnable is not the same as worth it"
 *
 * The most important interaction on the page after the refusal (section 8).
 * A draggable amount recomputes, live, in the browser, exactly what
 * decision.py's decide() computes for the real case in
 * snapshot.cases.contest (row 7):
 *
 *   p_win    = min(1, base_win_rate_fraud_coded * lift(p_chargeback) * w)
 *   delta_ev = p_win * amount_inr - ops_cost_inr
 *   action   = REVIEW if missing_required, else CONTEST if delta_ev > margin,
 *              else ACCEPT if delta_ev < -margin, else REVIEW
 *
 * p_chargeback, w and missing_required are held fixed at this case's real
 * values; only amount_inr is the free variable, dragged by the visitor. That
 * is a deliberate simplification: it isolates the one thing this section is
 * about, whether a winnable dispute is worth chasing, from the question
 * gate1 already answered, whether it is winnable at all.
 *
 * The contest fee is read from the snapshot and shown struck through: it is
 * charged win or lose, so it is identical under both branches and cancels
 * out of delta_ev. decision.py leaves it out on purpose; this panel shows why.
 */

import { register, ORDER } from '../core/registry';
import type { Section, Snapshot } from '../core/section';
import type { Action, DemoCase } from '../core/data';

import './gate2.css';

/**
 * Not present in snapshot.json: only per-case results are baked in, not the
 * cost config itself. Verified 2026-09-04 against config/costs.yaml:
 *   lift_clip: [0.5, 2.5]
 *   decision_margin_inr: 100.0
 * base_win_rate_fraud_coded, ops_cost_inr and contest_fee_inr ARE present, in
 * snapshot.family_b.assumptions, and are read from there below rather than
 * repeated here.
 */
const LIFT_CLIP: readonly [number, number] = [0.5, 2.5];
const DECISION_MARGIN_INR = 100.0;

/** decision.py's _lift(), reimplemented exactly. Bounded, monotone decreasing. */
function lift(p: number, clip: readonly [number, number]): number {
  const [lo, hi] = clip;
  return Math.max(lo, Math.min(hi, lo + (hi - lo) * (1.0 - p)));
}

/**
 * scripts/export_site_data.py bakes an amount_inr onto each demo case that
 * core/data.ts's DemoCase type does not declare. Extending locally rather
 * than editing core/data.ts, which another agent owns.
 */
interface CaseExtra {
  amount_inr: number;
}
type FullCase = DemoCase & CaseExtra;

interface Econ {
  pChargeback: number;
  w: number;
  missingRequired: readonly string[];
  baseWinRate: number;
  liftClip: readonly [number, number];
  opsCost: number;
  margin: number;
}

interface Outcome {
  pWin: number;
  deltaEv: number;
  action: Action;
}

/** decide()'s economics arm, reimplemented exactly, including the evidence
 * gate taking priority over the expected-value comparison. */
function evaluate(amountInr: number, econ: Econ): Outcome {
  const pWin = Math.min(1.0, econ.baseWinRate * lift(econ.pChargeback, econ.liftClip) * econ.w);
  const deltaEv = pWin * amountInr - econ.opsCost;

  let action: Action;
  if (econ.missingRequired.length > 0) {
    action = 'REVIEW';
  } else if (deltaEv > econ.margin) {
    action = 'CONTEST';
  } else if (deltaEv < -econ.margin) {
    action = 'ACCEPT';
  } else {
    action = 'REVIEW';
  }
  return { pWin, deltaEv, action };
}

const ACTION_BADGE_CLASS: Record<Action, string> = {
  CONTEST: 'gate2__badge--contest',
  REVIEW: 'gate2__badge--review',
  ACCEPT: 'gate2__badge--accept',
};

const ACTION_TEXT_CLASS: Record<Action, string> = {
  CONTEST: 'is-contest',
  REVIEW: 'is-review',
  ACCEPT: 'is-accept',
};

const ALL_BADGE_CLASSES = Object.values(ACTION_BADGE_CLASS);
const ALL_TEXT_CLASSES = Object.values(ACTION_TEXT_CLASS);

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

class Gate2 implements Section {
  readonly id = 'gate2';

  private econ: Econ | null = null;
  private panelEl: HTMLElement | null = null;
  private sliderEl: HTMLInputElement | null = null;
  private badgeEl: HTMLElement | null = null;
  private captionEl: HTMLElement | null = null;
  private amountEl: HTMLElement | null = null;
  private pWinEl: HTMLElement | null = null;
  private recoveryEl: HTMLElement | null = null;
  private deltaEl: HTMLElement | null = null;

  mount(root: HTMLElement, data: Snapshot): void {
    const c = data.cases.contest as FullCase;
    const assumptions = data.family_b.assumptions;
    // Present in the snapshot: read, not retyped.
    const baseWinRate = assumptions['base_win_rate_fraud_coded'] ?? 0.171;
    const opsCost = assumptions['ops_cost_inr'] ?? 250.0;
    const contestFee = assumptions['contest_fee_inr'] ?? 750.0;

    const econ: Econ = {
      pChargeback: c.decision.p_chargeback,
      w: c.decision.w_completeness,
      missingRequired: c.decision.missing_required,
      baseWinRate,
      liftClip: LIFT_CLIP,
      opsCost,
      margin: DECISION_MARGIN_INR,
    };
    this.econ = econ;

    // p_win does not depend on amount, so delta_ev is linear in amount and
    // both flip points solve directly: p_win * amount - opsCost = +/- margin.
    const pWinFixed = Math.min(1.0, econ.baseWinRate * lift(econ.pChargeback, econ.liftClip) * econ.w);
    const acceptThreshold = (econ.opsCost - econ.margin) / pWinFixed;
    const contestThreshold = (econ.opsCost + econ.margin) / pWinFixed;
    const defaultAmount = Math.round((acceptThreshold + contestThreshold) / 2);
    // A round slider ceiling with headroom above the real flip point, derived
    // from the computed threshold rather than typed as a bare figure.
    const sliderMax = Math.max(1000, Math.ceil((contestThreshold * 5) / 1000) * 1000);

    root.classList.add('section--runway');
    root.style.height = '210svh';

    root.innerHTML = `
      <div class="section__stage">
        <div class="section__inner gate2">
          <div class="gate2__text">
            <div class="ruled-kicker"><span class="kicker">Gate two</span></div>
            <h2 class="title">Winnable is not the same as worth it</h2>
            <div class="prose">
              <p>Expected recovery, minus what it costs to chase.</p>
              <p>The contest fee is charged win or lose, so it is identical either way and cancels out of the comparison. It is deliberately absent from the formula. Only staff time is a real marginal cost.</p>
            </div>
            <blockquote class="gate2__quote">The system accepts disputes it would probably win. On a small enough transaction, winning costs you money.</blockquote>
          </div>

          <div class="gate2__panel" data-panel>
            <span class="kicker">Drag the amount</span>

            <div class="gate2__badge-row">
              <span class="gate2__badge" data-badge>REVIEW</span>
              <span class="small" data-caption></span>
            </div>

            <label class="visually-hidden" for="gate2-amount">Disputed amount, in rupees</label>
            <input
              id="gate2-amount"
              class="gate2__slider"
              type="range"
              data-slider
              min="0"
              max="${sliderMax}"
              step="1"
              value="${defaultAmount}"
            />
            <div class="gate2__scale micro">
              <span>${inr.format(0)}</span>
              <span>${inr.format(sliderMax)}</span>
            </div>

            <dl class="gate2__math">
              <div class="readout">
                <span class="readout__label">Amount, dragged</span>
                <span class="readout__value" data-amount></span>
              </div>
              <div class="readout">
                <span class="readout__label">Win probability, fixed for this case</span>
                <span class="readout__value" data-pwin></span>
              </div>
              <div class="readout">
                <span class="readout__label">Expected recovery, win probability &times; amount</span>
                <span class="readout__value" data-recovery></span>
              </div>
              <div class="readout">
                <span class="readout__label">Ops cost, staff time to contest</span>
                <span class="readout__value">&minus; ${inr.format(opsCost)}</span>
              </div>
              <div class="readout gate2__row--result">
                <span class="readout__label">Expected value, recovery minus ops cost</span>
                <span class="readout__value" data-delta></span>
              </div>
              <div class="readout gate2__row--muted">
                <span class="readout__label">Contest fee, charged win or lose</span>
                <span class="readout__value"><s>${inr.format(contestFee)}</s> cancels out, not counted above</span>
              </div>
            </dl>

            <p class="micro gate2__note">
              Above ${inr.format(Math.ceil(contestThreshold))} the case contests.
              Below ${inr.format(Math.floor(acceptThreshold))} it accepts the loss.
              Between them it goes to review, a ${inr.format(econ.margin)} margin either side of breakeven.
            </p>
          </div>
        </div>
      </div>
    `;

    this.panelEl = root.querySelector('[data-panel]');
    this.sliderEl = root.querySelector('[data-slider]');
    this.badgeEl = root.querySelector('[data-badge]');
    this.captionEl = root.querySelector('[data-caption]');
    this.amountEl = root.querySelector('[data-amount]');
    this.pWinEl = root.querySelector('[data-pwin]');
    this.recoveryEl = root.querySelector('[data-recovery]');
    this.deltaEl = root.querySelector('[data-delta]');

    this.sliderEl?.addEventListener('input', this.handleInput);
    this.render();
  }

  private handleInput = (): void => {
    this.render();
  };

  private render(): void {
    if (!this.sliderEl || !this.econ) return;
    const amount = Number(this.sliderEl.value);
    const { pWin, deltaEv, action } = evaluate(amount, this.econ);

    if (this.amountEl) this.amountEl.textContent = inr.format(amount);
    if (this.pWinEl) this.pWinEl.textContent = (pWin * 100).toFixed(1) + '%';
    if (this.recoveryEl) this.recoveryEl.textContent = inr.format(pWin * amount);

    if (this.deltaEl) {
      // Currency formatting rounds to whole rupees. A delta near zero (this
      // case's own breakeven sits inside the default slider position) can
      // round to -0, which Intl renders as the confusing "-₹0". Snap
      // anything sub-rupee to a plain zero instead of hiding a sign glitch.
      const shown = Math.abs(deltaEv) < 0.5 ? 0 : deltaEv;
      this.deltaEl.textContent = (shown > 0 ? '+' : '') + inr.format(shown);
      this.deltaEl.classList.remove(...ALL_TEXT_CLASSES);
      this.deltaEl.classList.add(ACTION_TEXT_CLASS[action]);
    }
    if (this.badgeEl) {
      this.badgeEl.textContent = action;
      this.badgeEl.classList.remove(...ALL_BADGE_CLASSES);
      this.badgeEl.classList.add(ACTION_BADGE_CLASS[action]);
    }
    if (this.captionEl) {
      this.captionEl.textContent = action + ' at ' + inr.format(amount);
    }
  }

  // Pure with respect to progress: this only ever fades the panel in as the
  // section enters. The dragged amount lives in the slider's own DOM state,
  // untouched by scroll, which is what keeps a drag alive under ?still=1 and
  // stable across a scrub during filming.
  update(progress: number): void {
    if (this.panelEl) {
      const revealed = clamp01(progress / 0.3);
      this.panelEl.style.opacity = String(revealed);
      this.panelEl.style.transform = `translateY(${(1 - revealed) * 12}px)`;
    }
  }

  unmount(): void {
    this.sliderEl?.removeEventListener('input', this.handleInput);
    this.econ = null;
    this.panelEl = null;
    this.sliderEl = null;
    this.badgeEl = null;
    this.captionEl = null;
    this.amountEl = null;
    this.pWinEl = null;
    this.recoveryEl = null;
    this.deltaEl = null;
  }
}

register({
  order: ORDER.gate2,
  id: 'gate2',
  create: () => new Gate2(),
});
