/*
 * model.ts
 *
 * Section 4. The camera tilts down toward the z axis, which is where risk
 * lives in this scene's world mapping, so the flat cloud rises into a
 * landscape as its colour remaps to a continuous risk ramp. The PR curve and
 * the calibration curve draw alongside it, both read from snapshot.curves.
 */
import type { PointCloud } from '../core/data';
import { ORDER, register } from '../core/registry';
import type { Section, Snapshot } from '../core/section';
import { drawScatter, type FlatCanvas } from '../three/flat';
import { fmtPct } from '../three/format';
import { flatPalette, riskRGB } from '../three/palette-map';
import { ScenePresence } from '../three/presence';
import type { CameraState, CloudUniforms, SweepState } from '../three/scene';
import { WORLD } from '../three/scene';
import { ease, lerpVec3, windowed, type Vec3 } from '../three/util';

import { SPLIT_CAM_END, SPLIT_LOOK_END } from './split';

import '../three/scene-layout.css';
import './model.css';

export const MODEL_CAM_END: Vec3 = [0.4, 7.8, 6.4];
export const MODEL_LOOK_END: Vec3 = [0, 0.4, 0];

function pathFrom(points: ReadonlyArray<readonly [number, number]>, flipY: boolean): string {
  if (points.length === 0) return '';
  return points
    .map(([a, b], i) => {
      const x = (a * 100).toFixed(2);
      const y = ((flipY ? 1 - b : b) * 100).toFixed(2);
      return (i === 0 ? 'M' : 'L') + x + ',' + y;
    })
    .join(' ');
}

class ModelSection implements Section {
  readonly id = 'model';
  readonly needsScene = true;

  private presence: ScenePresence | null = null;
  private setPathReveal: ((progress: number) => void) | null = null;

  async mount(root: HTMLElement, data: Snapshot): Promise<void> {
    root.classList.add('on-charcoal', 'section--runway', 'model-section');
    root.style.height = '260svh';

    const targetA = (data.split.train_end_x - 0.5) * WORLD.width;
    const targetB = (data.split.calib_end_x - 0.5) * WORLD.width;

    const prPath = pathFrom(data.curves.pr, true);
    const calPath = pathFrom(data.curves.calibration, true);

    root.innerHTML = `
      <div class="section__stage">
        <div class="scene-field" data-field></div>
        <div class="scene-overlay scene-overlay--split">
          <div class="model-section__lockup">
            <div class="ruled-kicker"><span class="kicker">The model</span></div>
            <h2 class="title model-section__head">Calibration is not decoration here</h2>
            <div class="prose model-section__body">
              <p>
                The next stage multiplies this number by a rupee amount. That
                only works if it is a probability, not a ranking score.
              </p>
            </div>
            <ul class="model-section__stats">
              <li data-stat-brier></li>
              <li data-stat-pr></li>
              <li data-stat-precision></li>
              <li data-stat-recall></li>
            </ul>
            <p class="model-section__admission">
              Calibration makes PR-AUC slightly worse, and it is kept anyway.
              Isotonic regression is a step function, so it collapses scores
              into fewer distinct levels and average precision pays for that
              through ties. Ranking quality is unchanged. Every decision after
              this one is an expected value computation, and that arithmetic on
              a ranking score is meaningless.
            </p>
            <p class="micro model-section__caption">Held out in time, never shuffled.</p>
          </div>

          <div class="scene-panel model-section__panel">
            <div class="model-section__chart">
              <span class="kicker">PR curve</span>
              <svg class="model-section__svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <line x1="0" y1="100" x2="100" y2="100" class="model-section__axis" />
                <line x1="0" y1="0" x2="0" y2="100" class="model-section__axis" />
                <path d="${prPath}" class="model-section__path" data-pr-path pathLength="1" />
              </svg>
              <div class="model-section__axislabels">
                <span>Recall</span>
                <span>Precision</span>
              </div>
            </div>
            <div class="model-section__chart">
              <span class="kicker">Calibration curve</span>
              <svg class="model-section__svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <line x1="0" y1="100" x2="100" y2="100" class="model-section__axis" />
                <line x1="0" y1="0" x2="0" y2="100" class="model-section__axis" />
                <line x1="0" y1="100" x2="100" y2="0" class="model-section__reference" />
                <path d="${calPath}" class="model-section__path" data-cal-path pathLength="1" />
              </svg>
              <div class="model-section__axislabels">
                <span>Predicted</span>
                <span>Observed</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Brier leads, PR-AUC follows. Calibration IMPROVES Brier roughly threefold
    // and slightly WORSENS PR-AUC, and the earlier version of this block showed
    // only the second of those, under a headline arguing that calibration
    // matters. Read on camera it invited exactly one question, with no answer
    // on screen. Leading with the measure that improves, and then stating the
    // cost plainly underneath, is both the honest order and the stronger one.
    const brierEl = root.querySelector<HTMLElement>('[data-stat-brier]');
    if (brierEl) {
      brierEl.textContent =
        'Brier score ' +
        data.family_a.brier_uncalibrated.toFixed(4) +
        ' to ' +
        data.family_a.brier.toFixed(4) +
        ' after isotonic calibration';
    }
    const prEl = root.querySelector<HTMLElement>('[data-stat-pr]');
    if (prEl) {
      prEl.textContent =
        'PR-AUC ' +
        fmtPct(data.family_a.pr_auc_uncalibrated) +
        ' to ' +
        fmtPct(data.family_a.pr_auc);
    }
    const precisionEl = root.querySelector<HTMLElement>('[data-stat-precision]');
    if (precisionEl) precisionEl.textContent = 'Precision ' + fmtPct(data.family_a.precision_at_threshold);
    const recallEl = root.querySelector<HTMLElement>('[data-stat-recall]');
    if (recallEl) recallEl.textContent = 'Recall ' + fmtPct(data.family_a.recall_at_threshold);

    const prPathEl = root.querySelector<SVGPathElement>('[data-pr-path]');
    const calPathEl = root.querySelector<SVGPathElement>('[data-cal-path]');

    const field = root.querySelector<HTMLElement>('[data-field]');
    if (!field) return;

    const camera = (progress: number): CameraState => {
      const t = ease(progress);
      return {
        position: lerpVec3(SPLIT_CAM_END, MODEL_CAM_END, t),
        lookAt: lerpVec3(SPLIT_LOOK_END, MODEL_LOOK_END, t),
        fov: 46,
      };
    };

    const uniforms = (progress: number): CloudUniforms => ({
      materialize: 1,
      labelMix: 1,
      riskMix: ease(progress),
      collapse: 0,
      collapseTarget: [0, 0, 0],
    });

    const sweep = (): SweepState => ({
      ax: targetA,
      bx: targetB,
      aOpacity: 1,
      bOpacity: 1,
    });

    const drawFlat = (flat: FlatCanvas, cloud: PointCloud, progress: number): void => {
      const palette = flatPalette();
      const riskT = ease(progress);
      drawScatter(flat.ctx, cloud, {
        dotSize: 2,
        colorOf: (_x, _y, z) => {
          const [r, g, b] = riskRGB(z, palette);
          return [r, g, b, Math.round(150 + 105 * riskT)];
        },
      });
    };

    this.presence = new ScenePresence({ camera, uniforms, sweep, drawFlat });
    await this.presence.mount(field);

    // Curves are SVG, so they draw the same way whether the scene behind
    // them is WebGL or the flat canvas: a pathLength="1" path needs only
    // its dash offset set from progress, no measurement, no WebGL at all.
    this.setPathReveal = (progress: number): void => {
      const prReveal = windowed(progress, 0, 0.55);
      const calReveal = windowed(progress, 0.35, 1);
      if (prPathEl) prPathEl.style.strokeDashoffset = String(1 - prReveal);
      if (calPathEl) calPathEl.style.strokeDashoffset = String(1 - calReveal);
    };
    this.setPathReveal(0);
  }

  update(progress: number): void {
    this.presence?.update(progress);
    this.setPathReveal?.(progress);
  }

  unmount(): void {
    this.presence?.unmount();
    this.presence = null;
    this.setPathReveal = null;
  }
}

register({
  order: ORDER.model,
  id: 'model',
  create: () => new ModelSection(),
});
