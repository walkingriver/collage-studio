// @ts-check
// Creates the hidden SVG color-matrix filters that canvas `filter: url(#...)` points at.

import { warmthMatrix } from './adjust.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
/** @type {SVGDefsElement|null} */
let defs = null;

/**
 * Returns a `url(#id)` reference to a warmth filter, creating it on first use.
 * @param {number} w  rounded warmth (-1..1)
 */
export function warmthUrl(w) {
  const id = `cs-warm-${Math.round(w * 100)}`;
  if (!defs) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.position = 'absolute';
    defs = document.createElementNS(SVG_NS, 'defs');
    svg.appendChild(defs);
    document.body.appendChild(svg);
  }
  if (!document.getElementById(id)) {
    const filter = document.createElementNS(SVG_NS, 'filter');
    filter.id = id;
    filter.setAttribute('color-interpolation-filters', 'sRGB');
    const m = document.createElementNS(SVG_NS, 'feColorMatrix');
    m.setAttribute('type', 'matrix');
    m.setAttribute('values', warmthMatrix(w));
    filter.appendChild(m);
    defs.appendChild(filter);
  }
  return `url(#${id})`;
}
