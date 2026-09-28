// @ts-check
// Small page previews (page strip, recent projects, layout picker), drawn by the same renderer.

import { renderPage } from '../render.js';
import { newPage } from '../model.js';

/** @typedef {import('../model.js').Project} Project */
/** @typedef {import('../model.js').Page} Page */

/**
 * Draws a page into `canvas`, sized so its longer side is `maxPx` CSS pixels.
 * @param {HTMLCanvasElement} canvas
 * @param {Project} doc
 * @param {Page} page
 * @param {number} maxPx
 * @param {import('../images.js').PhotoLibrary|null} photos
 */
export function drawPageThumb(canvas, doc, page, maxPx, photos) {
  const size = doc.pageSize;
  const s = maxPx / Math.max(size.wPt, size.hPt);
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(size.wPt * s)), h = Math.max(1, Math.round(size.hPt * s));
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  const k = s * dpr;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  renderPage(ctx, doc, page, {
    pxPerPt: k,
    mode: 'thumb',
    getImage: (cell) => {
      if (!photos || cell.content?.kind !== 'photo') return null;
      const img = photos.drawable(cell.content);
      return img ? { img, prefiltered: true } : null;
    },
  });
}

/**
 * Preview of an empty layout at a page size.
 * @param {HTMLCanvasElement} canvas
 * @param {import('../page-sizes.js').PageSize} pageSize
 * @param {string} layoutId
 * @param {number} maxPx
 * @param {{marginPt?: number, gapPt?: number}} [style]
 */
export function drawLayoutThumb(canvas, pageSize, layoutId, maxPx, style = {}) {
  const page = newPage(layoutId);
  page.marginPt = style.marginPt ?? page.marginPt;
  page.gapPt = style.gapPt ?? page.gapPt;
  /** @type {Project} */
  const doc = { schemaVersion: 1, title: '', pageSize, pages: [page], photos: {} };
  drawPageThumb(canvas, doc, page, maxPx, null);
}

/**
 * Preview of a page's own slots (works for "Surprise me" layouts, which aren't in the catalog).
 * @param {HTMLCanvasElement} canvas
 * @param {Project} doc
 * @param {Page} page
 * @param {number} maxPx
 */
export function drawLayoutShapeThumb(canvas, doc, page, maxPx) {
  const empty = { ...page, cells: page.cells.map((c) => ({ ...c, content: null })), textBoxes: [] };
  drawPageThumb(canvas, { ...doc, pages: [empty] }, empty, maxPx, null);
}

/**
 * JPEG data URL of a page preview.
 * @param {Project} doc
 * @param {Page} page
 * @param {import('../images.js').PhotoLibrary} photos
 */
export function pageThumbDataUrl(doc, page, photos) {
  const c = document.createElement('canvas');
  drawPageThumb(c, doc, page, 240, photos);
  return c.toDataURL('image/jpeg', 0.75);
}
