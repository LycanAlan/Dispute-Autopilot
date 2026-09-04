/*
 * label.ts
 *
 * Section 2. The cloud is already fully drawn by the time this section
 * starts; all it does is remap colour from neutral to the isFraud label,
 * while the copy explains what that label actually is (and is not).
 */
import type { PointCloud } from '../core/data';
import { ORDER, register } from '../core/registry';
import type { Section, Snapshot } from '../core/section';
import { mixRGB } from '../three/colors';
import { drawScatter, type FlatCanvas } from '../three/flat';
import { flatPalette, labelRGB } from '../three/palette-map';
import { ScenePresence } from '../three/presence';
import type { CameraState, CloudUniforms, SweepState } from '../three/scene';
import { ease, lerpVec3, type Vec3 } from '../three/util';

import { HERO_CAM_END, HERO_LOOK_END } from './hero';

import '../three/scene-layout.css';
import './label.css';

// Continues the drift hero left off at, rather than cutting to a new angle.
export const LABEL_CAM_END: Vec3 = [1.9, 2.35, 10.4];
export const LABEL_LOOK_END: Vec3 = [0, 1.15, 0];

function camera(progress: number): CameraState {
  const t = ease(progress);
  return {
    position: lerpVec3(HERO_CAM_END, LABEL_CAM_END, t),
    lookAt: lerpVec3(HERO_LOOK_END, LABEL_LOOK_END, t),
    fov: 50,
  };
}

function uniforms(progress: number): CloudUniforms {
  return {
    materialize: 1,
    labelMix: ease(progress),
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
  const t = ease(progress);
  drawScatter(flat.ctx, cloud, {
    dotSize: 2,
    colorOf: (_x, _y, _z, label) => {
      const [r, g, b] = mixRGB(palette.neutral, labelRGB(label, palette), t);
      return [r, g, b, 210];
    },
  });
}

class LabelSection implements Section {
  readonly id = 'label';
  readonly needsScene = true;

  private presence: ScenePresence | null = null;

  async mount(root: HTMLElement, _data: Snapshot): Promise<void> {
    root.classList.add('on-charcoal', 'section--runway', 'label-section');
    root.style.height = '220svh';

    root.innerHTML = `
      <div class="section__stage">
        <div class="scene-field" data-field data-scene-caption="colour: chargeback reported within 120 days"></div>
        <div class="scene-overlay">
          <div class="label-section__lockup">
            <div class="ruled-kicker"><span class="kicker">The label</span></div>
            <h2 class="title label-section__head">isFraud does not mean fraud</h2>
            <div class="prose label-section__body">
              <p>
                In IEEE-CIS it means a chargeback was reported within 120 days.
                Nothing in the data separates a stolen card from a customer who
                changed their mind.
              </p>
              <p>
                So this predicts chargebacks. Calling it a fraud detector would
                be the first lie, and every downstream number would inherit it.
              </p>
            </div>
          </div>
        </div>
      </div>
    `;

    const field = root.querySelector<HTMLElement>('[data-field]');
    if (!field) return;

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

register({
  order: ORDER.label,
  id: 'label',
  create: () => new LabelSection(),
});
