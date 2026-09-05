/*
 * section.ts
 *
 * The one interface every section implements. Each section was built against
 * this independently, so the signature below is the contract between them and
 * changing it means revisiting every file in src/sections/.
 *
 * The rule that makes the kill switches work:
 *
 *   update() must be pure with respect to progress.
 *
 * Given the same progress it produces the same visual state. No accumulating
 * counters, no reading the clock, no depending on which direction the scroll
 * came from. That is what lets ?still=1 call update(1) once and get the final
 * frame, and what makes scrubbing backwards during a take look correct.
 */

import type { Snapshot } from './data';

export interface Section {
  id: string;
  mount(root: HTMLElement, data: Snapshot): void | Promise<void>;
  update(progress: number): void;   // 0..1 within the section
  unmount(): void;
  readonly needsScene?: boolean;    // true if it drives the Three.js camera
}

// Re-exported so a section file needs one import, not two.
export type { Snapshot } from './data';
