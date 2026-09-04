/*
 * presence.ts
 *
 * What sections 1 to 5 have in common: a 2D canvas sized to the section's
 * field, redrawn from the same progress-derived state whenever the section's
 * own element becomes visible.
 *
 * The re-draw on visibility is still worth keeping now that each section owns
 * its own canvas rather than sharing one. engine.ts has two paths that call
 * every registered section's update() once, back to back: the first frame
 * after mount, and the whole of ?still=1. A canvas whose container was still
 * being sized when its one draw call landed would otherwise stay blank for the
 * rest of the page's life. Redrawing when the element is actually visible is
 * what makes ?section=<id> and a fresh page load both correct.
 *
 * Every hook here must stay a pure function of progress (and the constant
 * cloud), for the same reason update() itself has to be: same progress,
 * same scene state, on every call.
 */
import type { PointCloud } from '../core/data';
import { loadPoints } from '../core/data';

import { mountFlatCanvas, type FlatCanvas } from './flat';
import type { CameraState, CloudUniforms, SweepState } from './scene';
import { onVisible } from './visibility';

export interface ScenePresenceHooks {
  camera(progress: number, cloud: PointCloud): CameraState;
  uniforms(progress: number, cloud: PointCloud): CloudUniforms;
  sweep(progress: number, cloud: PointCloud): SweepState;
  drawFlat(flat: FlatCanvas, cloud: PointCloud, progress: number): void;
}

export class ScenePresence {
  private cloud: PointCloud | null = null;
  private flat: FlatCanvas | null = null;
  private field: HTMLElement | null = null;
  private lastProgress = 0;
  private stopObserving: (() => void) | null = null;

  constructor(private readonly hooks: ScenePresenceHooks) {}

  async mount(field: HTMLElement): Promise<void> {
    this.field = field;
    this.cloud = await loadPoints();

    // ALWAYS the 2D canvas now. WebGL is no longer used by any section.
    //
    // The author's verdict on the three-dimensional panel was that it "does
    // nothing and does not provide anything to the project", and looking at it
    // honestly, that is right. The third dimension carried predicted risk,
    // which colour already carries; what the extra axis actually bought was a
    // portrait-shaped box competing with the prose for horizontal space, a
    // shader, a resize observer, a render loop, and a GPU stall warning during
    // every screen recording.
    //
    // The same data reads better as a wide, short ribbon: time is the long
    // axis of this dataset and amount is the short one, so the ribbon is the
    // shape the data already had. Every section had a drawFlat() written for
    // ?flat=1, and those were verified working, so this promotes a tested path
    // to be the only path rather than introducing a new one.
    //
    // scene.ts is still imported for its types, and Three.js is still in
    // package.json. Dropping the dependency is a separate change with its own
    // verification, and the day before a deadline is the wrong time to bundle
    // the two together.
    this.flat = mountFlatCanvas(field);

    this.stopObserving = onVisible(field, () => this.apply(this.lastProgress));
    this.apply(this.lastProgress);
  }

  update(progress: number): void {
    this.lastProgress = progress;
    this.apply(progress);
  }

  private apply(progress: number): void {
    const cloud = this.cloud;
    if (!cloud || !this.field) return;

    if (this.flat) this.hooks.drawFlat(this.flat, cloud, progress);
  }

  unmount(): void {
    this.stopObserving?.();
    this.stopObserving = null;
    this.flat?.destroy();
    this.flat = null;
  }
}
