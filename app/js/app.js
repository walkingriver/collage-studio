// @ts-check
// The app object: document store, UI state (current page, selection, mode), photo
// library and a render scheduler that all views hang off.

import { createStore } from './store.js';
import { newProject, findPage, findCell, findTextBox } from './model.js';
import { createPhotoLibrary } from './images.js';
import { warmthUrl } from './filters-dom.js';

/** @typedef {import('./model.js').Project} Project */
/** @typedef {import('./model.js').Page} Page */
/** @typedef {import('./model.js').Cell} Cell */
/** @typedef {import('./model.js').TextBox} TextBox */

/**
 * @typedef {object} UiState
 * @property {string} pageId
 * @property {{kind: 'cell'|'box', id: string} | null} selection
 * @property {'normal'|'crop'} mode
 * @property {{kind: 'cell'|'box', id: string} | null} editing  text being edited in place
 * @property {string|null} dropTarget  cell highlighted while dragging
 * @property {string|null} dragSource  cell being dragged
 * @property {boolean} trayDrop  dragging a slot over the tray (remove)
 * @property {'mosaic'|'scatter'} surpriseStyle  kind of random layout "Surprise me" makes
 * @property {number|null} surpriseCount  photos for "Surprise me", or null to use what's on the page
 */

/** @typedef {{update: () => void}} View */

export function createApp() {
  /** @type {View[]} */
  const views = [];
  let raf = 0;
  const requestRender = () => {
    if (!raf) raf = requestAnimationFrame(() => {
      raf = 0;
      for (const v of views) v.update();
    });
  };

  const store = createStore(newProject());
  const photos = createPhotoLibrary({
    onChange: () => {
      requestRender();
      document.dispatchEvent(new Event('cs:assets-loaded'));
    },
    warmthUrl,
  });

  /** @type {UiState} */
  const ui = { pageId: store.doc.pages[0].id, selection: null, mode: 'normal', editing: null, dropTarget: null, dragSource: null, trayDrop: false, surpriseStyle: 'mosaic', surpriseCount: null };

  /** Keeps UI state pointing at things that still exist (after undo, delete...). */
  function reconcile() {
    const doc = store.doc;
    if (!findPage(doc, ui.pageId)) ui.pageId = doc.pages[0].id;
    const page = findPage(doc, ui.pageId);
    const exists = (/** @type {{kind: string, id: string}|null} */ s) => !!s && (s.kind === 'cell' ? !!findCell(page, s.id) : !!findTextBox(page, s.id));
    if (ui.selection && !exists(ui.selection)) ui.selection = null;
    if (ui.editing && !exists(ui.editing)) ui.editing = null;
    if (ui.mode === 'crop') {
      const c = ui.selection?.kind === 'cell' ? findCell(page, ui.selection.id) : null;
      if (c?.content?.kind !== 'photo') ui.mode = 'normal';
    }
  }

  store.subscribe(() => {
    reconcile();
    requestRender();
  });

  const app = {
    store,
    photos,
    ui,
    /** The open project file, when it has been saved or opened from disk. */
    file: { handle: /** @type {any} */ (null), name: /** @type {string|null} */ (null) },

    get doc() {
      return store.doc;
    },
    /** @returns {Page} */
    get page() {
      return findPage(store.doc, ui.pageId) ?? store.doc.pages[0];
    },
    get pageIndex() {
      return store.doc.pages.findIndex((p) => p.id === ui.pageId);
    },
    /** @returns {Cell|null} */
    get selectedCell() {
      return ui.selection?.kind === 'cell' ? findCell(this.page, ui.selection.id) ?? null : null;
    },
    /** @returns {TextBox|null} */
    get selectedBox() {
      return ui.selection?.kind === 'box' ? findTextBox(this.page, ui.selection.id) ?? null : null;
    },

    /** @param {View} v */
    addView(v) {
      views.push(v);
    },
    requestRender,

    /** @param {Partial<UiState>} patch */
    setUi(patch) {
      Object.assign(ui, patch);
      reconcile();
      requestRender();
    },

    /** @param {UiState['selection']} selection */
    select(selection) {
      if (ui.mode === 'crop' && (selection?.kind !== 'cell' || selection.id !== ui.selection?.id)) ui.mode = 'normal';
      this.setUi({ selection });
    },

    /** @param {string} pageId */
    goToPage(pageId) {
      this.setUi({ pageId, selection: null, mode: 'normal', editing: null, surpriseCount: null });
    },

    /**
     * Edits the current page.
     * @template R
     * @param {(page: Page, doc: Project) => R} fn
     * @param {{group?: string, sticky?: boolean}} [opts]
     */
    editPage(fn, opts) {
      return store.update((d) => fn(findPage(d, ui.pageId), d), opts);
    },

    /**
     * @param {string} cellId
     * @param {(cell: Cell, page: Page, doc: Project) => void} fn
     * @param {{group?: string, sticky?: boolean}} [opts]
     */
    editCell(cellId, fn, opts) {
      store.update((d) => {
        const page = findPage(d, ui.pageId);
        const cell = findCell(page, cellId);
        if (cell) fn(cell, page, d);
      }, opts);
    },

    /**
     * @param {string} boxId
     * @param {(box: TextBox, page: Page) => void} fn
     * @param {{group?: string, sticky?: boolean}} [opts]
     */
    editBox(boxId, fn, opts) {
      store.update((d) => {
        const page = findPage(d, ui.pageId);
        const box = findTextBox(page, boxId);
        if (box) fn(box, page);
      }, opts);
    },

    /** Commands (see actions.js). Filled in by main.js. */
    actions: /** @type {any} */ (null),
    /** The editor canvas (see interact/stage.js). Filled in by main.js. */
    stage: /** @type {any} */ (null),
  };
  return app;
}

/** @typedef {ReturnType<typeof createApp>} App */
