/*
 * flat.ts
 *
 * The ?flat=1 path. No WebGL, no Three.js: a plain 2D canvas that still
 * shows the point distribution, because the floor this whole site is
 * designed against is ?flat=1&still=1 rendering something legible.
 *
 * One canvas per section (cheap, and it means a section's flat drawing has
 * nothing to coordinate with any other section's). The point raster is
 * written directly into an ImageData buffer rather than one fillRect per
 * point: 100,000 individual canvas calls is the kind of thing that is fine
 * once and not fine every scroll frame, and this is the code path that has
 * to work on whatever machine loses WebGL.
 */
import type { PointCloud } from '../core/data';
import { clamp01 } from './util';

export interface FlatCanvas {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** CSS pixel size, kept current by the internal ResizeObserver. */
  width: () => number;
  height: () => number;
  destroy: () => void;
}

/** Creates a canvas sized to `container` and keeps its backing store current. */
export function mountFlatCanvas(container: HTMLElement): FlatCanvas {
  const canvas = document.createElement('canvas');
  canvas.className = 'flat-canvas';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context is unavailable');

  let cssW = 1;
  let cssH = 1;

  function resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cssW = Math.max(1, container.clientWidth);
    cssH = Math.max(1, container.clientHeight);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
  }

  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(container);

  return {
    canvas,
    ctx,
    width: () => cssW,
    height: () => cssH,
    destroy: () => observer.disconnect(),
  };
}

export interface ScatterOptions {
  /**
   * Fraction of the canvas kept clear on every side, 0..0.49.
   *
   * Defaults to 0.02. It was 0.08, chosen when this drew into a portrait
   * panel; on the wide ribbon that reserved over 200px at each end of a time
   * axis, so the data stopped well short of the dates labelling it.
   */
  padding?: number;
  /** Backing-store pixels per dot side. */
  dotSize?: number;
  /** data x, y, z (0..1 each), label (0/1), point index -> rgba 0..255. */
  colorOf: (x: number, y: number, z: number, label: number, index: number) => [number, number, number, number];
  /** Pulls every point toward (x, y) in data space by `amount`, 0..1. */
  collapseTo?: { x: number; y: number; amount: number };
}

/**
 * Rasterises the whole cloud into the canvas backing store in one pass, then
 * blits it in a single putImageData call. Points below the alpha threshold
 * are left fully transparent, so the section's own background shows through.
 */
export function drawScatter(ctx: CanvasRenderingContext2D, cloud: PointCloud, opts: ScatterOptions): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  if (w <= 0 || h <= 0) return;

  const image = ctx.createImageData(w, h);
  const data = image.data;

  const pad = clamp01(opts.padding ?? 0.02);
  const plotW = w * (1 - pad * 2);
  const plotH = h * (1 - pad * 2);
  const originX = w * pad;
  const originY = h * pad;

  const dot = Math.max(1, Math.round(opts.dotSize ?? 2));
  const half = dot >> 1;

  const raw = cloud.data;
  const stride = cloud.stride;
  const count = cloud.count;
  const collapse = opts.collapseTo;

  for (let i = 0; i < count; i += 1) {
    const o = i * stride;
    let x = raw[o] ?? 0;
    let y = raw[o + 1] ?? 0;
    const z = raw[o + 2] ?? 0;
    const label = raw[o + 3] ?? 0;

    if (collapse && collapse.amount > 0) {
      x = x + (collapse.x - x) * collapse.amount;
      y = y + (collapse.y - y) * collapse.amount;
    }

    const [r, g, b, a] = opts.colorOf(x, y, z, label, i);
    if (a <= 0) continue;

    const px = Math.round(originX + clamp01(x) * plotW);
    // Data y is amount, larger toward the top; canvas y grows downward.
    const py = Math.round(originY + (1 - clamp01(y)) * plotH);

    for (let dy = 0; dy < dot; dy += 1) {
      const py2 = py + dy - half;
      if (py2 < 0 || py2 >= h) continue;
      const rowBase = py2 * w;
      for (let dx = 0; dx < dot; dx += 1) {
        const px2 = px + dx - half;
        if (px2 < 0 || px2 >= w) continue;
        const idx = (rowBase + px2) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = a;
      }
    }
  }

  ctx.putImageData(image, 0, 0);
}
