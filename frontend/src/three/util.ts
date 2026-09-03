/*
 * util.ts
 *
 * Small pure helpers shared by the scene and by every section that drives it.
 * Nothing here reads the clock or keeps state: none of it would survive
 * the purity rule in section.ts otherwise.
 */

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Smoothstep. Cheap, and it is the only easing curve this scene needs. */
export function ease(t: number): number {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export type Vec3 = readonly [number, number, number];

export function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/**
 * Remaps progress into a sub-window of a section, eased. Several sections
 * choreograph more than one thing across their 0..1 span (a camera move and a
 * reveal that starts a little later, say) and every one of those windows has
 * to be a pure function of the single incoming progress value.
 */
export function windowed(progress: number, start: number, end: number): number {
  if (end <= start) return progress >= end ? 1 : 0;
  return ease((progress - start) / (end - start));
}
