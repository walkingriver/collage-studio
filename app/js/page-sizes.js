// @ts-check
// Page size presets. All geometry in the app is in points (1/72 inch).

export const PT_PER_IN = 72;
export const PT_PER_CM = 72 / 2.54;

/** @typedef {{id: string, name: string, wIn: number, hIn: number, group: 'Paper'|'Photo'|'Square'}} PagePreset */

/** @type {PagePreset[]} */
export const PAGE_PRESETS = [
  { id: 'letter', name: 'US Letter', wIn: 8.5, hIn: 11, group: 'Paper' },
  { id: 'legal', name: 'US Legal', wIn: 8.5, hIn: 14, group: 'Paper' },
  { id: 'tabloid', name: 'Tabloid', wIn: 11, hIn: 17, group: 'Paper' },
  { id: 'a4', name: 'A4', wIn: 210 / 25.4, hIn: 297 / 25.4, group: 'Paper' },
  { id: 'a5', name: 'A5', wIn: 148 / 25.4, hIn: 210 / 25.4, group: 'Paper' },
  { id: '4x6', name: '4 × 6 photo', wIn: 4, hIn: 6, group: 'Photo' },
  { id: '5x7', name: '5 × 7 photo', wIn: 5, hIn: 7, group: 'Photo' },
  { id: '8x10', name: '8 × 10 photo', wIn: 8, hIn: 10, group: 'Photo' },
  { id: '11x14', name: '11 × 14 print', wIn: 11, hIn: 14, group: 'Photo' },
  { id: '8x8', name: '8 × 8 square', wIn: 8, hIn: 8, group: 'Square' },
  { id: '12x12', name: '12 × 12 scrapbook', wIn: 12, hIn: 12, group: 'Square' },
];

export const DEFAULT_PRESET_ID = 'letter';

/**
 * @typedef {{presetId: string, name: string, wPt: number, hPt: number}} PageSize
 * wPt/hPt already reflect orientation.
 */

/**
 * @param {string} presetId
 * @param {'portrait'|'landscape'} orientation
 * @returns {PageSize}
 */
export function pageSizeFromPreset(presetId, orientation = 'portrait') {
  const p = PAGE_PRESETS.find((x) => x.id === presetId) ?? PAGE_PRESETS[0];
  return orient({ presetId: p.id, name: p.name, wPt: round2(p.wIn * PT_PER_IN), hPt: round2(p.hIn * PT_PER_IN) }, orientation);
}

/**
 * @param {number} w
 * @param {number} h
 * @param {'in'|'cm'} unit
 * @returns {PageSize}
 */
export function customPageSize(w, h, unit = 'in') {
  const k = unit === 'cm' ? PT_PER_CM : PT_PER_IN;
  return { presetId: 'custom', name: 'Custom', wPt: round2(w * k), hPt: round2(h * k) };
}

/**
 * @param {PageSize} size
 * @param {'portrait'|'landscape'} orientation
 * @returns {PageSize}
 */
export function orient(size, orientation) {
  const long = Math.max(size.wPt, size.hPt), short = Math.min(size.wPt, size.hPt);
  return orientation === 'landscape' ? { ...size, wPt: long, hPt: short } : { ...size, wPt: short, hPt: long };
}

/**
 * @param {PageSize} size
 * @returns {'portrait'|'landscape'}
 */
export function orientationOf(size) {
  return size.wPt > size.hPt ? 'landscape' : 'portrait';
}

/** Human label like `8.5 × 11 in`. @param {PageSize} size */
export function describeSize(size) {
  const fmt = (/** @type {number} */ pt) => String(Math.round((pt / PT_PER_IN) * 100) / 100);
  return `${fmt(size.wPt)} × ${fmt(size.hPt)} in`;
}

/** @param {number} n */
function round2(n) {
  return Math.round(n * 100) / 100;
}
