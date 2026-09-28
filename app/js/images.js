// @ts-check
// Photo library: imports photos, keeps originals in IndexedDB, and hands out
// downscaled copies for the screen (with adjustments pre-applied) and full-quality
// decodes for export.

import { blobs } from './io/db.js';
import { filterString, adjustKey } from './adjust.js';
import { isDefaultAdjust } from './model.js';

/** @typedef {import('./model.js').PhotoMeta} PhotoMeta */
/** @typedef {import('./model.js').PhotoContent} PhotoContent */

const SCREEN_MAX = 1600;
const THUMB_MAX = 320;
const FILTERED_CACHE_LIMIT = 12;

export const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/avif'];

/** @param {File} f */
function isHeic(f) {
  return /image\/hei[cf]/.test(f.type) || /\.(heic|heif)$/i.test(f.name);
}

/** @param {ArrayBuffer} buf */
async function hashBytes(buf) {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].slice(0, 10).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * @param {ImageBitmap} bmp
 * @param {number} max
 */
function downscale(bmp, max) {
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  if (k >= 1) return createImageBitmap(bmp);
  return createImageBitmap(bmp, { resizeWidth: Math.round(bmp.width * k), resizeHeight: Math.round(bmp.height * k), resizeQuality: 'high' });
}

/** @param {ImageBitmap} bmp @returns {Promise<string>} object URL of a small JPEG */
async function thumbUrl(bmp) {
  const small = await downscale(bmp, THUMB_MAX);
  const c = document.createElement('canvas');
  c.width = small.width;
  c.height = small.height;
  c.getContext('2d').drawImage(small, 0, 0);
  small.close();
  const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.85));
  return URL.createObjectURL(blob);
}

/**
 * @param {{onChange: () => void, warmthUrl: (w: number) => string}} opts
 */
export function createPhotoLibrary({ onChange, warmthUrl }) {
  /** @type {Map<string, ImageBitmap>} */
  const screen = new Map();
  /** @type {Map<string, string>} */
  const thumbs = new Map();
  /** @type {Map<string, Promise<void>>} */
  const loading = new Map();
  /** @type {Map<string, HTMLCanvasElement>} */
  const filtered = new Map();
  /** @type {Map<string, {w: number, h: number}>} natural (EXIF-oriented) size */
  const natural = new Map();

  /** Creates screen copy + thumbnail from a blob. @param {string} id @param {Blob} blob */
  async function prepare(id, blob) {
    const full = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    try {
      screen.set(id, await downscale(full, SCREEN_MAX));
      thumbs.set(id, await thumbUrl(full));
      natural.set(id, { w: full.width, h: full.height });
    } finally {
      full.close();
    }
  }

  return {
    /**
     * Imports files. Returns metadata for photos that worked and messages for those that didn't.
     * @param {File[]} files
     * @returns {Promise<{added: PhotoMeta[], errors: string[]}>}
     */
    async importFiles(files) {
      /** @type {PhotoMeta[]} */
      const added = [];
      const errors = [];
      for (const file of files) {
        if (isHeic(file)) {
          errors.push(`${file.name}: iPhone HEIC photos aren't supported yet. Please convert them to JPEG first.`);
          continue;
        }
        if (!SUPPORTED_TYPES.includes(file.type)) {
          errors.push(`${file.name}: not a supported photo type.`);
          continue;
        }
        try {
          const id = await hashBytes(await file.arrayBuffer());
          if (!natural.has(id)) await prepare(id, file);
          await blobs.put(id, file.slice(0, file.size, file.type));
          const { w, h } = natural.get(id);
          if (!added.some((a) => a.id === id)) added.push({ id, name: file.name, type: file.type, w, h });
        } catch (e) {
          console.error(e);
          errors.push(`${file.name}: couldn't read this photo.`);
        }
      }
      onChange();
      return { added, errors };
    },

    /**
     * Makes sure screen copies exist for these photos (after opening a project or restoring).
     * @param {string[]} ids
     */
    async ensureLoaded(ids) {
      await Promise.all(ids.map((id) => this.load(id)));
    },

    /** @param {string} id */
    load(id) {
      if (screen.has(id)) return Promise.resolve();
      if (!loading.has(id)) {
        loading.set(id, (async () => {
          const blob = await blobs.get(id);
          if (!blob) throw new Error('Photo data is missing');
          await prepare(id, blob);
          onChange();
        })().finally(() => loading.delete(id)));
      }
      return loading.get(id);
    },

    /** Stores original bytes (from an opened project file). @param {Map<string, Uint8Array>} bytes @param {Record<string, PhotoMeta>} metas */
    async storeBytes(bytes, metas) {
      for (const [id, data] of bytes) await blobs.put(id, new Blob([/** @type {BlobPart} */ (data)], { type: metas[id]?.type ?? 'image/jpeg' }));
    },

    /** @param {string} id */
    thumb: (id) => thumbs.get(id),

    /**
     * Screen image for a photo slot with its adjustments already applied, or null while loading.
     * @param {PhotoContent} content
     * @returns {CanvasImageSource|null}
     */
    drawable(content) {
      const base = screen.get(content.photoId);
      if (!base) {
        this.load(content.photoId).catch(() => {});
        return null;
      }
      if (isDefaultAdjust(content.adjust)) return base;
      const key = content.photoId + '|' + adjustKey(content.adjust);
      let c = filtered.get(key);
      if (c) {
        filtered.delete(key);
        filtered.set(key, c); // mark as recently used
        return c;
      }
      c = document.createElement('canvas');
      c.width = base.width;
      c.height = base.height;
      const ctx = c.getContext('2d');
      ctx.filter = filterString(content.adjust, warmthUrl);
      ctx.drawImage(base, 0, 0);
      filtered.set(key, c);
      if (filtered.size > FILTERED_CACHE_LIMIT) {
        const oldest = filtered.keys().next().value;
        const old = filtered.get(oldest);
        old.width = old.height = 0;
        filtered.delete(oldest);
      }
      return c;
    },

    /**
     * Full-quality decode for export, downscaled to what the page needs.
     * The caller must close() the result.
     * @param {string} id
     * @param {number} needW  pixels needed, in the photo's own (unrotated) orientation
     * @param {number} needH
     */
    async decodeForExport(id, needW, needH) {
      const blob = await blobs.get(id);
      if (!blob) throw new Error('A photo in this project is missing.');
      const full = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      const k = Math.min(1, Math.max(needW / full.width, needH / full.height));
      if (k >= 0.999) return full;
      const out = await createImageBitmap(full, { resizeWidth: Math.max(1, Math.round(full.width * k)), resizeHeight: Math.max(1, Math.round(full.height * k)), resizeQuality: 'high' });
      full.close();
      return out;
    },

    /** Original file bytes, for saving projects. @param {string[]} ids */
    async bytesFor(ids) {
      const out = new Map();
      for (const id of ids) {
        const b = await blobs.get(id);
        if (!b) throw new Error('A photo in this project is missing.');
        out.set(id, new Uint8Array(await b.arrayBuffer()));
      }
      return out;
    },

    /** Drops cached copies of photos no longer in the project. @param {Set<string>} keep */
    prune(keep) {
      for (const id of [...screen.keys()]) {
        if (keep.has(id)) continue;
        screen.get(id).close();
        screen.delete(id);
        natural.delete(id);
        const t = thumbs.get(id);
        if (t) URL.revokeObjectURL(t);
        thumbs.delete(id);
      }
      for (const key of [...filtered.keys()]) if (!keep.has(key.split('|')[0])) filtered.delete(key);
    },
  };
}

/** @typedef {ReturnType<typeof createPhotoLibrary>} PhotoLibrary */
