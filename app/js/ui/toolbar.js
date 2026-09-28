// @ts-check
// Top toolbar: file, undo/redo, add, title, output.

import { icon } from './icons.js';
import { $, showMenu } from './dom.js';

/** @param {import('../app.js').App} app */
export function createToolbar(app) {
  const el = /** @type {HTMLElement} */ ($('#toolbar'));
  const mod = navigator.platform.startsWith('Mac') ? '⌘' : 'Ctrl+';
  const tool = (/** @type {string} */ id, /** @type {string} */ ic, /** @type {string} */ label, /** @type {string} */ tip) =>
    `<button class="tool" data-a="${id}" title="${tip}">${icon(ic, 22)}<span>${label}</span></button>`;

  el.innerHTML = `
    <div class="brand"><img src="icons/icon-192.png" alt=""></div>
    ${tool('new', 'file-plus', 'New', 'Start a new collage')}
    ${tool('open', 'folder-open', 'Open', `Open a saved collage (${mod}O)`)}
    <div class="tool-wrap">${tool('save', 'save', 'Save', `Save (${mod}S)`)}</div>
    <div class="sep"></div>
    ${tool('undo', 'undo-2', 'Undo', `Undo (${mod}Z)`)}
    ${tool('redo', 'redo-2', 'Redo', `Redo (${mod}Y)`)}
    <div class="sep"></div>
    ${tool('photos', 'image-plus', 'Add photos', 'Add photos from your computer')}
    ${tool('text', 'type', 'Add text', 'Add a text box you can put anywhere')}
    ${tool('layout', 'layout-grid', 'Layout', 'Choose a different layout for this page')}
    ${tool('surprise', 'dices', 'Surprise me', 'Make a random layout from the photos on this page. Click again for another.')}
    <div class="spacer"></div>
    <input class="title-input" aria-label="Collage name" maxlength="80" spellcheck="false">
    <span class="dirty-dot" title="Unsaved changes" hidden></span>
    <div class="spacer"></div>
    ${tool('print', 'printer', 'Print', `Print (${mod}P)`)}
    ${tool('pdf', 'file-text', 'Save PDF', 'Save as a PDF file')}
    ${tool('jpeg', 'file-image', 'Save JPEG', 'Save as JPEG pictures')}`;

  const title = /** @type {HTMLInputElement} */ (el.querySelector('.title-input'));
  const dirty = /** @type {HTMLElement} */ (el.querySelector('.dirty-dot'));
  const btn = (/** @type {string} */ id) => /** @type {HTMLButtonElement} */ (el.querySelector(`[data-a=${id}]`));
  const a = app.actions;

  el.addEventListener('click', (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('[data-a]');
    switch (b?.getAttribute('data-a')) {
      case 'new': return a.newCollage();
      case 'open': return a.openCollage();
      case 'save': return a.save();
      case 'undo': return a.undo();
      case 'redo': return a.redo();
      case 'photos': return a.addPhotos(null);
      case 'text': return a.addText();
      case 'layout': return a.changeLayout();
      case 'surprise': return a.surprise();
      case 'print': return a.print();
      case 'pdf': return a.print({ pdf: true });
      case 'jpeg': return a.exportJpeg();
    }
  });
  btn('save').addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showMenu(e.clientX, e.clientY, [
      { label: 'Save', icon: 'save', kbd: `${mod}S`, run: () => a.save() },
      { label: 'Save as…', icon: 'copy', kbd: `${mod}⇧S`, run: () => a.save({ saveAs: true }) },
    ]);
  });

  title.addEventListener('input', () => {
    const v = title.value;
    app.store.update((d) => { d.title = v; }, { group: 'title', sticky: true });
  });
  title.addEventListener('change', () => {
    if (!title.value.trim()) app.store.update((d) => { d.title = 'My Collage'; });
    app.store.endGroup();
  });
  title.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === 'Escape') title.blur();
  });

  return {
    update() {
      btn('undo').disabled = !app.store.canUndo();
      btn('redo').disabled = !app.store.canRedo();
      dirty.hidden = !app.store.isDirty();
      if (document.activeElement !== title) title.value = app.doc.title;
      title.style.width = `${Math.max(120, Math.min(320, title.value.length * 9 + 40))}px`;
    },
  };
}
