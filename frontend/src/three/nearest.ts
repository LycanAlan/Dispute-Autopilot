/*
 * nearest.ts
 *
 * points.bin holds a stratified sample of 100,000 out of 590,540 rows, so a
 * specific row from snapshot.json (case 'contest' is row 7) is not
 * guaranteed to be one of the sampled points. Rather than invent a position
 * for a point that was never drawn, the zoom section collapses toward
 * whichever sampled point actually sits closest to that row's known time and
 * risk. This is the shared search both the WebGL and the flat canvas path
 * use, so they agree on the same target point.
 */
import type { PointCloud } from '../core/data';

export interface Sample {
  x: number;
  y: number;
  z: number;
  label: number;
  index: number;
}

export function findNearestSample(cloud: PointCloud, dataX: number, dataZ: number): Sample {
  const raw = cloud.data;
  const stride = cloud.stride;
  let bestIndex = 0;
  let bestDist = Infinity;

  for (let i = 0; i < cloud.count; i += 1) {
    const o = i * stride;
    const dx = (raw[o] ?? 0) - dataX;
    const dz = (raw[o + 2] ?? 0) - dataZ;
    const dist = dx * dx + dz * dz;
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = i;
    }
  }

  const o = bestIndex * stride;
  return {
    x: raw[o] ?? 0,
    y: raw[o + 1] ?? 0,
    z: raw[o + 2] ?? 0,
    label: raw[o + 3] ?? 0,
    index: bestIndex,
  };
}
