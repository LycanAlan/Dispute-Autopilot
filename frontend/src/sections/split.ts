/*
 * split.ts
 *
 * Section 3. Why the split is temporal, and where the boundaries really land.
 *
 * The old layout was a text panel beside a statistics panel, both starting at
 * the same top edge, the right one ending well short of the left. The author:
 * "the left box and right box look weird because they both start from the
 * same top positon but right ends early not very aesthetically pleasing."
 *
 * So the two ragged columns are gone. The section is now one centred column
 * of type over one full-width diagram, and the diagram is the argument:
 *
 *   two stacked axes, the same split drawn twice. On top, where the
 *   boundaries fall by row count: exactly 0.70 and 0.80, because that is how
 *   the split is defined. Underneath, where those same two boundaries land on
 *   the time axis: 0.658 and 0.770. Dashed connectors run between each pair.
 *
 * The drift between the two rows IS the point of the section. Transaction
 * volume is not flat over time, so seventy percent of the rows is not the
 * first seventy percent of the elapsed time. Saying that in prose takes a
 * paragraph a viewer will skim. Drawing both axes and letting the connectors
 * lean makes it obvious before the paragraph is read.
 *
 * Both rows are read from snapshot.json rather than from the constants 0.70
 * and 0.80. The row fractions really are exactly 0.70 and 0.80 by
 * construction, but typing them here would mean the diagram no longer
 * reflects a re-export that changed them, which is the failure this whole
 * site is built to avoid.
 *
 * ON PURITY. Every animated value is a ramp over progress. update(1) draws
 * the finished diagram in one call, for ?still=1.
 */
import { ORDER, register } from '../core/registry';
import type { Section, Snapshot } from '../core/section';
import { fmtInt, fmtRatio } from '../three/format';

import './split.css';

/** Ramp from 0 to 1 across [a, b], flat outside it. */
function span(p: number, a: number, b: number): number {
  if (b <= a) return p >= b ? 1 : 0;
  return Math.min(1, Math.max(0, (p - a) / (b - a)));
}

interface Cue {
  el: HTMLElement;
  prop: string;
  from: number;
  to: number;
}

class SplitSection implements Section {
  readonly id = 'split';

  private cues: Cue[] = [];

  mount(root: HTMLElement, data: Snapshot): void {
    root.classList.add('on-charcoal', 'section--runway', 'split-section');
    root.style.height = '250svh';

    const trainX = data.split.train_end_x;
    const calibX = data.split.calib_end_x;

    // Fall back only if an older snapshot predates these keys. The fallbacks
    // are the definition of the split, not an estimate of it.
    const trainRowFrac = data.split.train_end_row_frac ?? 0.7;
    const calibRowFrac = data.split.calib_end_row_frac ?? 0.8;

    const rows = (n: number | undefined): string => (n === undefined ? '' : fmtInt(n) + ' rows');

    root.innerHTML = `
      <div class="section__stage">
        <div class="section__inner split__inner">
          <div class="split__column">
            <div class="ruled-kicker split__cue" data-cue="head"><span class="kicker">The split</span></div>

            <h2 class="title split__head split__cue" data-cue="head">A random split would have flattered us</h2>

            <p class="lede split__lede split__cue" data-cue="lede">
              Card entities repeat across rows. Shuffle them and the same card
              lands in train and in test, so the model recognises the answer
              instead of predicting it. Train on the past, score the future.
            </p>

            <figure class="split__figure">
              <figcaption class="visually-hidden">
                The same 70/10/20 split drawn twice: once by row count, once by
                where those boundaries fall on the time axis.
              </figcaption>

              <!-- ------------------------------------------- by row count -->
              <div class="split__axis split__cue" data-cue="rowaxis">
                <div class="split__axishead">
                  <span class="micro split__axisname">Split by row count</span>
                  <span class="micro split__axisnote">how the split is defined</span>
                </div>
                <div class="split__bar" data-bar="row">
                  <span class="split__seg split__seg--train" data-seg style="--to:${(trainRowFrac * 100).toFixed(3)}%">
                    <span class="split__seglabel">Train</span>
                  </span>
                  <span class="split__seg split__seg--calib" data-seg
                        style="--from:${(trainRowFrac * 100).toFixed(3)}%;--to:${(calibRowFrac * 100).toFixed(3)}%">
                    <span class="split__seglabel">Calib.</span>
                  </span>
                  <span class="split__seg split__seg--test" data-seg
                        style="--from:${(calibRowFrac * 100).toFixed(3)}%;--to:100%">
                    <span class="split__seglabel">Test</span>
                  </span>
                </div>
                <div class="split__ticks">
                  <span class="split__tick" style="--at:${(trainRowFrac * 100).toFixed(3)}%" data-tick="rowtrain"></span>
                  <span class="split__tick" style="--at:${(calibRowFrac * 100).toFixed(3)}%" data-tick="rowcalib"></span>
                </div>
              </div>

              <!-- --------------------------------------------- connectors -->
              <svg class="split__link split__cue" data-cue="link" viewBox="0 0 100 8"
                   preserveAspectRatio="none" aria-hidden="true">
                <line class="split__linkline" x1="${(trainRowFrac * 100).toFixed(3)}" y1="0"
                      x2="${(trainX * 100).toFixed(3)}" y2="8" />
                <line class="split__linkline" x1="${(calibRowFrac * 100).toFixed(3)}" y1="0"
                      x2="${(calibX * 100).toFixed(3)}" y2="8" />
              </svg>

              <!-- -------------------------------------------- by real time -->
              <div class="split__axis split__cue" data-cue="timeaxis">
                <div class="split__bar split__bar--time" data-bar="time">
                  <span class="split__seg split__seg--train" data-seg style="--to:${(trainX * 100).toFixed(3)}%"></span>
                  <span class="split__seg split__seg--calib" data-seg
                        style="--from:${(trainX * 100).toFixed(3)}%;--to:${(calibX * 100).toFixed(3)}%"></span>
                  <span class="split__seg split__seg--test" data-seg
                        style="--from:${(calibX * 100).toFixed(3)}%;--to:100%"></span>
                </div>
                <div class="split__axishead split__axishead--under">
                  <span class="micro split__axisname">Where that lands on the time axis</span>
                  <span class="micro split__axisnote">what the model actually sees</span>
                </div>
              </div>

              <!-- ------------------------------------------------ readouts -->
              <div class="split__readouts split__cue" data-cue="readouts">
                <div class="split__readout" tabindex="0">
                  <span class="micro split__readout-label">Train ends</span>
                  <span class="num split__readout-value">
                    <span class="split__was" data-was="train"></span>
                    <span class="split__arrow" aria-hidden="true">&rarr;</span>
                    <span class="split__is is-review" data-is="train"></span>
                  </span>
                  <span class="micro split__readout-rows" data-rows="train"></span>
                </div>
                <div class="split__readout" tabindex="0">
                  <span class="micro split__readout-label">Calibration ends</span>
                  <span class="num split__readout-value">
                    <span class="split__was" data-was="calib"></span>
                    <span class="split__arrow" aria-hidden="true">&rarr;</span>
                    <span class="split__is is-review" data-is="calib"></span>
                  </span>
                  <span class="micro split__readout-rows" data-rows="calib"></span>
                </div>
                <div class="split__readout" tabindex="0">
                  <span class="micro split__readout-label">Test</span>
                  <span class="num split__readout-value">
                    <span class="split__is" data-is="test"></span>
                  </span>
                  <span class="micro split__readout-rows" data-rows="test"></span>
                </div>
              </div>
            </figure>

            <p class="split__foot split__cue" data-cue="foot">
              Not 0.70 and 0.80. Those are row fractions. Transaction volume is
              not flat over time, so the same boundary sits somewhere else on
              the clock. Precedent for the temporal split: arXiv 2208.14417.
            </p>
          </div>
        </div>
      </div>
    `;

    const put = (attr: string, key: string, text: string): void => {
      const el = root.querySelector<HTMLElement>('[data-' + attr + '="' + key + '"]');
      if (el) el.textContent = text;
    };

    put('was', 'train', fmtRatio(trainRowFrac));
    put('was', 'calib', fmtRatio(calibRowFrac));
    put('is', 'train', fmtRatio(trainX));
    put('is', 'calib', fmtRatio(calibX));
    put('is', 'test', fmtRatio(1 - calibX));
    put('rows', 'train', rows(data.split.train_rows));
    put('rows', 'calib', rows(data.split.calib_rows));
    put('rows', 'test', rows(data.split.test_rows));

    const cue = (sel: string, prop: string, from: number, to: number): void => {
      root.querySelectorAll<HTMLElement>(sel).forEach((el) => {
        this.cues.push({ el, prop, from, to });
      });
    };

    cue('[data-cue="head"]', '--in', 0.02, 0.14);
    cue('[data-cue="lede"]', '--in', 0.08, 0.22);
    cue('[data-cue="rowaxis"]', '--in', 0.20, 0.32);
    cue('[data-bar="row"] [data-seg]', '--grow', 0.24, 0.44);
    cue('[data-cue="link"]', '--in', 0.44, 0.58);
    cue('[data-cue="timeaxis"]', '--in', 0.50, 0.62);
    cue('[data-bar="time"] [data-seg]', '--grow', 0.54, 0.74);
    cue('[data-cue="readouts"]', '--in', 0.72, 0.86);
    cue('[data-cue="foot"]', '--in', 0.82, 0.94);

    this.update(0);
  }

  update(progress: number): void {
    for (const c of this.cues) {
      c.el.style.setProperty(c.prop, span(progress, c.from, c.to).toFixed(3));
    }
  }

  unmount(): void {
    this.cues = [];
  }
}

register({
  order: ORDER.split,
  id: 'split',
  create: () => new SplitSection(),
});
