/*
 * format.ts
 *
 * Every number on these five sections is read from the snapshot at runtime
 * and formatted here, never typed into markup. See eval/check_site.py,
 * which scans the built strings for exactly that mistake.
 */

export function fmtInt(n: number): string {
  return n.toLocaleString('en-US');
}

export function fmtPct(x: number, digits = 1): string {
  return (x * 100).toFixed(digits) + '%';
}

export function fmtRatio(x: number, digits = 3): string {
  return x.toFixed(digits);
}
