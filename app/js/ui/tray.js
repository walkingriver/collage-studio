// @ts-check
// Bottom photo tray: every photo in the collage. Drag onto a slot, or click to place.

import { icon } from './icons.js';
import { $, esc } from './dom.js';
import { photoUsage, placePhoto } from '../model.js';
import { PHOTO_DRAG_TYPE } from '../interact/stage.js';

/** @param {import('../app.js').App} app */
export function createTray(app) {
  const el = /** @type {HTMLElement} */ ($('#tray'));
  el.innerHTML = `
    <div class="tray-actions">
      <button class="btn primary" data-a="add">${icon('image-plus', 16)} Add photos</button>
      <button class="btn" data-a="fill" title="Put unused photos into the empty slots on this page">${icon('wand-sparkles', 16)} Auto-fill</button>
    </div>
    <div class="tray-photos" role="list" aria-label="Your photos"></div>`;
  const list = /** @type {HTMLElement} */ (el.querySelector('.tray-photos'));
  /** @type {string|null} */
  let lastIds = null;

  el.addEventListener('click', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const act = t.closest('[data-a]')?.getAttribute('data-a');
    if (act === 'add') return app.actions.addPhotos(null);
    if (act === 'fill') return app.actions.autoFill();
    const item = t.closest('[data-photo]');
    if (!item) return;
    const id = item.getAttribute('data-photo');
    if (t.closest('.remove')) return app.actions.removePhotoFromProject(id);
    // Click: put it in the selected slot, or the first empty one.
    const cell = app.selectedCell;
    if (cell) {
      app.editPage((p) => placePhoto(p, cell.id, id));
    } else {
      app.actions.fillEmptyWith([id]);
    }
  });
  list.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && /** @type {HTMLElement} */ (e.target).matches('[data-photo]')) {
      e.preventDefault();
      /** @type {HTMLElement} */ (e.target).click();
    }
  });

  list.addEventListener('dragstart', (e) => {
    const item = /** @type {HTMLElement} */ (e.target).closest('[data-photo]');
    if (!item) return;
    e.dataTransfer.setData(PHOTO_DRAG_TYPE, item.getAttribute('data-photo'));
    e.dataTransfer.effectAllowed = 'copy';
    const img = item.querySelector('img');
    if (img) e.dataTransfer.setDragImage(img, img.width / 2, img.height / 2);
  });

  // Files dropped on the tray are just added (not placed).
  el.addEventListener('dragover', (e) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    el.classList.add('drop-files');
  });
  el.addEventListener('dragleave', (e) => {
    if (!el.contains(/** @type {Node} */ (e.relatedTarget))) el.classList.remove('drop-files');
  });
  el.addEventListener('drop', (e) => {
    el.classList.remove('drop-files');
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    app.actions.addPhotos([...e.dataTransfer.files], { fill: false });
  });

  function rebuild() {
    const photos = Object.values(app.doc.photos);
    if (!photos.length) {
      list.innerHTML = `<div class="tray-empty">${icon('image', 22)}<span>Your photos will appear here. Click <strong>Add photos</strong> or drag pictures from File Explorer onto the page.</span></div>`;
      return;
    }
    list.innerHTML = photos.map((p) => `
      <div class="tray-photo" role="listitem" tabindex="0" draggable="true" data-photo="${p.id}" title="${esc(p.name)} — drag onto a slot, or click to place it">
        <img alt="${esc(p.name)}" draggable="false">
        <span class="badge" hidden>${icon('check', 12)}<span></span></span>
        <button class="remove" title="Remove from collage" aria-label="Remove ${esc(p.name)}">${icon('x', 14)}</button>
      </div>`).join('');
  }

  return {
    update() {
      const ids = Object.keys(app.doc.photos).join(',');
      if (ids !== lastIds) {
        lastIds = ids;
        rebuild();
      }
      const usage = photoUsage(app.doc);
      list.querySelectorAll('[data-photo]').forEach((item) => {
        const id = item.getAttribute('data-photo');
        const img = /** @type {HTMLImageElement} */ (item.querySelector('img'));
        const url = app.photos.thumb(id);
        if (url && img.getAttribute('src') !== url) img.src = url;
        if (!url) {
          img.style.width = '120px';
          app.photos.load(id).catch(() => {});
        } else img.style.width = '';
        const n = usage.get(id) ?? 0;
        const badge = /** @type {HTMLElement} */ (item.querySelector('.badge'));
        badge.hidden = !n;
        badge.querySelector('span').textContent = n > 1 ? `×${n}` : 'Used';
      });
      el.classList.toggle('drop-remove', app.ui.trayDrop);
    },
  };
}
