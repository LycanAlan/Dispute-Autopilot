/*
 * zoom.ts
 *
 * Section 5. All 100,000 points collapse toward one, the sampled point
 * nearest to case 'contest' (row 7) by time and by risk. points.bin is a
 * stratified sample, so row 7 itself is not guaranteed to be in it; this
 * collapses toward the real drawn point that sits closest to it rather than
 * inventing a position for a row that was never sampled.
 */
import type { PointCloud } from '../core/data';
import { ORDER, register } from '../core/registry';
import type { Section, Snapshot } from '../core/section';
import { drawScatter, type FlatCanvas } from '../three/flat';
import { flatPalette, riskRGB } from '../three/palette-map';
import { findNearestSample } from '../three/nearest';
import { ScenePresence } from '../three/presence';
import type { CameraState, CloudUniforms, SweepState } from '../three/scene';
import { toWorld, WORLD } from '../three/scene';
import { ease, lerpVec3, windowed, type Vec3 } from '../three/util';
import { loadPoints } from '../core/data';

import { MODEL_CAM_END, MODEL_LOOK_END } from './model';

import '../three/scene-layout.css';
import './zoom.css';

class ZoomSection implements Section {
  readonly id = 'zoom';
  readonly needsScene = true;

  private presence: ScenePresence | null = null;
  private setReveal: ((progress: number) => void) | null = null;

  async mount(root: HTMLElement, data: Snapshot): Promise<void> {
    root.classList.add('on-charcoal', 'section--runway', 'zoom-section');
    root.style.height = '220svh';

    const targetA = (data.split.train_end_x - 0.5) * WORLD.width;
    const targetB = (data.split.calib_end_x - 0.5) * WORLD.width;

    const contest = data.cases.contest;
    const transactionId = contest.casefile.transaction_id;
    const action = contest.decision.action;

    // row 7 out of n_total, ordered in time: close enough to the very start
    // of the axis that a linear row fraction is an honest stand-in for its
    // exact timestamp, which the snapshot does not carry.
    const approxDataX = data.n_total > 0 ? contest.row / data.n_total : 0;
    const approxDataZ = contest.decision.p_chargeback;

    root.innerHTML = `
      <div class="section__stage">
        <div class="scene-field" data-field data-scene-axis="one record" data-scene-caption="narrowing to the nearest sampled record to row 7"></div>
        <div class="scene-overlay">
          <div class="zoom-section__lockup" data-lockup>
            <span class="pill is-${action.toLowerCase()}" data-badge>${action}</span>
            <h2 class="title zoom-section__head">Now just one of them.</h2>
            <div class="prose zoom-section__body">
              <p>
                Transaction <span class="num" data-txn></span>. The money is
                already gone. The bank took it back this morning.
              </p>
              <p>You have about a week to decide what to do about it.</p>
            </div>
          </div>
        </div>
      </div>
    `;

    const txnEl = root.querySelector<HTMLElement>('[data-txn]');
    if (txnEl) txnEl.textContent = String(transactionId);

    const lockup = root.querySelector<HTMLElement>('[data-lockup]');
    const field = root.querySelector<HTMLElement>('[data-field]');
    if (!field) return;

    // The nearest-sample search needs the decoded cloud. loadPoints() is
    // cached in core/data.ts, so this costs nothing beyond the first call
    // any section already made; it does not trigger a second fetch.
    const cloud = await loadPoints();
    const sample = findNearestSample(cloud, approxDataX, approxDataZ);
    const collapseWorld: Vec3 = toWorld(sample.x, sample.y, sample.z);
    const collapseDataX = sample.x;
    const collapseDataY = sample.y;

    const camEnd: Vec3 = [
      collapseWorld[0] + 0.55,
      collapseWorld[1] + 0.4,
      collapseWorld[2] + 1.5,
    ];
    const lookEnd: Vec3 = collapseWorld;

    const camera = (progress: number): CameraState => {
      const t = ease(progress);
      return {
        position: lerpVec3(MODEL_CAM_END, camEnd, t),
        lookAt: lerpVec3(MODEL_LOOK_END, lookEnd, t),
        fov: 42,
      };
    };

    const uniforms = (progress: number): CloudUniforms => ({
      materialize: 1,
      labelMix: 1,
      riskMix: 1,
      collapse: ease(progress),
      collapseTarget: collapseWorld,
    });

    const sweep = (progress: number): SweepState => {
      const fade = 1 - windowed(progress, 0, 0.4);
      return { ax: targetA, bx: targetB, aOpacity: fade, bOpacity: fade };
    };

    const drawFlat = (flat: FlatCanvas, cloud2: PointCloud, progress: number): void => {
      const palette = flatPalette();
      const t = ease(progress);
      drawScatter(flat.ctx, cloud2, {
        dotSize: 2,
        collapseTo: { x: collapseDataX, y: collapseDataY, amount: t },
        colorOf: (_x, _y, z) => {
          const [r, g, b] = riskRGB(z, palette);
          return [r, g, b, 210];
        },
      });
    };

    this.presence = new ScenePresence({ camera, uniforms, sweep, drawFlat });
    await this.presence.mount(field);

    this.setReveal = (progress: number): void => {
      const reveal = windowed(progress, 0.32, 0.88);
      if (lockup) {
        lockup.style.opacity = String(reveal);
        lockup.style.transform = 'translateY(' + ((1 - reveal) * 12).toFixed(2) + 'px)';
      }
    };
    this.setReveal(0);
  }

  update(progress: number): void {
    this.presence?.update(progress);
    this.setReveal?.(progress);
  }

  unmount(): void {
    this.presence?.unmount();
    this.presence = null;
    this.setReveal = null;
  }
}

register({
  order: ORDER.zoom,
  id: 'zoom',
  create: () => new ZoomSection(),
});
