// @ts-check
// Small DOM helpers: escaping, dialogs, confirmations, toasts and pop-up menus.

import { icon } from './icons.js';

/** @param {unknown} s */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/**
 * @template {Element} T
 * @param {string} sel
 * @param {ParentNode} [root]
 * @returns {T}
 */
export function $(sel, root = document) {
  return /** @type {T} */ (root.querySelector(sel));
}

/**
 * Shows a modal dialog built from HTML. Resolves with the value passed to `close`.
 * Buttons with `data-close="value"` close it with that value.
 * @template T
 * @param {{title: string, subtitle?: string, body: string, buttons?: string, wide?: boolean,
 *   setup?: (root: HTMLElement, close: (v: T|null) => void) => void}} opts
 * @returns {Promise<T|null>}
 */
export function openDialog(opts) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.innerHTML = `<form method="dialog" class="dlg" style="${opts.wide ? 'width:880px' : 'width:480px'}">
      <div class="dlg-head"><h1>${esc(opts.title)}</h1>${opts.subtitle ? `<p>${esc(opts.subtitle)}</p>` : ''}</div>
      <div class="dlg-body">${opts.body}</div>
      <div class="dlg-foot">${opts.buttons ?? '<button class="btn primary" data-close="ok" value="ok">OK</button>'}</div>
    </form>`;
    let result = /** @type {T|null} */ (null);
    const close = (/** @type {T|null} */ v) => {
      result = v;
      dlg.close();
    };
    dlg.addEventListener('click', (e) => {
      const b = /** @type {HTMLElement} */ (e.target).closest('[data-close]');
      if (b) {
        e.preventDefault();
        close(/** @type {any} */ (b.getAttribute('data-close') || null));
      }
    });
    dlg.addEventListener('close', () => {
      dlg.remove();
      resolve(result);
    });
    document.body.appendChild(dlg);
    opts.setup?.(/** @type {HTMLElement} */ (dlg.firstElementChild), close);
    dlg.showModal();
    /** @type {HTMLElement|null} */ (dlg.querySelector('[autofocus], .btn.primary'))?.focus();
  });
}

/**
 * Yes/no question. Resolves to the chosen button's value ('yes', 'no', or null for cancel).
 * @param {{title: string, message: string, yes: string, no?: string, cancel?: string, danger?: boolean}} o
 */
export function ask(o) {
  return openDialog({
    title: o.title,
    body: `<p style="margin:0">${esc(o.message)}</p>`,
    buttons: `${o.cancel !== undefined ? `<button class="btn" data-close="">${esc(o.cancel || 'Cancel')}</button>` : ''}
      ${o.no ? `<button class="btn" data-close="no">${esc(o.no)}</button>` : ''}
      <button class="btn primary ${o.danger ? 'danger-primary' : ''}" data-close="yes">${esc(o.yes)}</button>`,
  });
}

/**
 * @param {string} message
 * @param {{error?: boolean, action?: string, onAction?: () => void, ms?: number}} [o]
 */
export function toast(message, o = {}) {
  const host = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast' + (o.error ? ' error' : '');
  el.innerHTML = `<span>${esc(message)}</span>${o.action ? `<button type="button">${esc(o.action)}</button>` : ''}`;
  el.querySelector('button')?.addEventListener('click', () => {
    o.onAction?.();
    el.remove();
  });
  host.appendChild(el);
  setTimeout(() => el.remove(), o.ms ?? (o.action ? 10000 : o.error ? 7000 : 3500));
  return el;
}

/**
 * @typedef {{label: string, icon?: string, kbd?: string, danger?: boolean, run: () => void} | 'sep'} MenuItem
 */

/**
 * Pop-up menu at a screen position. Closes on click elsewhere or Escape.
 * @param {number} x
 * @param {number} y
 * @param {MenuItem[]} items
 */
export function showMenu(x, y, items) {
  document.querySelector('.menu')?.remove();
  const menu = document.createElement('div');
  menu.className = 'menu';
  menu.setAttribute('role', 'menu');
  menu.innerHTML = items.map((it, i) => (it === 'sep' ? '<hr>' : `<button role="menuitem" data-i="${i}" class="${it.danger ? 'danger' : ''}">${it.icon ? icon(it.icon, 16) : '<span style="width:16px"></span>'}<span>${esc(it.label)}</span>${it.kbd ? `<kbd>${esc(it.kbd)}</kbd>` : ''}</button>`)).join('');
  document.body.appendChild(menu);
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
  menu.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
  const close = () => {
    menu.remove();
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', onKey, true);
  };
  const outside = (/** @type {Event} */ e) => {
    if (!menu.contains(/** @type {Node} */ (e.target))) close();
  };
  const onKey = (/** @type {KeyboardEvent} */ e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  menu.addEventListener('click', (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('button[data-i]');
    if (!b) return;
    const it = items[Number(b.getAttribute('data-i'))];
    close();
    if (it !== 'sep') it.run();
  });
  setTimeout(() => {
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', onKey, true);
  });
  /** @type {HTMLElement|null} */ (menu.querySelector('button'))?.focus();
}

/** True when keyboard focus is in a text field (so shortcuts should not fire). */
export function typingInField() {
  const a = document.activeElement;
  return !!a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button', 'color'].includes(/** @type {HTMLInputElement} */ (a).type)) || /** @type {HTMLElement} */ (a).isContentEditable);
}
