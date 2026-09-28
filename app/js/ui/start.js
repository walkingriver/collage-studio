// @ts-check
// Start screen: new, open, recent collages, and "pick up where you left off".

import { $, esc } from './dom.js';
import { icon } from './icons.js';
import { recent } from '../io/db.js';
import { canUseFileDialogs } from '../io/fs.js';
import { clearSession } from '../io/autosave.js';

/** @typedef {import('../io/autosave.js').Session} Session */

/** @param {import('../app.js').App} app */
export function createStart(app) {
  const el = /** @type {HTMLElement} */ ($('#start'));
  /** @type {Session|null} */
  let session = null;
  /** @type {Array<{id: string, name: string, handle: any, thumb: string, savedAt: number}>} */
  let recents = [];

  async function render() {
    recents = canUseFileDialogs ? (await recent.all().catch(() => [])).sort((a, b) => b.savedAt - a.savedAt) : [];
    const when = (/** @type {number} */ t) => new Date(t).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    el.innerHTML = `<div class="start-inner">
      <div class="start-hero"><img src="icons/icon-192.png" alt="">
        <div><h1>Collage Studio</h1><p>Pick a layout, drop in your photos, add a few words, then print or save.</p></div></div>
      ${session ? `<div class="banner" role="alert">${icon('save', 20)}
        <p>You have unsaved work from ${esc(when(session.savedAt))}: <strong>${esc(session.doc.title)}</strong>.</p>
        <button class="btn primary" data-a="restore">Pick up where I left off</button>
        <button class="btn" data-a="discard">Discard</button></div>` : ''}
      <div class="start-actions">
        <button class="btn primary big" data-a="new">${icon('file-plus', 22)} New collage</button>
        <button class="btn big" data-a="open">${icon('folder-open', 22)} Open a saved collage</button>
      </div>
      ${recents.length ? `<div><h2>Recent collages</h2><div class="recent-grid">${recents.map((r) => `
        <div class="recent-card" role="button" tabindex="0" data-recent="${esc(r.id)}" title="Open ${esc(r.name)}">
          <img src="${r.thumb}" alt="">
          <strong>${esc(r.name.replace(/\.collage$/i, ''))}</strong><small>${esc(when(r.savedAt))}</small>
          <button class="forget" data-forget="${esc(r.id)}" title="Remove from this list" aria-label="Remove ${esc(r.name)} from recent">${icon('x', 14)}</button>
        </div>`).join('')}</div></div>` : ''}
      <p class="hint">Your photos stay on this computer. Nothing is uploaded. · <a href="support.html" target="_blank" rel="noopener">Help</a> · <a href="privacy.html" target="_blank" rel="noopener">Privacy</a></p>
    </div>`;
  }

  el.addEventListener('click', async (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const forget = t.closest('[data-forget]')?.getAttribute('data-forget');
    if (forget) {
      e.stopPropagation();
      await recent.delete(forget);
      render();
      return;
    }
    const rid = t.closest('[data-recent]')?.getAttribute('data-recent');
    if (rid) {
      const entry = recents.find((r) => r.id === rid);
      if (entry) app.actions.openRecent(entry);
      return;
    }
    switch (t.closest('[data-a]')?.getAttribute('data-a')) {
      case 'new': return app.actions.newCollage();
      case 'open': return app.actions.openCollage();
      case 'restore':
        if (session) app.actions.startProject(session.doc, { handle: session.handle, name: session.fileName }, { saved: false });
        return;
      case 'discard':
        session = null;
        await clearSession();
        render();
        return;
    }
  });
  el.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && /** @type {HTMLElement} */ (e.target).matches('[data-recent]')) {
      e.preventDefault();
      /** @type {HTMLElement} */ (e.target).click();
    }
  });
  document.addEventListener('cs:recent-changed', () => {
    if (!el.hidden) render();
  });

  return {
    /** @param {Session|null} [s] */
    async show(s) {
      if (s !== undefined) session = s;
      await render();
      el.hidden = false;
      /** @type {HTMLElement} */ ($('#app')).hidden = true;
      /** @type {HTMLElement|null} */ (el.querySelector('.btn.primary'))?.focus();
    },
    hide() {
      session = null;
      el.hidden = true;
      /** @type {HTMLElement} */ ($('#app')).hidden = false;
      app.requestRender();
    },
  };
}
