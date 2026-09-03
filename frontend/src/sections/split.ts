/*
 * split.ts
 *
 * Section 3. Two vertical planes sweep in to train_end_x and calib_end_x,
 * the real positions those boundaries fall at on the time axis the cloud is
 * drawn on, not the 70/10/20 row fractions that produced them. Those two
 * numbers differ (0.658 is not 0.70) because transaction volume is not flat
 * over time, and that gap is the whole point of this section, so it reads
 * off snapshot.json at runtime rather than off the row fractions.
 */
import type { PointCloud } from '../core/data';
import { ORDER, register } from '../core/registry';
import type { Section, Snapshot } from '../core/section';
import { drawScatter, type FlatCanvas } from '../three/flat';
import { flatPalette } from '../three/palette-map';
import { ScenePresence } from '../three/presence';
import { fmtRatio } from '../three/format';
import type { CameraState, CloudUniforms, SweepState } from '../three/scene';
import { WORLD } from '../three/scene';
import { ease, lerp, lerpVec3, windowed, type Vec3 } from '../three/util';

import { LABEL_CAM_END, LABEL_LOOK_END } from './label';

import '../three/scene-layout.css';
import './split.css';

export const SPLIT_CAM_END: Vec3 = [0.2, 3.7, 16.2];
export const SPLIT_LOOK_END: Vec3 = [0, 1.3, 0];

const OFF_LEFT = -(WORLD.width / 2) - 2;

class SplitSection implements Section {
  readonly id = 'split';
  readonly needsScene = true;

  private presence: ScenePresence | null = null;

  async mount(root: HTMLElement, data: Snapshot): Promise<void> {
    root.classList.add('on-charcoal', 'section--runway', 'split-section');
    root.style.height = '240svh';

    const trainX = data.split.train_end_x;
    const calibX = data.split.calib_end_x;
    const targetA = (trainX - 0.5) * WORLD.width;
    const targetB = (calibX - 0.5) * WORLD.width;

    root.innerHTML = `
      <div class="section__stage">
        <div class="scene-field" data-field></div>
        <div class="scene-overlay scene-overlay--split">
          <div class="split-section__lockup">
            <div class="ruled-kicker"><span class="kicker">The split</span></div>
            <h2 class="title split-section__head">A random split would have flattered us</h2>
            <div class="prose split-section__body">
              <p>
                Card entities repeat across rows. Shuffle them and the same card
                lands in train and in test, so the model recognises the answer
                instead of predicting it.
              </p>
              <p>Train on the past. Score the future. 70 / 10 / 20, in time order.</p>
            </div>
            <p class="micro split-section__footnote">
              Precedent for the temporal split: arXiv 2208.14417.
            </p>
          </div>
          <div class="scene-panel split-section__panel">
            <span class="kicker">Where the boundary actually falls</span>
            <div class="readout">
              <span class="readout__label">Train ends, position on the time axis</span>
              <span class="readout__value" data-train-x></span>
            </div>
            <div class="readout">
              <span class="readout__label">Calibration ends, position on the time axis</span>
              <span class="readout__value" data-calib-x></span>
            </div>
            <p class="micro split-section__note">
              Not 0.70 and 0.80. Those are row fractions; transaction volume
              is not flat over time, so the same boundary sits elsewhere on it.
            </p>
          </div>
        </div>
      </div>
    `;

    const trainEl = root.querySelector<HTMLElement>('[data-train-x]');
    if (trainEl) trainEl.textContent = fmtRatio(trainX);
    const calibEl = root.querySelector<HTMLElement>('[data-calib-x]');
    if (calibEl) calibEl.textContent = fmtRatio(calibX);

    const field = root.querySelector<HTMLElement>('[data-field]');
    if (!field) return;

    const camera = (progress: number): CameraState => {
      const t = ease(progress);
      return {
        position: lerpVec3(LABEL_CAM_END, SPLIT_CAM_END, t),
        lookAt: lerpVec3(LABEL_LOOK_END, SPLIT_LOOK_END, t),
        fov: 52,
      };
    };

    const uniforms = (): CloudUniforms => ({
      materialize: 1,
      labelMix: 1,
      riskMix: 0,
      collapse: 0,
      collapseTarget: [0, 0, 0],
    });

    const sweep = (progress: number): SweepState => {
      const tA = windowed(progress, 0, 0.68);
      const tB = windowed(progress, 0.28, 1);
      return {
        ax: lerp(OFF_LEFT, targetA, tA),
        bx: lerp(OFF_LEFT, targetB, tB),
        aOpacity: tA,
        bOpacity: tB,
      };
    };

    const drawFlat = (flat: FlatCanvas, cloud: PointCloud, progress: number): void => {
      const palette = flatPalette();
      drawScatter(flat.ctx, cloud, {
        dotSize: 2,
        colorOf: (_x, _y, _z, label) => {
          const [r, g, b] = label >= 0.5 ? palette.fraud : palette.neutral;
          return [r, g, b, 210];
        },
      });

      const tA = windowed(progress, 0, 0.68);
      const tB = windowed(progress, 0.28, 1);
      const w = flat.ctx.canvas.width;
      const h = flat.ctx.canvas.height;
      const pad = 0.08;
      const plotX = (dataX: number): number => w * pad + dataX * w * (1 - pad * 2);

      drawSweepLine(flat.ctx, plotX(trainX), h, tA);
      drawSweepLine(flat.ctx, plotX(calibX), h, tB);
    };

    this.presence = new ScenePresence({ camera, uniforms, sweep, drawFlat });
    await this.presence.mount(field);
  }

  update(progress: number): void {
    this.presence?.update(progress);
  }

  unmount(): void {
    this.presence?.unmount();
    this.presence = null;
  }
}

function drawSweepLine(ctx: CanvasRenderingContext2D, x: number, height: number, opacity: number): void {
  if (opacity <= 0) return;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--bone').trim() || '#E8E4DA';
  ctx.lineWidth = Math.max(1, height * 0.003);
  ctx.beginPath();
  ctx.moveTo(x, height * 0.04);
  ctx.lineTo(x, height * 0.96);
  ctx.stroke();
  ctx.restore();
}

register({
  order: ORDER.split,
  id: 'split',
  create: () => new SplitSection(),
});
