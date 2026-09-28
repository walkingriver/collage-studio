// @ts-check
// Renders a page at print resolution using the full-quality photos.

import { renderPage } from '../render.js';
import { frameRect, photoPlacement } from '../geometry.js';
import { ensureFontsFor } from '../fonts.js';
import { warmthUrl } from '../filters-dom.js';

/** @typedef {import('../model.js').Project} Project */
/** @typedef {import('../model.js').Page} Page */
/** @typedef {import('../images.js').PhotoLibrary} PhotoLibrary */

/**
 * @param {Project} doc
 * @param {Page} page
 * @param {number} dpi
 * @param {PhotoLibrary} photos
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function rasterizePage(doc, page, dpi, photos) {
  await ensureFontsFor(doc);
  const k = dpi / 72;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(doc.pageSize.wPt * k);
  canvas.height = Math.round(doc.pageSize.hPt * k);
  // Hidden but attached, so canvas `filter: url(#...)` can find the SVG filters.
  canvas.style.cssText = 'position:fixed;left:-99999px;top:0;width:1px;height:1px';
  document.body.appendChild(canvas);

  /** @type {Map<string, ImageBitmap>} */
  const images = new Map();
  try {
    for (const cell of page.cells) {
      if (cell.content?.kind !== 'photo') continue;
      const meta = doc.photos[cell.content.photoId];
      if (!meta) continue;
      const p = photoPlacement(cell.content, meta, frameRect(page, doc.pageSize, cell));
      // Pixels needed = drawn size in points × device pixels per point (in the photo's own orientation).
      images.set(cell.id, await photos.decodeForExport(meta.id, meta.w * p.scale * k, meta.h * p.scale * k));
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(k, 0, 0, k, 0, 0);
    renderPage(ctx, doc, page, {
      pxPerPt: k,
      mode: 'export',
      getImage: (cell) => {
        const img = images.get(cell.id);
        return img ? { img, prefiltered: false } : null;
      },
      warmthUrl,
    });
    return canvas;
  } finally {
    for (const img of images.values()) img.close();
    canvas.remove();
  }
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {string} type
 * @param {number} [quality]
 * @returns {Promise<Blob>}
 */
export function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create the image. The page may be too large.'))), type, quality));
}

/** Frees a canvas's memory right away. @param {HTMLCanvasElement} canvas */
export function releaseCanvas(canvas) {
  canvas.width = canvas.height = 0;
}
