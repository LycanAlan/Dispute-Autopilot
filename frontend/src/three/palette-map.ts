/*
 * palette-map.ts
 *
 * The flat 2D canvas path cannot run the WebGL shader, so this is its plain
 * JavaScript equivalent: the same three ideas (a neutral/fraud remap, a
 * three stop risk ramp, a deterministic per point reveal) implemented as
 * functions over bytes instead of a GLSL program, reading the same palette.
 */
import { mixRGB, readPalette, toRGB, type RGB } from './colors';

export interface FlatPalette {
  neutral: RGB;
  fraud: RGB;
  low: RGB;
  mid: RGB;
  high: RGB;
}

let cached: FlatPalette | null = null;

export function flatPalette(): FlatPalette {
  if (cached) return cached;
  const p = readPalette();
  cached = {
    neutral: toRGB(p.bone),
    fraud: toRGB(p.accept),
    low: toRGB(p.contest),
    mid: toRGB(p.review),
    high: toRGB(p.accept),
  };
  return cached;
}

export function riskRGB(risk: number, palette: FlatPalette): RGB {
  return risk < 0.5
    ? mixRGB(palette.low, palette.mid, risk * 2)
    : mixRGB(palette.mid, palette.high, (risk - 0.5) * 2);
}

export function labelRGB(label: number, palette: FlatPalette): RGB {
  return label >= 0.5 ? palette.fraud : palette.neutral;
}

/**
 * A cheap deterministic 0..1 value per point index, standing in for the
 * shader's position based hash. Same index, same value, every call: the
 * flat path's materialise and collapse stagger both need that.
 */
export function indexHash(index: number): number {
  const x = Math.sin(index * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}
