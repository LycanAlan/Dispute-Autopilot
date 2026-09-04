/*
 * model.ts
 *
 * Section 4. Why the score is calibrated, and what that cost.
 *
 * TWO DEFECTS THE AUTHOR REPORTED, AND WHAT CAUSED THEM.
 *
 * "fix the page actually being cut off at the bottom for graph as well as
 * text box because left box actually loses some text and have to scroll."
 *
 * The cause was structural rather than a matter of a few pixels. The stage
 * was a single-column grid holding two children: the scene field, which
 * mounted a canvas, and the overlay holding all the content. The field is a
 * grid row, so it took real vertical space above the overlay and pushed the
 * bottom of the content past the edge of a stage that is min-height 100svh
 * with overflow hidden. Nothing was scrollable, so the overflow was simply
 * invisible. The field is gone now, and with it the reason this section did
 * not fit. Heights below are budgeted in vh so it keeps fitting on a shorter
 * screen instead of fitting only on this one.
 *
 * "the graphs could be improved with colors and making it more interactive by
 * using cursor hover things and it popping out and stuff."
 *
 * Colour here is semantic, never decorative. Green is the calibrated curve,
 * the one that is kept. Bone is the uncalibrated one it replaced. Clay is the
 * baseline you would get by guessing, which is the floor both curves have to
 * beat. Amber marks the operating point, the one place a threshold was
 * actually chosen. Four roles, four colours, and no fifth colour for the sake
 * of having one.
 *
 * Both charts read out under the cursor: a crosshair snaps to the nearest
 * plotted point and prints both of its coordinates. It is worth more than a
 * static plot for a reason beyond looking alive, which is that the whole
 * claim of the section is that a specific number means a specific thing. A
 * viewer can now check any point on either curve instead of taking the
 * summary statistic on faith.
 *
 * ON PURITY. update() stays a pure function of progress: it sets the two
 * dash offsets and the cue ramps, nothing else. Hover state is deliberately
 * outside that, exactly like the replay button in refusal.ts. It is driven by
 * the pointer rather than by scroll, it is cleared on pointerleave, and it
 * never writes anything update() reads, so scrubbing and ?still=1 behave the
 * same whether or not the cursor happens to be over a chart.
 */
import { ORDER, register } from '../core/registry';
import type { Section, Snapshot } from '../core/section';
import { fmtPct } from '../three/format';

import './model.css';

type CurvePoints = ReadonlyArray<readonly [number, number]>;

/**
 * data.curves as exported today, widened with the two uncalibrated series.
 * core/data.ts types Curves as { pr, calibration } with no index signature,
 * so the extra keys the exporter writes are read through this local,
 * still-structural type. Every field here is really on the object at
 * runtime; this tells the compiler about values that exist, it does not
 * fabricate any.
 */
interface ModelCurves {
  pr: CurvePoints;
  calibration: CurvePoints;
  pr_uncalibrated: CurvePoints;
  calibration_uncalibrated: CurvePoints;
}

/** Ramp from 0 to 1 across [a, b], flat outside it. */
function span(p: number, a: number, b: number): number {
  if (b <= a) return p >= b ? 1 : 0;
  return Math.min(1, Math.max(0, (p - a) / (b - a)));
}

function pathFrom(points: CurvePoints, flipY: boolean): string {
  if (points.length === 0) return '';
  return points
    .map(([a, b], i) => {
      const x = (a * 100).toFixed(2);
      const y = ((flipY ? 1 - b : b) * 100).toFixed(2);
      return (i === 0 ? 'M' : 'L') + x + ',' + y;
    })
    .join(' ');
}

/** Labels for the readout, per chart. */
interface ChartMeta {
  points: CurvePoints;
  xName: string;
  yName: string;
}

interface Cue {
  el: HTMLElement;
  from: number;
  to: number;
}

class ModelSection implements Section {
  readonly id = 'model';

  private cues: Cue[] = [];
  private setPathReveal: ((progress: number) => void) | null = null;
  private teardown: Array<() => void> = [];

  mount(root: HTMLElement, data: Snapshot): void {
    root.classList.add('on-charcoal', 'section--runway', 'model-section');
    root.style.height = '250svh';

    const curves = data.curves as unknown as ModelCurves;
    const prPath = pathFrom(curves.pr, true);
    const calPath = pathFrom(curves.calibration, true);
    const prGhostPath = pathFrom(curves.pr_uncalibrated, true);
    const calGhostPath = pathFrom(curves.calibration_uncalibrated, true);

    // The operating point: family_a's own F1-maximising threshold, plotted on
    // the same recall/precision axes as the curve it sits on. flipY matches
    // pathFrom above, so the SVG y coordinate is (1 - precision) * 100.
    const opX = (data.family_a.recall_at_threshold * 100).toFixed(2);
    const opY = ((1 - data.family_a.precision_at_threshold) * 100).toFixed(2);

    // The baseline: the precision you would get by flagging every
    // transaction, which is the base chargeback rate. Same axes, same flip.
    const baseY = ((1 - data.family_a.positive_rate) * 100).toFixed(2);
    const baseLabel = fmtPct(data.family_a.positive_rate) + ' precision by guessing';

    root.innerHTML = `
      <div class="section__stage">
        <div class="section__inner model__inner">
          <div class="model__grid">

            <div class="model__side">
              <div class="ruled-kicker model__cue" data-cue><span class="kicker">The model</span></div>
              <h2 class="title model__head model__cue" data-cue>Calibration is not decoration here</h2>
              <p class="model__body model__cue" data-cue>
                The next stage multiplies this number by a rupee amount. That
                only works if it is a probability, not a ranking score.
              </p>

              <ul class="model__stats">
                <li class="model__stat model__cue" data-cue tabindex="0">
                  <span class="micro model__stat-label">Brier score, lower is better</span>
                  <span class="num model__stat-value">
                    <span class="model__was" data-stat="brier_before"></span>
                    <span class="model__arrow" aria-hidden="true">&rarr;</span>
                    <span class="is-contest" data-stat="brier_after"></span>
                  </span>
                </li>
                <li class="model__stat model__cue" data-cue tabindex="0">
                  <span class="micro model__stat-label">PR-AUC, the price paid</span>
                  <span class="num model__stat-value">
                    <span class="model__was" data-stat="pr_before"></span>
                    <span class="model__arrow" aria-hidden="true">&rarr;</span>
                    <span class="is-review" data-stat="pr_after"></span>
                  </span>
                </li>
                <li class="model__stat model__cue" data-cue tabindex="0">
                  <span class="micro model__stat-label">Precision at the operating point</span>
                  <span class="num model__stat-value" data-stat="precision"></span>
                </li>
                <li class="model__stat model__cue" data-cue tabindex="0">
                  <span class="micro model__stat-label">Recall at the operating point</span>
                  <span class="num model__stat-value" data-stat="recall"></span>
                </li>
              </ul>

              <p class="model__admission model__cue" data-cue>
                Calibration makes PR-AUC slightly worse, and it is kept anyway.
                Isotonic regression is a step function, so it collapses scores
                into fewer distinct levels and average precision pays for that
                through ties. Ranking quality is unchanged, and every decision
                after this one is an expected value computation, which on a
                ranking score would be meaningless.
              </p>

              <p class="micro model__caption model__cue" data-cue>Held out in time, never shuffled.</p>
            </div>

            <div class="model__charts">

              <!-- ------------------------------------------------ PR curve -->
              <figure class="model__chart model__cue" data-cue>
                <figcaption class="model__chart-head">
                  <span class="kicker">PR curve</span>
                  <ul class="model__legend">
                    <li><span class="model__swatch model__swatch--live"></span>Calibrated</li>
                    <li><span class="model__swatch model__swatch--ghost"></span>Before</li>
                    <li><span class="model__swatch model__swatch--base"></span>Guessing</li>
                  </ul>
                </figcaption>
                <p class="model__axistitle">Precision, share of flags that were right</p>
                <div class="model__plot">
                  <div class="model__ticks model__ticks--y" aria-hidden="true">
                    <span>1</span><span>0.5</span><span>0</span>
                  </div>
                  <div class="model__svgwrap" data-chart="pr">
                    <svg class="model__svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                      <line x1="0" y1="50" x2="100" y2="50" class="model__gridline" />
                      <line x1="50" y1="0" x2="50" y2="100" class="model__gridline" />
                      <line x1="0" y1="100" x2="100" y2="100" class="model__axis" />
                      <line x1="0" y1="0" x2="0" y2="100" class="model__axis" />
                      <line x1="0" y1="${baseY}" x2="100" y2="${baseY}" class="model__baseline" />
                      <path d="${prGhostPath}" class="model__path model__path--ghost" />
                      <path d="${prPath}" class="model__path model__path--live" data-pr-path />
                      <line class="model__crosshair" data-cross x1="0" y1="0" x2="0" y2="100" />
                    </svg>
                    <span class="model__baselinelabel" style="top:${baseY}%">${baseLabel}</span>
                    <span class="model__op" style="left:${opX}%; top:${opY}%"></span>
                    <span class="model__oplabel" style="left:${opX}%; top:${opY}%">Operating point</span>
                    <span class="model__hoverdot" data-dot></span>
                    <div class="model__readout" data-readout></div>
                  </div>
                  <div class="model__ticks model__ticks--x" aria-hidden="true">
                    <span>0</span><span>0.5</span><span>1</span>
                  </div>
                </div>
                <p class="model__axistitle model__axistitle--x">Recall, share of chargebacks caught</p>
                <p class="model__chartcaption">Good looks like up and to the right. Both curves sit far above the clay floor, which is all guessing would buy you.</p>
              </figure>

              <!-- --------------------------------------- calibration curve -->
              <figure class="model__chart model__cue" data-cue>
                <figcaption class="model__chart-head">
                  <span class="kicker">Calibration curve</span>
                  <ul class="model__legend">
                    <li><span class="model__swatch model__swatch--live"></span>Calibrated</li>
                    <li><span class="model__swatch model__swatch--ghost"></span>Before</li>
                  </ul>
                </figcaption>
                <p class="model__axistitle">Observed frequency</p>
                <div class="model__plot">
                  <div class="model__ticks model__ticks--y" aria-hidden="true">
                    <span>1</span><span>0.5</span><span>0</span>
                  </div>
                  <div class="model__svgwrap" data-chart="cal">
                    <svg class="model__svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                      <line x1="0" y1="50" x2="100" y2="50" class="model__gridline" />
                      <line x1="50" y1="0" x2="50" y2="100" class="model__gridline" />
                      <line x1="0" y1="100" x2="100" y2="100" class="model__axis" />
                      <line x1="0" y1="0" x2="0" y2="100" class="model__axis" />
                      <line x1="0" y1="100" x2="100" y2="0" class="model__reference" />
                      <path d="${calGhostPath}" class="model__path model__path--ghost" />
                      <path d="${calPath}" class="model__path model__path--live" data-cal-path />
                      <line class="model__crosshair" data-cross x1="0" y1="0" x2="0" y2="100" />
                    </svg>
                    <span class="model__diagonallabel">perfect calibration</span>
                    <span class="model__hoverdot" data-dot></span>
                    <div class="model__readout" data-readout></div>
                  </div>
                  <div class="model__ticks model__ticks--x" aria-hidden="true">
                    <span>0</span><span>0.5</span><span>1</span>
                  </div>
                </div>
                <p class="model__axistitle model__axistitle--x">Predicted probability</p>
                <p class="model__chartcaption">Closer to the diagonal means the number means what it says. Neither curve runs past the right of the chart because the model rarely predicts a risk that high.</p>
              </figure>

            </div>
          </div>
        </div>
      </div>
    `;

    // Brier leads, PR-AUC follows. Calibration IMPROVES Brier roughly
    // threefold and slightly WORSENS PR-AUC. An earlier version of this block
    // showed only the second under a headline arguing calibration matters,
    // which on camera invites exactly one question with no answer on screen.
    const stat = (key: string, text: string): void => {
      const el = root.querySelector<HTMLElement>('[data-stat="' + key + '"]');
      if (el) el.textContent = text;
    };
    stat('brier_before', data.family_a.brier_uncalibrated.toFixed(4));
    stat('brier_after', data.family_a.brier.toFixed(4));
    stat('pr_before', fmtPct(data.family_a.pr_auc_uncalibrated));
    stat('pr_after', fmtPct(data.family_a.pr_auc));
    stat('precision', fmtPct(data.family_a.precision_at_threshold));
    stat('recall', fmtPct(data.family_a.recall_at_threshold));

    const prPathEl = root.querySelector<SVGPathElement>('[data-pr-path]');
    const calPathEl = root.querySelector<SVGPathElement>('[data-cal-path]');

    // Real path length in user-space units, not the pathLength="1" trick this
    // used to lean on. That normalises the dash array against an
    // author-declared length wildly different from the geometric one, and
    // Chromium's per-segment dash interpolation visibly loses the plot under
    // that rescale: the revealed line renders with real gaps at progress 1,
    // on a curve with nothing left to reveal.
    const prLen = prPathEl?.getTotalLength() ?? 0;
    const calLen = calPathEl?.getTotalLength() ?? 0;
    if (prPathEl) prPathEl.style.strokeDasharray = String(prLen);
    if (calPathEl) calPathEl.style.strokeDasharray = String(calLen);

    this.setPathReveal = (progress: number): void => {
      const prReveal = span(progress, 0.18, 0.62);
      const calReveal = span(progress, 0.46, 0.90);
      if (prPathEl) prPathEl.style.strokeDashoffset = String(prLen * (1 - prReveal));
      if (calPathEl) calPathEl.style.strokeDashoffset = String(calLen * (1 - calReveal));
    };

    const meta: Record<string, ChartMeta> = {
      pr: { points: curves.pr, xName: 'Recall', yName: 'Precision' },
      cal: { points: curves.calibration, xName: 'Predicted', yName: 'Observed' },
    };

    root.querySelectorAll<HTMLElement>('[data-chart]').forEach((wrap) => {
      const key = wrap.dataset['chart'];
      if (!key) return;
      const m = meta[key];
      if (!m || m.points.length === 0) return;
      this.wireHover(wrap, m);
    });

    const els = Array.from(root.querySelectorAll<HTMLElement>('[data-cue]'));
    const FIRST = 0.02;
    const STEP = 0.048;
    const FADE = 0.10;
    this.cues = els.map((el, i) => ({
      el,
      from: FIRST + i * STEP,
      to: FIRST + i * STEP + FADE,
    }));

    this.update(0);
  }

  /**
   * Snaps a crosshair to the nearest plotted point under the cursor and
   * prints both coordinates. Outside update()'s progress contract on
   * purpose: see the ON PURITY note at the top of this file.
   */
  private wireHover(wrap: HTMLElement, m: ChartMeta): void {
    const cross = wrap.querySelector<SVGLineElement>('[data-cross]');
    const dot = wrap.querySelector<HTMLElement>('[data-dot]');
    const readout = wrap.querySelector<HTMLElement>('[data-readout]');
    if (!cross || !dot || !readout) return;

    const move = (event: PointerEvent): void => {
      const box = wrap.getBoundingClientRect();
      if (box.width === 0) return;
      const frac = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));

      let best = m.points[0];
      let bestGap = Infinity;
      for (const p of m.points) {
        const gap = Math.abs(p[0] - frac);
        if (gap < bestGap) {
          bestGap = gap;
          best = p;
        }
      }

      const x = best[0] * 100;
      const y = (1 - best[1]) * 100;
      cross.setAttribute('x1', String(x));
      cross.setAttribute('x2', String(x));
      // The dot is an HTML element rather than an SVG circle. This viewBox is
      // stretched non-uniformly to the plot's aspect ratio, so a circle in it
      // renders as a wide ellipse; percentage positioning in the wrapper keeps
      // the marker round at every panel size.
      dot.style.left = x + '%';
      dot.style.top = y + '%';
      readout.textContent =
        m.xName + ' ' + best[0].toFixed(3) + '   ' + m.yName + ' ' + best[1].toFixed(3);
      // Held inside the plot so the readout never hangs off either edge.
      readout.style.left = Math.min(88, Math.max(2, x)) + '%';
      wrap.classList.add('is-hovering');
    };

    const leave = (): void => {
      wrap.classList.remove('is-hovering');
    };

    wrap.addEventListener('pointermove', move);
    wrap.addEventListener('pointerleave', leave);
    this.teardown.push(() => {
      wrap.removeEventListener('pointermove', move);
      wrap.removeEventListener('pointerleave', leave);
    });
  }

  update(progress: number): void {
    for (const c of this.cues) {
      c.el.style.setProperty('--in', span(progress, c.from, c.to).toFixed(3));
    }
    this.setPathReveal?.(progress);
  }

  unmount(): void {
    for (const off of this.teardown) off();
    this.teardown = [];
    this.cues = [];
    this.setPathReveal = null;
  }
}

register({
  order: ORDER.model,
  id: 'model',
  create: () => new ModelSection(),
});
