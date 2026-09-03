/*
 * presence.ts
 *
 * What sections 1 to 5 have in common: claim the shared canvas or fall back
 * to a flat one, and push the same progress-derived state at the shared
 * scene again whenever this section's own element becomes visible.
 *
 * That second part exists because of how engine.ts calls update(). Most of
 * the time only the on-screen section is updated, and this class would not
 * need to do anything beyond pass the call through. But engine.ts also has
 * two paths that call every registered section's update() once, back to
 * back, in registry order: the very first frame after mount, and the whole
 * of ?still=1. After either of those, the shared scene is left holding
 * whatever the LAST scene-owning section set (zoom), even if the section
 * actually on screen is hero. See visibility.ts for the fix: each section
 * re-applies its own last-known progress the moment it is actually visible,
 * which is what makes ?section=<id> and a fresh page load both correct.
 *
 * Every hook here must stay a pure function of progress (and the constant
 * cloud), for the same reason update() itself has to be: same progress,
 * same scene state, on every call.
 */
import { flags } from '../core/engine';
import type { PointCloud } from '../core/data';
import { loadPoints } from '../core/data';

import { mountFlatCanvas, type FlatCanvas } from './flat';
import { getScene, type CameraState, type CloudUniforms, type SceneController, type SweepState } from './scene';
import { onVisible } from './visibility';

export interface ScenePresenceHooks {
  camera(progress: number, cloud: PointCloud): CameraState;
  uniforms(progress: number, cloud: PointCloud): CloudUniforms;
  sweep(progress: number, cloud: PointCloud): SweepState;
  drawFlat(flat: FlatCanvas, cloud: PointCloud, progress: number): void;
}

export class ScenePresence {
  private cloud: PointCloud | null = null;
  private scene: SceneController | null = null;
  private flat: FlatCanvas | null = null;
  private field: HTMLElement | null = null;
  private lastProgress = 0;
  private stopObserving: (() => void) | null = null;

  constructor(private readonly hooks: ScenePresenceHooks) {}

  async mount(field: HTMLElement): Promise<void> {
    this.field = field;
    this.cloud = await loadPoints();

    if (!flags.flat) {
      this.scene = getScene(this.cloud);
    }
    if (!this.scene) {
      this.flat = mountFlatCanvas(field);
    }

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

    if (this.scene) {
      this.scene.claim(this.field);
      this.scene.setCamera(this.hooks.camera(progress, cloud));
      this.scene.setUniforms(this.hooks.uniforms(progress, cloud));
      this.scene.setSweep(this.hooks.sweep(progress, cloud));
    } else if (this.flat) {
      this.hooks.drawFlat(this.flat, cloud, progress);
    }
  }

  unmount(): void {
    this.stopObserving?.();
    this.stopObserving = null;
    this.flat?.destroy();
    this.flat = null;
  }
}
