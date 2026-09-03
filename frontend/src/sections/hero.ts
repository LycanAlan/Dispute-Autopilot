/*
 * hero.ts
 *
 * Section 1. The point cloud materialises out of nothing while the camera
 * drifts, and the honest caption sits right next to the headline figure:
 * the buffer holds a sample, and the page says so next to the real total.
 */
import type { PointCloud } from '../core/data';
import { ORDER, register } from '../core/registry';
import type { Section, Snapshot } from '../core/section';
import { fmtInt } from '../three/format';
import { drawScatter, type FlatCanvas } from '../three/flat';
import { flatPalette, indexHash } from '../three/palette-map';
import { ScenePresence } from '../three/presence';
import type { CameraState, CloudUniforms, SweepState } from '../three/scene';
import { ease, lerpVec3, windowed, type Vec3 } from '../three/util';

import '../three/scene-layout.css';
import './hero.css';

const CAM_START: Vec3 = [-1.6, 3.7, 23.5];
const LOOK_START: Vec3 = [0, 1.3, 0];

// Exported so label.ts can pick the camera up exactly where hero leaves it,
// rather than approximating the same numbers a second time.
export const HERO_CAM_END: Vec3 = [1.3, 2.05, 13];
export const HERO_LOOK_END: Vec3 = [0, 1.0, 0];
const CAM_END = HERO_CAM_END;
const LOOK_END = HERO_LOOK_END;

// Materialisation finishes with a beat of pure drift left in the runway, so
// the section does not feel like it is still "loading" right up to the exit.
const MATERIALIZE_END = 0.72;

function camera(progress: number): CameraState {
  const t = ease(progress);
  return {
    position: lerpVec3(CAM_START, CAM_END, t),
    lookAt: lerpVec3(LOOK_START, LOOK_END, t),
    fov: 50,
  };
}

function uniforms(progress: number): CloudUniforms {
  return {
    materialize: windowed(progress, 0, MATERIALIZE_END),
    labelMix: 0,
    riskMix: 0,
    collapse: 0,
    collapseTarget: [0, 0, 0],
  };
}

function sweep(): SweepState {
  return { ax: -100, bx: -100, aOpacity: 0, bOpacity: 0 };
}

function drawFlat(flat: FlatCanvas, cloud: PointCloud, progress: number): void {
  const palette = flatPalette();
  const reveal = windowed(progress, 0, MATERIALIZE_END);
  drawScatter(flat.ctx, cloud, {
    dotSize: 2,
    colorOf: (_x, _y, _z, _label, index) => {
      const h = indexHash(index);
      if (h > reveal) return [0, 0, 0, 0];
      const [r, g, b] = palette.neutral;
      return [r, g, b, 205];
    },
  });
}

class HeroSection implements Section {
  readonly id = 'hero';
  readonly needsScene = true;

  private presence: ScenePresence | null = null;

  async mount(root: HTMLElement, data: Snapshot): Promise<void> {
    root.classList.add('on-charcoal', 'section--runway', 'hero');
    root.style.height = '260svh';

    root.innerHTML = `
      <div class="section__stage">
        <div class="scene-field" data-field></div>
        <div class="scene-overlay hero__overlay">
          <div class="hero__lockup">
            <h1 class="display hero__title">Dispute Autopilot</h1>
            <p class="lede hero__subtitle">
              Three-stage chargeback loss prevention for Razorpay merchants.<br />
              Predict the risk, preserve the evidence, decide on expected value.
            </p>
          </div>
          <div class="hero__foot">
            <div class="hero__stat">
              <span class="figure-num" data-n-total>0</span>
              <span class="small hero__stat-label">transactions</span>
            </div>
            <p class="micro hero__caption" data-caption></p>
            <p class="micro hero__cue">Scroll.</p>
          </div>
        </div>
      </div>
    `;

    const totalEl = root.querySelector<HTMLElement>('[data-n-total]');
    if (totalEl) totalEl.textContent = fmtInt(data.n_total);

    const captionEl = root.querySelector<HTMLElement>('[data-caption]');
    if (captionEl) {
      captionEl.textContent =
        fmtInt(data.n_sampled) + ' of them drawn here, sampled evenly across time.';
    }

    const field = root.querySelector<HTMLElement>('[data-field]');
    if (!field) return;

    this.presence = new ScenePresence({ camera: (p) => camera(p), uniforms: (p) => uniforms(p), sweep, drawFlat });
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

register({
  order: ORDER.hero,
  id: 'hero',
  create: () => new HeroSection(),
});
