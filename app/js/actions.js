// @ts-check
// Every command the toolbar, menus, keyboard shortcuts and panels can run.

import {
  newProject, newPage, newTextBox, newTextContent, applyLayout, placePhoto, autoFill, removePhoto,
  duplicatePage, photoUsage, findPage, uid,
} from './model.js';
import { frameRect } from './geometry.js';
import { packProject, unpackProject, PROJECT_MIME } from './io/project-file.js';
import { pickPhotoFiles, pickProjectFile, saveBlob, PROJECT_TYPES, JPEG_TYPES, safeName, canPickFolder, pickFolder, writeInFolder, download } from './io/fs.js';
import { recent } from './io/db.js';
import { clearSession } from './io/autosave.js';
import { ensureFontsFor } from './fonts.js';
import { rasterizePage, canvasToBlob, releaseCanvas } from './export/raster.js';
import { printPages } from './export/print.js';
import { choosePageAndLayout, chooseJpegOptions, pdfTip } from './ui/dialogs.js';
import { ask, toast } from './ui/dom.js';
import { pageThumbDataUrl } from './ui/thumbs.js';

/** @typedef {import('./app.js').App} App */
/** @typedef {import('./model.js').Project} Project */

const RECENT_LIMIT = 12;

/** @param {App} app */
export function createActions(app) {
  const { store, photos } = app;
  /** @type {Project|null} */
  let cropStartDoc = null;

  /** Toast with a progress bar. @param {string} label */
  function progress(label) {
    const el = toast(label, { ms: 600000 });
    el.insertAdjacentHTML('beforeend', '<div class="progress" style="width:140px"><div style="width:0%"></div></div>');
    const bar = /** @type {HTMLElement} */ (el.querySelector('.progress > div'));
    return {
      set: (/** @type {number} */ done, /** @type {number} */ total) => { bar.style.width = `${Math.round((done / Math.max(1, total)) * 100)}%`; },
      close: () => el.remove(),
    };
  }

  /** @param {unknown} e @param {string} what */
  function fail(e, what) {
    console.error(e);
    toast(`${what} ${e instanceof Error ? e.message : ''}`.trim(), { error: true });
  }

  const a = {
    // ---------- projects ----------

    /** @returns {Promise<boolean>} true when it's OK to replace the current project */
    async confirmDiscard() {
      if (!store.isDirty()) return true;
      const r = await ask({
        title: 'Save your changes?',
        message: `Do you want to save the changes to “${store.doc.title}” first?`,
        yes: 'Save', no: "Don't save", cancel: 'Cancel',
      });
      if (r === 'yes') return a.save();
      return r === 'no';
    },

    async newCollage() {
      if (!(await a.confirmDiscard())) return;
      const r = await choosePageAndLayout({ title: 'New collage', subtitle: 'Choose a page size and a layout. You can change both later.', ok: 'Create collage' });
      if (!r) return;
      a.startProject(newProject({ pageSize: r.pageSize, layoutId: r.layoutId }), null);
    },

    /**
     * @param {Project} doc
     * @param {{handle: any, name: string|null}|null} file
     * @param {{saved?: boolean}} [opts]
     */
    startProject(doc, file, opts = {}) {
      app.stage.stopEditing();
      store.replace(doc, { saved: opts.saved ?? true });
      app.file = file ? { handle: file.handle, name: file.name } : { handle: null, name: null };
      app.goToPage(doc.pages[0].id);
      photos.prune(new Set(Object.keys(doc.photos)));
      photos.ensureLoaded(Object.keys(doc.photos)).catch((e) => fail(e, 'Some photos could not be loaded.'));
      ensureFontsFor(doc).then(() => app.requestRender());
      document.dispatchEvent(new CustomEvent('cs:show-editor'));
    },

    /** @param {{file: File, handle: any}|null} [picked] */
    async openCollage(picked) {
      if (!(await a.confirmDiscard())) return;
      try {
        picked ??= await pickProjectFile();
        if (!picked) return;
        const { doc, photoBytes } = unpackProject(new Uint8Array(await picked.file.arrayBuffer()));
        await photos.storeBytes(photoBytes, doc.photos);
        a.startProject(doc, { handle: picked.handle, name: picked.file.name });
        if (picked.handle) a.rememberRecent(picked.handle);
      } catch (e) {
        fail(e, "Couldn't open that file.");
      }
    },

    /** @param {{id: string, name: string, handle: any}} entry */
    async openRecent(entry) {
      try {
        const h = entry.handle;
        if (h.queryPermission && (await h.queryPermission({ mode: 'readwrite' })) !== 'granted') {
          if ((await h.requestPermission({ mode: 'readwrite' })) !== 'granted') return;
        }
        const file = await h.getFile();
        await a.openCollage({ file, handle: h });
      } catch (e) {
        if (e instanceof DOMException && e.name === 'NotFoundError') {
          toast(`“${entry.name}” was moved or deleted.`, { error: true });
          await recent.delete(entry.id);
          document.dispatchEvent(new CustomEvent('cs:recent-changed'));
        } else fail(e, "Couldn't open that file.");
      }
    },

    /** @param {{saveAs?: boolean}} [o] @returns {Promise<boolean>} */
    async save(o = {}) {
      app.stage.stopEditing();
      try {
        const doc = store.doc;
        const bytes = packProject(doc, await photos.bytesFor(Object.keys(doc.photos)));
        const res = await saveBlob(new Blob([/** @type {BlobPart} */ (bytes)], { type: PROJECT_MIME }), {
          suggestedName: `${safeName(doc.title)}.collage`, types: PROJECT_TYPES, handle: o.saveAs ? null : app.file.handle,
        });
        if (!res) return false;
        if (store.doc === doc) store.markSaved();
        app.file = res;
        toast(`Saved “${res.name}”`);
        if (res.handle) a.rememberRecent(res.handle);
        else toast('Your browser saved the project to Downloads.');
        return true;
      } catch (e) {
        fail(e, "Couldn't save.");
        return false;
      }
    },

    /** @param {any} handle */
    async rememberRecent(handle) {
      try {
        const all = await recent.all();
        let id = uid();
        for (const r of all) if (await r.handle.isSameEntry?.(handle)) id = r.id;
        await photos.ensureLoaded(Object.keys(store.doc.photos));
        await recent.put({ id, name: handle.name, handle, thumb: pageThumbDataUrl(store.doc, store.doc.pages[0], photos), savedAt: Date.now() });
        const sorted = (await recent.all()).sort((x, y) => y.savedAt - x.savedAt);
        for (const old of sorted.slice(RECENT_LIMIT)) await recent.delete(old.id);
        document.dispatchEvent(new CustomEvent('cs:recent-changed'));
      } catch (e) {
        console.warn('Could not update recent projects', e);
      }
    },

    async discardSession() {
      await clearSession();
    },

    // ---------- photos ----------

    /**
     * Adds photos to the project. By default they also fill the page's empty slots.
     * @param {File[]|null} files  null opens the photo picker
     * @param {{cellId?: string, single?: boolean, fill?: boolean}} [o]
     */
    async addPhotos(files, o = {}) {
      files ??= await pickPhotoFiles();
      if (o.single) files = files.slice(0, 1);
      if (!files.length) return;
      const p = files.length > 3 ? progress(`Adding ${files.length} photos…`) : null;
      try {
        const { added, errors } = await photos.importFiles(files);
        if (errors.length) toast(errors.length === 1 ? errors[0] : `${errors[0]} (and ${errors.length - 1} more)`, { error: true });
        if (!added.length) return;
        const fill = o.fill ?? !o.single;
        let target = o.cellId;
        store.update((d) => {
          for (const m of added) d.photos[m.id] ??= m;
          const page = findPage(d, app.ui.pageId);
          const queue = added.map((m) => m.id);
          if (target) placePhoto(page, target, queue.shift());
          if (fill) for (const c of page.cells) if (!c.content && queue.length) placePhoto(page, c.id, queue.shift());
        });
        if (target) app.select({ kind: 'cell', id: target });
      } catch (e) {
        fail(e, "Couldn't add those photos.");
      } finally {
        p?.close();
      }
    },

    /** Puts tray photos into empty slots in order. @param {string[]} ids */
    fillEmptyWith(ids) {
      const queue = [...ids];
      app.editPage((page) => {
        for (const c of page.cells) if (!c.content && queue.length) placePhoto(page, c.id, queue.shift());
      });
      if (queue.length === ids.length) toast('There are no empty slots on this page. Drop the photo onto a slot to replace it.');
    },

    autoFill() {
      const used = photoUsage(store.doc);
      if (!app.page.cells.some((c) => !c.content)) toast('This page has no empty slots.');
      else if (!Object.keys(store.doc.photos).some((id) => !used.has(id))) toast('Every photo is already used. Add more photos first.');
      else app.editPage((page, d) => autoFill(d, page));
    },

    /** @param {string} photoId */
    async removePhotoFromProject(photoId) {
      const used = photoUsage(store.doc).get(photoId) ?? 0;
      if (used) {
        const r = await ask({ title: 'Remove photo?', message: `This photo is used in ${used} slot${used > 1 ? 's' : ''}. Remove it from the collage?`, yes: 'Remove', cancel: 'Cancel', danger: true });
        if (r !== 'yes') return;
      }
      store.update((d) => removePhoto(d, photoId));
    },

    // ---------- slots ----------

    /** @param {string} cellId */
    enterCrop(cellId) {
      app.stage.stopEditing();
      store.endGroup();
      cropStartDoc = store.doc;
      app.setUi({ selection: { kind: 'cell', id: cellId }, mode: 'crop' });
    },

    /** @param {boolean} keep */
    exitCrop(keep) {
      if (app.ui.mode !== 'crop') return;
      if (!keep && cropStartDoc && store.doc !== cropStartDoc) store.undo();
      store.endGroup();
      cropStartDoc = null;
      app.setUi({ mode: 'normal' });
    },

    /** @param {string} cellId @param {1|-1} [dir] */
    rotate(cellId, dir = 1) {
      app.editCell(cellId, (c) => {
        if (c.content?.kind !== 'photo') return;
        c.content.rotate = /** @type {0|90|180|270} */ ((c.content.rotate + 90 * dir + 360) % 360);
        c.content.cx = c.content.cy = 0.5;
      });
    },

    /** @param {string} cellId */
    flip(cellId) {
      app.editCell(cellId, (c) => { if (c.content?.kind === 'photo') c.content.flipH = !c.content.flipH; });
    },

    /** @param {string} cellId */
    toggleTextSlot(cellId) {
      const cell = app.page.cells.find((c) => c.id === cellId);
      if (!cell) return;
      if (cell.content?.kind === 'text') {
        app.editCell(cellId, (c) => { c.content = null; });
      } else {
        app.editCell(cellId, (c) => { c.content = newTextContent('Your text here'); });
        app.stage.startEditing({ kind: 'cell', id: cellId });
      }
    },

    deleteSelection() {
      const sel = app.ui.selection;
      if (!sel) return;
      if (sel.kind === 'box') {
        app.editPage((p) => { p.textBoxes = p.textBoxes.filter((b) => b.id !== sel.id); });
        app.select(null);
      } else {
        app.editCell(sel.id, (c) => { c.content = null; });
      }
    },

    // ---------- text boxes ----------

    addText() {
      const doc = store.doc, page = app.page;
      const cx = doc.pageSize.wPt / 2, cy = doc.pageSize.hPt / 2;
      // White text with a shadow when it lands on a photo, dark text otherwise.
      const overPhoto = page.cells.some((c) => {
        if (c.content?.kind !== 'photo') return false;
        const r = frameRect(page, doc.pageSize, c);
        return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h;
      });
      const box = newTextBox(page, 'Your text', overPhoto ? { color: '#ffffff', shadow: true, font: 'Montserrat', sizePt: 32 } : { font: 'Montserrat', sizePt: 32 }, doc.pageSize);
      app.editPage((p) => { p.textBoxes.push(box); });
      app.stage.startEditing({ kind: 'box', id: box.id });
    },

    /** @param {string} boxId */
    duplicateBox(boxId) {
      const id = uid();
      app.editPage((p) => {
        const b = p.textBoxes.find((x) => x.id === boxId);
        if (b) p.textBoxes.push({ ...structuredClone(b), id, xPt: b.xPt + 18, yPt: b.yPt + 18 });
      });
      app.select({ kind: 'box', id });
    },

    /** @param {string} boxId */
    bringToFront(boxId) {
      app.editPage((p) => {
        const i = p.textBoxes.findIndex((b) => b.id === boxId);
        if (i >= 0) p.textBoxes.push(...p.textBoxes.splice(i, 1));
      });
    },

    // ---------- pages ----------

    async changeLayout() {
      const page = app.page;
      const r = await choosePageAndLayout({ title: 'Change layout', subtitle: 'Your photos and text move into the new layout in order.', ok: 'Use this layout', size: store.doc.pageSize, layoutId: page.layoutId, showSize: false, style: page });
      if (!r || r.layoutId === page.layoutId) return;
      const res = app.editPage((p) => applyLayout(p, r.layoutId));
      app.select(null);
      if (res.droppedPhotos) toast(`${res.droppedPhotos} photo${res.droppedPhotos > 1 ? 's' : ''} didn't fit and went back to your photos.`, { action: 'Undo', onAction: () => store.undo() });
      if (res.droppedTexts) toast(`${res.droppedTexts} text slot${res.droppedTexts > 1 ? 's' : ''} didn't fit.`, { action: 'Undo', onAction: () => store.undo() });
    },

    async changePageSize() {
      const r = await choosePageAndLayout({ title: 'Page size', subtitle: 'This changes every page in the collage.', ok: 'Use this size', size: store.doc.pageSize, showLayout: false });
      if (!r) return;
      store.update((d) => { d.pageSize = r.pageSize; });
    },

    async addPage() {
      const cur = app.page;
      const r = await choosePageAndLayout({ title: 'Add a page', ok: 'Add page', size: store.doc.pageSize, layoutId: cur.layoutId, showSize: false, style: cur });
      if (!r) return;
      const page = newPage(r.layoutId);
      Object.assign(page, { marginPt: cur.marginPt, gapPt: cur.gapPt, background: cur.background, frame: { ...cur.frame } });
      store.update((d) => { d.pages.splice(app.pageIndex + 1, 0, page); });
      app.goToPage(page.id);
    },

    /** @param {string} pageId */
    duplicatePage(pageId) {
      const src = findPage(store.doc, pageId);
      if (!src) return;
      const copy = duplicatePage(src);
      store.update((d) => { d.pages.splice(d.pages.findIndex((p) => p.id === pageId) + 1, 0, copy); });
      app.goToPage(copy.id);
    },

    /** @param {string} pageId */
    async deletePage(pageId) {
      const doc = store.doc;
      if (doc.pages.length === 1) {
        toast('A collage needs at least one page.');
        return;
      }
      const page = findPage(doc, pageId);
      const i = doc.pages.indexOf(page);
      if (page.cells.some((c) => c.content) || page.textBoxes.length) {
        const r = await ask({ title: 'Delete page?', message: `Delete page ${i + 1} and everything on it?`, yes: 'Delete page', cancel: 'Cancel', danger: true });
        if (r !== 'yes') return;
      }
      store.update((d) => { d.pages = d.pages.filter((p) => p.id !== pageId); });
      app.goToPage(store.doc.pages[Math.min(i, store.doc.pages.length - 1)].id);
      toast(`Page ${i + 1} deleted.`, { action: 'Undo', onAction: () => store.undo() });
    },

    /** @param {string} pageId @param {number} toIndex */
    movePage(pageId, toIndex) {
      store.update((d) => {
        const from = d.pages.findIndex((p) => p.id === pageId);
        const [p] = d.pages.splice(from, 1);
        d.pages.splice(Math.max(0, Math.min(d.pages.length, toIndex > from ? toIndex - 1 : toIndex)), 0, p);
      });
    },

    applyStyleToAllPages() {
      const cur = app.page;
      store.update((d) => {
        for (const p of d.pages) Object.assign(p, { marginPt: cur.marginPt, gapPt: cur.gapPt, background: cur.background, frame: { ...cur.frame } });
      });
      toast('Applied to every page.');
    },

    // ---------- history ----------

    undo() {
      app.stage.stopEditing();
      if (app.ui.mode === 'crop') a.exitCrop(true);
      if (!store.undo()) toast('Nothing to undo.');
    },

    redo() {
      app.stage.stopEditing();
      if (!store.redo()) toast('Nothing to redo.');
    },

    // ---------- output ----------

    async exportJpeg() {
      app.stage.stopEditing();
      const doc = store.doc;
      const opts = await chooseJpegOptions(doc.pages.length);
      if (!opts) return;
      const pages = opts.pages === 'all' ? doc.pages : [app.page];
      const base = safeName(doc.title);
      const nameFor = (/** @type {number} */ i) => (pages.length > 1 ? `${base} - page ${doc.pages.indexOf(pages[i]) + 1}.jpg` : `${base}.jpg`);
      let folder = null;
      if (pages.length > 1 && canPickFolder) {
        folder = await pickFolder();
        if (!folder) return;
      }
      const p = progress(pages.length > 1 ? `Saving ${pages.length} JPEGs…` : 'Saving JPEG…');
      try {
        for (let i = 0; i < pages.length; i++) {
          p.set(i, pages.length);
          const canvas = await rasterizePage(doc, pages[i], opts.dpi, photos);
          const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
          releaseCanvas(canvas);
          if (folder) await writeInFolder(folder, nameFor(i), blob);
          else if (pages.length === 1) {
            p.close();
            const res = await saveBlob(blob, { suggestedName: nameFor(i), types: JPEG_TYPES, id: 'collage-exports' });
            if (res) toast(`Saved “${res.name}”`);
            return;
          } else download(blob, nameFor(i));
        }
        toast(pages.length > 1 ? `Saved ${pages.length} JPEGs.` : 'Saved.');
      } catch (e) {
        fail(e, "Couldn't save the JPEG.");
      } finally {
        p.close();
      }
    },

    /** @param {{pdf?: boolean}} [o] */
    async print(o = {}) {
      app.stage.stopEditing();
      if (o.pdf) {
        let skip = false;
        try { skip = localStorage.getItem('pdf-tip-skip') === '1'; } catch { /* private mode */ }
        if (!skip && !(await pdfTip())) return;
      }
      const doc = store.doc;
      const p = progress('Getting pages ready…');
      try {
        await printPages(doc, doc.pages, photos, (d, t) => p.set(d, t));
      } catch (e) {
        fail(e, "Couldn't print.");
      } finally {
        p.close();
      }
    },
  };
  return a;
}

/** @typedef {ReturnType<typeof createActions>} Actions */
