// @ts-check
// Text layout: word wrapping, shrink-to-fit and alignment. Pure; the caller supplies `measure`.

/** @typedef {import('./model.js').TextStyle} TextStyle */
/** @typedef {(text: string, font: string) => number} Measure */

/**
 * CSS/canvas font shorthand. Canvas units are points in this app, so `px` here means points.
 * @param {TextStyle} style
 * @param {number} sizePt
 */
export function fontString(style, sizePt) {
  return `${style.italic ? 'italic ' : ''}${style.bold ? 700 : 400} ${round(sizePt)}px "${style.font}", sans-serif`;
}

/**
 * Greedy word wrap. Honors explicit newlines and breaks words longer than a line.
 * @param {string} text
 * @param {number} maxW
 * @param {string} font
 * @param {Measure} measure
 * @returns {string[]}
 */
export function wrapText(text, maxW, font, measure) {
  const lines = [];
  for (const para of String(text).split(/\r?\n/)) {
    const words = para.split(/ +/).filter(Boolean);
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate, font) <= maxW) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      if (measure(word, font) <= maxW) {
        line = word;
        continue;
      }
      // Break an over-long word into pieces that fit.
      let piece = '';
      for (const ch of word) {
        if (piece && measure(piece + ch, font) > maxW) {
          lines.push(piece);
          piece = '';
        }
        piece += ch;
      }
      line = piece;
    }
    lines.push(line);
  }
  return lines;
}

/**
 * @typedef {object} TextLayout
 * @property {string[]} lines
 * @property {number} sizePt  the size actually used (may be smaller when shrunk to fit)
 * @property {string} font
 * @property {number} lineH
 * @property {number} textH  height of all lines
 * @property {number} pad
 */

/**
 * Lays text out inside a box.
 * @param {string} text
 * @param {TextStyle} style
 * @param {number} w  box width
 * @param {number|null} h  box height, or null for auto-height boxes
 * @param {Measure} measure
 * @param {{pad?: number}} [opts]
 * @returns {TextLayout}
 */
export function layoutText(text, style, w, h, measure, opts = {}) {
  const pad = opts.pad ?? (h === null ? 4 : Math.min(18, Math.min(w, h) * 0.06));
  const innerW = Math.max(1, w - pad * 2);
  const words = String(text).split(/\s+/).filter(Boolean);
  let size = Math.max(4, style.sizePt);
  for (;;) {
    const font = fontString(style, size);
    const lines = wrapText(text, innerW, font, measure);
    const lineH = size * style.lineHeight;
    const textH = lines.length * lineH;
    // Slots shrink until the text fits without splitting words; boxes grow instead.
    const fits = h === null || (textH <= h - pad * 2 && words.every((wd) => measure(wd, font) <= innerW));
    if (fits || size <= 6) return { lines, sizePt: size, font, lineH, textH, pad };
    size = Math.max(6, size * 0.92);
  }
}

/**
 * Height of an auto-height text box.
 * @param {TextLayout} layout
 */
export function autoHeight(layout) {
  return layout.textH + layout.pad * 2;
}

/**
 * Baseline-free placement of each line (canvas uses textBaseline 'middle').
 * @param {TextLayout} layout
 * @param {TextStyle} style
 * @param {{x: number, y: number, w: number, h: number}} box
 * @returns {Array<{text: string, x: number, y: number}>}
 */
export function positionLines(layout, style, box) {
  const { lines, lineH, textH, pad } = layout;
  const innerH = box.h - pad * 2;
  let top = box.y + pad;
  if (style.vAlign === 'middle') top += (innerH - textH) / 2;
  else if (style.vAlign === 'bottom') top += innerH - textH;
  const x = style.align === 'left' ? box.x + pad : style.align === 'right' ? box.x + box.w - pad : box.x + box.w / 2;
  return lines.map((text, i) => ({ text, x, y: top + lineH * i + lineH / 2 }));
}

/** @param {number} n */
function round(n) {
  return Math.round(n * 100) / 100;
}
