// @ts-check
// Photo color adjustments expressed as a canvas `filter` string.
// Warmth has no CSS filter function, so it is an SVG color matrix referenced with url(#id).

/** @typedef {import('./model.js').Adjust} Adjust */

/**
 * SVG feColorMatrix values that warm (w > 0) or cool (w < 0) an image.
 * @param {number} w  -1..1
 */
export function warmthMatrix(w) {
  const r = 1 + 0.18 * w, g = 1 + 0.04 * w, b = 1 - 0.18 * w;
  return `${r} 0 0 0 0  0 ${g} 0 0 0  0 0 ${b} 0 0  0 0 0 1 0`;
}

/** Rounds warmth so similar values share one SVG filter. @param {number} w */
export function warmthKey(w) {
  return Math.round(w * 20) / 20;
}

/**
 * Canvas filter for an adjustment set, or 'none'.
 * @param {Adjust} a
 * @param {(w: number) => string} [warmthUrl]  returns `url(#...)` for a warmth value
 */
export function filterString(a, warmthUrl) {
  const parts = [];
  const w = warmthKey(a.warmth);
  if (w && warmthUrl) parts.push(warmthUrl(w));
  if (a.brightness) parts.push(`brightness(${fmt(1 + a.brightness * 0.5)})`);
  if (a.contrast) parts.push(`contrast(${fmt(1 + a.contrast * 0.5)})`);
  if (a.saturation) parts.push(`saturate(${fmt(1 + a.saturation)})`);
  if (a.preset === 'bw') parts.push('grayscale(1)');
  if (a.preset === 'sepia') parts.push('sepia(0.85)');
  return parts.length ? parts.join(' ') : 'none';
}

/** Stable cache key for an adjustment set. @param {Adjust} a */
export function adjustKey(a) {
  return [a.brightness, a.contrast, a.saturation, warmthKey(a.warmth), a.preset].map((v) => (typeof v === 'number' ? fmt(v) : v)).join('|');
}

/** @param {number} n */
function fmt(n) {
  return String(Math.round(n * 1000) / 1000);
}
