// @ts-check
// Autosave for crash recovery: the current document (photos are already in IndexedDB)
// is written a moment after every change. Real saving is still to a .collage file.

import { kv, blobs } from './db.js';

const KEY = 'session';
const DELAY_MS = 1200;

/**
 * @typedef {object} Session
 * @property {import('../model.js').Project} doc
 * @property {string|null} fileName
 * @property {any} handle
 * @property {number} savedAt
 * @property {boolean} dirty  had unsaved changes
 */

/** @param {import('../app.js').App} app */
export function startAutosave(app) {
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let timer;
  const write = () => {
    /** @type {Session} */
    const s = { doc: app.store.doc, fileName: app.file.name, handle: app.file.handle, savedAt: Date.now(), dirty: app.store.isDirty() };
    kv.set(KEY, s).catch((e) => {
      // A handle that can't be stored shouldn't stop autosave.
      console.warn('Autosave failed, retrying without file handle', e);
      kv.set(KEY, { ...s, handle: null }).catch(() => {});
    });
  };
  app.store.subscribe(() => {
    clearTimeout(timer);
    timer = setTimeout(write, DELAY_MS);
  });
  // Last chance when the window closes.
  addEventListener('pagehide', () => {
    clearTimeout(timer);
    write();
  });
}

/** @returns {Promise<Session|undefined>} */
export function readSession() {
  return kv.get(KEY).catch(() => undefined);
}

export function clearSession() {
  return kv.delete(KEY).catch(() => {});
}

/**
 * Deletes stored photos that no document needs any more.
 * @param {Set<string>} keep
 */
export async function removeUnusedPhotos(keep) {
  try {
    for (const id of await blobs.keys()) if (!keep.has(id)) await blobs.delete(id);
  } catch (e) {
    console.warn('Photo cleanup failed', e);
  }
}
