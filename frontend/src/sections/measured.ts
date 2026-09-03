/*
 * measured.ts
 *
 * Section 9, id "measured". Three metric families, laid out so their
 * separation is obvious: A is measured model quality, B is a simulation, C is
 * measured generation quality. Every figure here is read out of the snapshot
 * at mount time; nothing numeric is typed into this file. See
 * docs/site-copy.md section 9 for the prose this renders.
 *
 * A note on family_c: docs/site-copy.md writes {family_c.groundedness} and
 * {family_c.ungrounded_upper_bound_95} as flat fields. The real shape in
 * snapshot.json (and in core/data.ts's FamilyC type) has no such fields --
 * generation_metrics.json stratifies on evidence favourability into
 * `contestable` and `adverse`, each carrying its own
 * groundedness_mean_over_attributed and ungrounded_upper_bound_95. This file
 * reads the real per-stratum fields (currently identical: 1.0 and 0.3 for
 * both strata, which is also how the README reports it) rather than
 * inventing a blended top-level figure the schema does not have. If a future
 * export ever makes the two strata diverge, the sentence below still reads
 * correctly because it is built from whichever value is asked for, not a
 * hand-typed number.
 *
 * Counters are a pure function of progress: target * eased(t), t clamped to
 * [0, 1] from the counter's own [start, end] window within this section's
 * progress. At t = 1 the multiplication is exact (x * 1 === x), which is
 * what makes ?still=1 (update(1) once) land on the real figure and not an
 * animation frame short of it.
 */

import { register, ORDER } from '../core/registry';
import type { Section, Snapshot } from '../core/section';

import './measured.css';

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** Pure in progress: same progress always yields the same displayed value. */
function countTo(progress: number, start: number, end: number, target: number): number {
  if (progress <= start) return 0;
  if (progress >= end) return target;
  const t = (progress - start) / (end - start);
  return target * easeOutCubic(t);
}

function fmtDecimal4(v: number): string {
  return v.toFixed(4);
}

function fmtPercent1(v: number): string {
  return (v * 100).toFixed(1) + '%';
}

function fmtINR0(v: number): string {
  const rounded = Math.round(v);
  const sign = rounded < 0 ? '-' : rounded > 0 ? '+' : '';
  return sign + '₹' + Math.abs(rounded).toLocaleString('en-IN');
}

interface Counter {
  el: HTMLElement;
  bar: HTMLElement | null;
  start: number;
  end: number;
  target: number;
  barMax: number;
  format: (v: number) => string;
}

class MeasuredSection implements Section {
  readonly id = 'measured';

  private counters: Counter[] = [];

  mount(root: HTMLElement, data: Snapshot): void {
    root.classList.add('on-charcoal');

    const a = data.family_a;
    const b = data.family_b;
    const c = data.family_c;

    const netBefore = b.net_inr['none'] ?? 0;
    const netAfter = b.net_inr['model'] ?? 0;
    const netMax = Math.max(Math.abs(netBefore), Math.abs(netAfter)) || 1;

    // The two evidence strata are measured separately and, as it happens,
    // landed on the same figure. Reading it from one stratum rather than
    // averaging the two keeps every number traceable to a single field.
    const groundedness = c.contestable.groundedness_mean_over_attributed;
    const upperBound = c.contestable.ungrounded_upper_bound_95;
    const strataAgree =
      groundedness === c.adverse.groundedness_mean_over_attributed &&
      upperBound === c.adverse.ungrounded_upper_bound_95;
    const strataNote = strataAgree
      ? 'Measured over ' +
        c.contestable.n +
        ' contestable and ' +
        c.adverse.n +
        ' adverse cases, both strata.'
      : 'Contestable and adverse strata did not agree; showing the contestable figure.';

    root.innerHTML = `
      <div class="section__stage">
        <div class="section__inner measured__inner">
          <div class="measured__head">
            <div class="ruled-kicker"><span class="kicker">What was measured</span></div>
            <h2 class="title">Three numbers that are never averaged together</h2>
          </div>

          <div class="measured__grid">
            <article class="measured__family" data-family="a">
              <p class="measured__tag"><strong>A, measured.</strong> Model quality on held-out data.</p>
              <p class="measured__line">
                PR-AUC <span class="num measured__value" data-counter="pr_auc"></span>,
                precision <span class="num measured__value" data-counter="precision"></span>,
                recall <span class="num measured__value" data-counter="recall"></span>.
              </p>
              <div class="measured__bars">
                <div class="measured__bar"><span class="micro">PR-AUC</span><div class="meter"><div class="meter__fill" data-bar="pr_auc"></div></div></div>
                <div class="measured__bar"><span class="micro">Precision</span><div class="meter"><div class="meter__fill" data-bar="precision"></div></div></div>
                <div class="measured__bar"><span class="micro">Recall</span><div class="meter"><div class="meter__fill" data-bar="recall"></div></div></div>
              </div>
              <p class="micro measured__basis">${a.basis}</p>
            </article>

            <article class="measured__family" data-family="b">
              <p class="measured__tag"><strong>B, simulated.</strong> What the policy would have saved.</p>
              <p class="measured__line">
                Net loss <span class="num measured__value" data-counter="net_before"></span>
                to <span class="num measured__value" data-counter="net_after"></span>.
                Uplift over flag-everything:
                <span class="num measured__value" data-counter="uplift"></span>.
              </p>
              <div class="measured__bars">
                <div class="measured__bar"><span class="micro">Before, flag nothing</span><div class="meter"><div class="meter__fill" data-bar="net_before"></div></div></div>
                <div class="measured__bar"><span class="micro">After, the model</span><div class="meter"><div class="meter__fill" data-bar="net_after"></div></div></div>
              </div>
              <p class="micro measured__basis">${b.basis}</p>
            </article>

            <article class="measured__family" data-family="c">
              <p class="measured__tag"><strong>C, measured.</strong> Whether the model invents facts.</p>
              <p class="measured__line">
                Groundedness <span class="num measured__value" data-counter="groundedness"></span>.
                Upper bound on the ungrounded rate,
                <span class="num measured__value" data-counter="upper_bound"></span> at 95% confidence.
              </p>
              <div class="measured__bars">
                <div class="measured__bar"><span class="micro">Groundedness</span><div class="meter"><div class="meter__fill" data-bar="groundedness"></div></div></div>
                <div class="measured__bar"><span class="micro">Ungrounded upper bound</span><div class="meter"><div class="meter__fill" data-bar="upper_bound"></div></div></div>
              </div>
              <p class="micro measured__basis">${strataNote}</p>
            </article>
          </div>

          <p class="small measured__footnote">
            Blending A and B once made precision read 3.7 percent. That mistake
            is written up in the repo rather than quietly fixed.
          </p>
        </div>
      </div>
    `;

    const q = <T extends HTMLElement>(sel: string): T | null => root.querySelector<T>(sel);

    this.counters = [
      {
        el: q('[data-counter="pr_auc"]')!,
        bar: q('[data-bar="pr_auc"]'),
        start: 0.02,
        end: 0.28,
        target: a.pr_auc,
        barMax: 1,
        format: fmtDecimal4,
      },
      {
        el: q('[data-counter="precision"]')!,
        bar: q('[data-bar="precision"]'),
        start: 0.08,
        end: 0.34,
        target: a.precision_at_threshold,
        barMax: 1,
        format: fmtPercent1,
      },
      {
        el: q('[data-counter="recall"]')!,
        bar: q('[data-bar="recall"]'),
        start: 0.14,
        end: 0.4,
        target: a.recall_at_threshold,
        barMax: 1,
        format: fmtPercent1,
      },
      {
        el: q('[data-counter="net_before"]')!,
        bar: q('[data-bar="net_before"]'),
        start: 0.24,
        end: 0.5,
        target: netBefore,
        barMax: netMax,
        format: fmtINR0,
      },
      {
        el: q('[data-counter="net_after"]')!,
        bar: q('[data-bar="net_after"]'),
        start: 0.3,
        end: 0.56,
        target: netAfter,
        barMax: netMax,
        format: fmtINR0,
      },
      {
        el: q('[data-counter="uplift"]')!,
        bar: null,
        start: 0.36,
        end: 0.6,
        target: b.model_uplift_vs_flag_all_inr,
        barMax: 1,
        format: fmtINR0,
      },
      {
        el: q('[data-counter="groundedness"]')!,
        bar: q('[data-bar="groundedness"]'),
        start: 0.46,
        end: 0.7,
        target: groundedness,
        barMax: 1,
        format: fmtPercent1,
      },
      {
        el: q('[data-counter="upper_bound"]')!,
        bar: q('[data-bar="upper_bound"]'),
        start: 0.52,
        end: 0.76,
        target: upperBound,
        barMax: 1,
        format: fmtPercent1,
      },
    ];
  }

  // Pure in progress: every counter and every bar is a function of progress
  // and nothing else, so the same progress always paints the same frame.
  update(progress: number): void {
    for (const counter of this.counters) {
      const value = countTo(progress, counter.start, counter.end, counter.target);
      counter.el.textContent = counter.format(value);
      if (counter.bar) {
        const width = Math.max(0, Math.min(1, Math.abs(value) / counter.barMax)) * 100;
        counter.bar.style.width = width.toFixed(2) + '%';
      }
    }
  }

  unmount(): void {
    this.counters = [];
  }
}

register({
  order: ORDER.measured,
  id: 'measured',
  create: () => new MeasuredSection(),
});
