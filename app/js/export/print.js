// @ts-check
// Print and "Save as PDF": each page is rendered at 300 DPI and handed to the system
// print dialog at its exact paper size (CSS @page).

import { rasterizePage, canvasToBlob, releaseCanvas } from './raster.js';
import { PT_PER_IN } from '../page-sizes.js';

/** @typedef {import('../model.js').Project} Project */
/** @typedef {import('../model.js').Page} Page */

const PRINT_DPI = 300;

/**
 * @param {Project} doc
 * @param {Page[]} pages
 * @param {import('../images.js').PhotoLibrary} photos
 * @param {(done: number, total: number) => void} [onProgress]
 */
export async function printPages(doc, pages, photos, onProgress) {
  const root = /** @type {HTMLElement} */ (document.getElementById('print-root'));
  const wIn = doc.pageSize.wPt / PT_PER_IN, hIn = doc.pageSize.hPt / PT_PER_IN;
  /** @type {string[]} */
  const urls = [];
  const style = document.createElement('style');
  style.textContent = `@page { size: ${wIn}in ${hIn}in; margin: 0; }
    @media print { .print-root img { width: ${wIn}in; height: ${hIn}in; } }`;

  const title = document.title;
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    root.innerHTML = '';
    style.remove();
    document.title = title;
    urls.forEach((u) => URL.revokeObjectURL(u));
    removeEventListener('afterprint', cleanup);
  };

  root.innerHTML = '';
  try {
    for (let i = 0; i < pages.length; i++) {
      onProgress?.(i, pages.length);
      const canvas = await rasterizePage(doc, pages[i], PRINT_DPI, photos);
      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.95);
      releaseCanvas(canvas);
      const url = URL.createObjectURL(blob);
      urls.push(url);
      const img = new Image();
      img.alt = '';
      img.src = url;
      root.appendChild(img);
      await img.decode();
    }
    onProgress?.(pages.length, pages.length);
    document.head.appendChild(style);
    // The file name offered by "Save as PDF" comes from the page title.
    document.title = doc.title || 'Collage';
    addEventListener('afterprint', cleanup);
    window.print();
  } catch (e) {
    cleanup();
    throw e;
  }
}
