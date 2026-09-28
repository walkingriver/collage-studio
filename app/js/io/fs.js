// @ts-check
// Opening and saving files. Uses the File System Access API (Edge/Chrome) for real
// Open/Save dialogs, with upload/download fallbacks elsewhere (Safari, Firefox).

import { $ } from '../ui/dom.js';
import { PROJECT_EXT, PROJECT_MIME } from './project-file.js';

const w = /** @type {any} */ (window);
export const canUseFileDialogs = typeof w.showSaveFilePicker === 'function' && typeof w.showOpenFilePicker === 'function';
export const canPickFolder = typeof w.showDirectoryPicker === 'function';

export const PROJECT_TYPES = [{ description: 'Collage Studio project', accept: { [PROJECT_MIME]: [PROJECT_EXT] } }];
export const JPEG_TYPES = [{ description: 'JPEG image', accept: { 'image/jpeg': ['.jpg', '.jpeg'] } }];

/** @param {unknown} e */
const isAbort = (e) => e instanceof DOMException && e.name === 'AbortError';

/**
 * Lets the user choose a file with a hidden <input type=file>.
 * @param {HTMLInputElement} input
 * @returns {Promise<File[]>}
 */
function pickWithInput(input) {
  return new Promise((resolve) => {
    input.value = '';
    const done = () => {
      input.removeEventListener('change', done);
      input.removeEventListener('cancel', done);
      resolve([...(input.files ?? [])]);
    };
    input.addEventListener('change', done);
    input.addEventListener('cancel', done);
    input.click();
  });
}

/** @returns {Promise<File[]>} */
export function pickPhotoFiles() {
  return pickWithInput(/** @type {HTMLInputElement} */ ($('#photo-input')));
}

/** @returns {Promise<{file: File, handle: any}|null>} */
export async function pickProjectFile() {
  if (canUseFileDialogs) {
    try {
      const [handle] = await w.showOpenFilePicker({ types: PROJECT_TYPES, id: 'collage-projects', excludeAcceptAllOption: false });
      return { file: await handle.getFile(), handle };
    } catch (e) {
      if (isAbort(e)) return null;
      throw e;
    }
  }
  const [file] = await pickWithInput(/** @type {HTMLInputElement} */ ($('#project-input')));
  return file ? { file, handle: null } : null;
}

/**
 * Makes sure we may write to a previously chosen file.
 * @param {any} handle
 */
export async function ensureWritable(handle) {
  if (!handle?.queryPermission) return false;
  const opts = { mode: 'readwrite' };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  return (await handle.requestPermission(opts)) === 'granted';
}

/**
 * Saves a blob. Writes to `handle` when given (Save), otherwise asks where (Save As).
 * Without file dialogs it downloads the file.
 * @param {Blob} blob
 * @param {{suggestedName: string, types: any[], handle?: any, id?: string}} o
 * @returns {Promise<{handle: any, name: string}|null>} null when cancelled
 */
export async function saveBlob(blob, o) {
  if (canUseFileDialogs) {
    let handle = o.handle;
    try {
      if (!handle || !(await ensureWritable(handle))) {
        handle = await w.showSaveFilePicker({ suggestedName: o.suggestedName, types: o.types, id: o.id ?? 'collage-projects' });
      }
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { handle, name: handle.name };
    } catch (e) {
      if (isAbort(e)) return null;
      throw e;
    }
  }
  download(blob, o.suggestedName);
  return { handle: null, name: o.suggestedName };
}

/** @returns {Promise<any|null>} a folder handle, or null when cancelled */
export async function pickFolder() {
  try {
    return await w.showDirectoryPicker({ id: 'collage-exports', mode: 'readwrite' });
  } catch (e) {
    if (isAbort(e)) return null;
    throw e;
  }
}

/**
 * @param {any} dir
 * @param {string} name
 * @param {Blob} blob
 */
export async function writeInFolder(dir, name, blob) {
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

/** @param {Blob} blob @param {string} name */
export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** File-name-safe version of a title. @param {string} title */
export function safeName(title) {
  return (title || 'Collage').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Collage';
}
