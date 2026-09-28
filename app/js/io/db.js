// @ts-check
// Tiny IndexedDB wrapper. Stores: photo blobs, key/value (autosave), recent project handles.

const DB_NAME = 'collage-studio';
const DB_VERSION = 1;

/** @type {Promise<IDBDatabase>|null} */
let dbPromise = null;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('recent')) db.createObjectStore('recent', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

/**
 * @template T
 * @param {string} store
 * @param {IDBTransactionMode} mode
 * @param {(s: IDBObjectStore) => IDBRequest<T>} fn
 * @returns {Promise<T>}
 */
async function run(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const blobs = {
  /** @param {string} id @param {Blob} blob */
  put: (id, blob) => run('blobs', 'readwrite', (s) => s.put(blob, id)),
  /** @param {string} id @returns {Promise<Blob|undefined>} */
  get: (id) => run('blobs', 'readonly', (s) => s.get(id)),
  /** @returns {Promise<string[]>} */
  keys: () => run('blobs', 'readonly', (s) => /** @type {IDBRequest<string[]>} */ (s.getAllKeys())),
  /** @param {string} id */
  delete: (id) => run('blobs', 'readwrite', (s) => s.delete(id)),
};

export const kv = {
  /** @param {string} key @param {any} value */
  set: (key, value) => run('kv', 'readwrite', (s) => s.put(value, key)),
  /** @param {string} key */
  get: (key) => run('kv', 'readonly', (s) => s.get(key)),
  /** @param {string} key */
  delete: (key) => run('kv', 'readwrite', (s) => s.delete(key)),
};

export const recent = {
  /** @param {{id: string, name: string, handle: any, thumb: string, savedAt: number}} entry */
  put: (entry) => run('recent', 'readwrite', (s) => s.put(entry)),
  /** @returns {Promise<Array<{id: string, name: string, handle: any, thumb: string, savedAt: number}>>} */
  all: () => run('recent', 'readonly', (s) => s.getAll()),
  /** @param {string} id */
  delete: (id) => run('recent', 'readwrite', (s) => s.delete(id)),
};

/** Asks the browser not to evict our storage. Safe to call repeatedly. */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    // Not critical: projects are real files; this only protects autosave.
  }
}
