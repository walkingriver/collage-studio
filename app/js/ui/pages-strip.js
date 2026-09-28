// @ts-check
// Left strip of page thumbnails: switch, add, duplicate, delete, drag to reorder.

import { icon } from './icons.js';
import { $ } from './dom.js';
import { drawPageThumb } from './thumbs.js';

const PAGE_DRAG_TYPE = 'application/x-collage-page';

/** @param {import('../app.js').App} app */
export function createPagesStrip(app) {
  const el = /** @type {HTMLElement} */ ($('#pages'));
  el.innerHTML = `<h2>Pages</h2><div class="page-list" style="display:flex;flex-direction:column;gap:6px"></div>
    <button class="btn block" data-add title="Add another page">${icon('plus', 16)} Add page</button>`;
  const list = /** @type {HTMLElement} */ (el.querySelector('.page-list'));
  let lastIds = '';
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let thumbTimer;
  /** @type {import('../model.js').Project|null} */
  let drawnDoc = null;

  el.querySelector('[data-add]').addEventListener('click', () => app.actions.addPage());

  list.addEventListener('click', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const item = t.closest('[data-page]');
    if (!item) return;
    const id = item.getAttribute('data-page');
    const act = t.closest('[data-act]')?.getAttribute('data-act');
    if (act === 'dup') app.actions.duplicatePage(id);
    else if (act === 'del') app.actions.deletePage(id);
    else app.goToPage(id);
  });

  // Reorder by dragging
  list.addEventListener('dragstart', (e) => {
    const item = /** @type {HTMLElement} */ (e.target).closest('[data-page]');
    if (!item) return;
    e.dataTransfer.setData(PAGE_DRAG_TYPE, item.getAttribute('data-page'));
    e.dataTransfer.effectAllowed = 'move';
  });
  const clearMarks = () => list.querySelectorAll('.drop-before, .drop-after').forEach((n) => n.classList.remove('drop-before', 'drop-after'));
  list.addEventListener('dragover', (e) => {
    if (!e.dataTransfer.types.includes(PAGE_DRAG_TYPE)) return;
    e.preventDefault();
    const item = /** @type {HTMLElement} */ (e.target).closest('[data-page]');
    clearMarks();
    if (!item) return;
    const r = item.getBoundingClientRect();
    item.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
  });
  list.addEventListener('dragleave', (e) => {
    if (!list.contains(/** @type {Node} */ (e.relatedTarget))) clearMarks();
  });
  list.addEventListener('drop', (e) => {
    const id = e.dataTransfer.getData(PAGE_DRAG_TYPE);
    const item = /** @type {HTMLElement} */ (e.target).closest('[data-page]');
    const before = item?.classList.contains('drop-before');
    clearMarks();
    if (!id || !item) return;
    e.preventDefault();
    const idx = app.doc.pages.findIndex((p) => p.id === item.getAttribute('data-page'));
    app.actions.movePage(id, before ? idx : idx + 1);
  });

  function rebuild() {
    const pages = app.doc.pages;
    list.innerHTML = pages.map((p, i) => `
      <div class="page-thumb" data-page="${p.id}" draggable="true" role="button" tabindex="0" aria-label="Page ${i + 1}">
        <canvas></canvas><span class="num">${i + 1}</span>
        <span class="actions">
          <button data-act="dup" title="Duplicate page" aria-label="Duplicate page ${i + 1}">${icon('copy', 14)}</button>
          ${pages.length > 1 ? `<button data-act="del" title="Delete page" aria-label="Delete page ${i + 1}">${icon('trash-2', 14)}</button>` : ''}
        </span>
      </div>`).join('');
    drawnDoc = null;
  }

  function drawThumbs() {
    const doc = app.doc;
    if (doc === drawnDoc) return;
    drawnDoc = doc;
    list.querySelectorAll('[data-page]').forEach((item) => {
      const page = doc.pages.find((p) => p.id === item.getAttribute('data-page'));
      if (page) drawPageThumb(/** @type {HTMLCanvasElement} */ (item.querySelector('canvas')), doc, page, 108, app.photos);
    });
  }

  list.addEventListener('keydown', (e) => {
    const item = /** @type {HTMLElement} */ (e.target).closest('[data-page]');
    if (item && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      app.goToPage(item.getAttribute('data-page'));
    }
  });

  document.addEventListener('cs:assets-loaded', () => {
    drawnDoc = null;
    clearTimeout(thumbTimer);
    thumbTimer = setTimeout(drawThumbs, 150);
  });

  return {
    update() {
      const ids = app.doc.pages.map((p) => p.id).join(',') + '|' + app.doc.pageSize.wPt + 'x' + app.doc.pageSize.hPt;
      if (ids !== lastIds) {
        lastIds = ids;
        rebuild();
        drawThumbs();
      } else {
        clearTimeout(thumbTimer);
        thumbTimer = setTimeout(drawThumbs, 250);
      }
      list.querySelectorAll('[data-page]').forEach((item) => item.setAttribute('aria-current', String(item.getAttribute('data-page') === app.ui.pageId)));
    },
  };
}
