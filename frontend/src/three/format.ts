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

/**
 * Rupees, grouped the Indian way (lakh and crore), rounded to whole rupees.
 *
 * live.ts, measured.ts and pipeline.ts each grew their own copy of this line
 * before it was worth sharing. Those three are left alone on purpose: they
 * work, they are verified, and the day before a deadline is the wrong time to
 * touch three working sections to save a line each. New callers use this one.
 */
export function fmtInr(v: number): string {
  const rounded = Math.round(v);
  const sign = rounded < 0 ? '-' : '';
  return sign + '₹' + Math.abs(rounded).toLocaleString('en-IN');
}
