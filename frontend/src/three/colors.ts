/*
 * colors.ts
 *
 * The only place the WebGL scene is allowed to learn a colour. Every value
 * comes from a custom property in tokens.css, read at runtime with
 * getComputedStyle, so the scene can never drift from the palette the rest
 * of the page uses and can never introduce a colour tokens.css does not
 * already name.
 */
import * as THREE from 'three';

export interface Palette {
  paper: THREE.Color;
  ink: THREE.Color;
  charcoal: THREE.Color;
  bone: THREE.Color;
  contest: THREE.Color;
  review: THREE.Color;
  accept: THREE.Color;
}

const TOKENS = {
  paper: '--paper',
  ink: '--ink',
  charcoal: '--charcoal',
  bone: '--bone',
  contest: '--contest',
  review: '--review',
  accept: '--accept',
} as const;

function readToken(styles: CSSStyleDeclaration, name: string, fallbackHex: string): THREE.Color {
  const raw = styles.getPropertyValue(name).trim();
  const color = new THREE.Color();
  try {
    if (raw) {
      color.set(raw);
      return color;
    }
  } catch {
    // fall through to the fallback below
  }
  color.set(fallbackHex);
  return color;
}

// Fallbacks only fire if tokens.css failed to load at all (network off, dev
// server mid restart). They are the same hexes tokens.css defines, not new
// colours, so they cannot introduce anything the design spec did not already
// name.
const FALLBACK: Record<keyof typeof TOKENS, string> = {
  paper: '#F4F1EA',
  ink: '#17150F',
  charcoal: '#14161A',
  bone: '#E8E4DA',
  contest: '#1F6F4A',
  review: '#B5822B',
  accept: '#A54334',
};

let cached: Palette | null = null;

export type RGB = readonly [number, number, number];

/** 0..255 integer channels, for the flat canvas path (ImageData wants bytes). */
export function toRGB(color: THREE.Color): RGB {
  return [Math.round(color.r * 255), Math.round(color.g * 255), Math.round(color.b * 255)];
}

export function mixRGB(a: RGB, b: RGB, t: number): RGB {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return [
    Math.round(a[0] + (b[0] - a[0]) * c),
    Math.round(a[1] + (b[1] - a[1]) * c),
    Math.round(a[2] + (b[2] - a[2]) * c),
  ];
}

/** Reads the palette once and caches it. tokens.css does not change at runtime. */
export function readPalette(): Palette {
  if (cached) return cached;
  const styles = getComputedStyle(document.documentElement);
  cached = {
    paper: readToken(styles, TOKENS.paper, FALLBACK.paper),
    ink: readToken(styles, TOKENS.ink, FALLBACK.ink),
    charcoal: readToken(styles, TOKENS.charcoal, FALLBACK.charcoal),
    bone: readToken(styles, TOKENS.bone, FALLBACK.bone),
    contest: readToken(styles, TOKENS.contest, FALLBACK.contest),
    review: readToken(styles, TOKENS.review, FALLBACK.review),
    accept: readToken(styles, TOKENS.accept, FALLBACK.accept),
  };
  return cached;
}
