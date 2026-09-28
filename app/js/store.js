// @ts-check
// Holds the current document with undo/redo. Every edit works on a fresh copy of the
// document, so old versions stay intact in the history. No DOM.

/** @typedef {import('./model.js').Project} Project */

const HISTORY_LIMIT = 100;
const GROUP_WINDOW_MS = 1500;

/**
 * @param {Project} initial
 */
export function createStore(initial) {
  let doc = initial;
  /** @type {Project|null} */
  let savedDoc = initial;
  /** @type {Project[]} */
  let past = [];
  /** @type {Project[]} */
  let future = [];
  /** @type {string|null} */
  let lastGroup = null;
  let lastTime = 0;
  /** @type {Set<(doc: Project, reason: string) => void>} */
  const listeners = new Set();

  const emit = (/** @type {string} */ reason) => listeners.forEach((fn) => fn(doc, reason));

  return {
    get doc() {
      return doc;
    },

    /**
     * Applies an edit. Edits with the same `group` made in quick succession (a slider
     * drag) become a single undo step. With `sticky`, they merge until endGroup() is
     * called (a whole drag gesture or typing session).
     * @template R
     * @param {(draft: Project) => R} fn
     * @param {{group?: string, sticky?: boolean}} [opts]
     * @returns {R}
     */
    update(fn, opts = {}) {
      const draft = structuredClone(doc);
      const result = fn(draft);
      const now = Date.now();
      const merge = opts.group && opts.group === lastGroup && (opts.sticky || now - lastTime < GROUP_WINDOW_MS);
      if (!merge) {
        past.push(doc);
        if (past.length > HISTORY_LIMIT) past.shift();
      }
      future = [];
      lastGroup = opts.group ?? null;
      lastTime = now;
      doc = draft;
      emit('edit');
      return result;
    },

    /** Ends the current undo group so the next edit starts a new step. */
    endGroup() {
      lastGroup = null;
    },

    /**
     * Replaces the document (new/open). Clears history.
     * @param {Project} next
     * @param {{saved?: boolean}} [opts]
     */
    replace(next, opts = {}) {
      doc = next;
      past = [];
      future = [];
      lastGroup = null;
      savedDoc = opts.saved === false ? null : next;
      emit('replace');
    },

    undo() {
      const prev = past.pop();
      if (!prev) return false;
      future.push(doc);
      doc = prev;
      lastGroup = null;
      emit('undo');
      return true;
    },

    redo() {
      const next = future.pop();
      if (!next) return false;
      past.push(doc);
      doc = next;
      lastGroup = null;
      emit('redo');
      return true;
    },

    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,

    markSaved() {
      savedDoc = doc;
      emit('saved');
    },

    isDirty: () => doc !== savedDoc,

    /**
     * @param {(doc: Project, reason: string) => void} fn
     * @returns {() => void} unsubscribe
     */
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/** @typedef {ReturnType<typeof createStore>} Store */
