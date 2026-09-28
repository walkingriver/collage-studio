// @ts-check
// Makes sure bundled fonts are loaded before drawing text on a canvas.

import { FONTS } from './font-catalog.js';

/** @typedef {import('./model.js').Project} Project */
/** @typedef {import('./model.js').TextStyle} TextStyle */

/** @param {Project} doc @returns {TextStyle[]} */
function stylesIn(doc) {
  const out = [];
  for (const p of doc.pages) {
    for (const c of p.cells) if (c.content?.kind === 'text') out.push(c.content.style);
    for (const b of p.textBoxes) out.push(b.style);
  }
  return out;
}

/** @param {TextStyle} s */
function spec(s) {
  return `${s.italic ? 'italic ' : ''}${s.bold ? 700 : 400} 20px "${s.font}"`;
}

/**
 * Loads every font face the document uses.
 * @param {Project} doc
 */
export async function ensureFontsFor(doc) {
  const specs = new Set(stylesIn(doc).map(spec));
  await Promise.all([...specs].map((s) => document.fonts.load(s).catch(() => [])));
}

/** Loads the regular face of every bundled font (for font-picker previews). */
export function loadAllFonts() {
  return Promise.all(FONTS.map((f) => document.fonts.load(`400 20px "${f.family}"`).catch(() => [])));
}
