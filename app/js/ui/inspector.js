// @ts-check
// Right-hand panel. Shows controls for whatever is selected: the page, a photo slot,
// an empty slot, or text. Controls bind to document fields with data attributes:
//   data-bind="path"        range/number/textarea/select value (data-mul scales for display)
//   data-set="path" data-value="v"   button that sets a value (pressed when equal)
//   data-toggle="path"      button that flips a boolean
//   data-color="path"       swatch group (data-allow-none for "no color")
//   data-act="name"         runs an action

import { icon } from './icons.js';
import { $, esc } from './dom.js';
import { SHAPES } from '../shapes.js';
import { FONTS } from '../font-catalog.js';
import { getLayout } from '../layouts.js';
import { describeSize, orient, orientationOf } from '../page-sizes.js';
import { defaultAdjust, findPage, findCell, findTextBox } from '../model.js';
import { drawLayoutThumb } from './thumbs.js';
import { loadAllFonts } from '../fonts.js';
import { MAX_ZOOM } from '../geometry.js';

/** @typedef {import('../app.js').App} App */

const TEXT_COLORS = ['#222222', '#ffffff', '#6b6b6b', '#8b1e3f', '#c1121f', '#e76f51', '#f4a261', '#e9c46a', '#2a9d8f', '#264653', '#1d4e89', '#6a4c93', '#f8c8dc'];
const FILL_COLORS = ['#ffffff', '#f7f3ea', '#fdf0f3', '#eef6ee', '#eaf2fb', '#f2eefb', '#222222', '#e9c46a', '#f4a261', '#2a9d8f', '#264653', '#8b1e3f'];

/** @param {App} app */
export function createInspector(app) {
  const el = /** @type {HTMLElement} */ ($('#inspector'));
  let key = '';
  let fontListOpen = false;

  /** What the panel edits, resolved against a document. */
  function context() {
    const ui = app.ui;
    if (ui.selection?.kind === 'box') return { kind: 'box', id: ui.selection.id };
    if (ui.selection?.kind === 'cell') {
      const c = app.selectedCell;
      return { kind: c?.content?.kind === 'photo' ? 'photo' : c?.content?.kind === 'text' ? 'text-cell' : 'empty', id: ui.selection.id };
    }
    return { kind: 'page', id: app.ui.pageId };
  }

  /** Object that data-bind paths are relative to. @param {import('../model.js').Project} doc */
  function target(doc) {
    const ctx = context();
    const page = findPage(doc, app.ui.pageId);
    if (!page) return null;
    if (ctx.kind === 'page') return page;
    if (ctx.kind === 'box') return findTextBox(page, ctx.id) ?? null;
    const cell = findCell(page, ctx.id);
    if (!cell) return null;
    return ctx.kind === 'empty' ? cell : cell.content;
  }

  /** @param {any} obj @param {string} path */
  const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  /** @param {any} obj @param {string} path @param {any} v */
  const set = (obj, path, v) => {
    const keys = path.split('.');
    const last = keys.pop();
    const o = keys.reduce((x, k) => x[k], obj);
    o[last] = v;
  };

  /**
   * @param {string} path
   * @param {any} value
   * @param {{group?: string}} [opts]
   */
  function write(path, value, opts = {}) {
    const ctx = context();
    app.store.update((d) => {
      const t = target(d);
      if (!t) return;
      // Slot shapes live on the cell, not its content.
      if (path === 'shape' && ctx.kind !== 'page') {
        const cell = findCell(findPage(d, app.ui.pageId), ctx.id);
        if (cell) cell.shape = value;
        return;
      }
      set(t, path, value);
    }, opts);
  }

  // ---------- panel templates ----------

  const slider = (/** @type {string} */ label, /** @type {string} */ bind, /** @type {number} */ min, /** @type {number} */ max, /** @type {number} */ step, /** @type {number} */ mul, /** @type {string} */ ic, /** @type {string} */ unit = '') =>
    `<div class="slider"><label for="f-${bind}">${label}</label>${icon(ic, 16)}
      <input type="range" id="f-${bind}" data-bind="${bind}" data-mul="${mul}" min="${min}" max="${max}" step="${step}">
      <output data-out="${bind}" data-mul="${mul}" data-unit="${unit}"></output></div>`;

  const swatches = (/** @type {string} */ bind, /** @type {string[]} */ colors, allowNone = false) =>
    `<div class="swatches" data-color="${bind}">
      ${allowNone ? '<button class="swatch none" data-c="" title="None" aria-label="No color"></button>' : ''}
      ${colors.map((c) => `<button class="swatch" data-c="${c}" style="background:${c}" title="${c}" aria-label="Color ${c}"></button>`).join('')}
      <label class="swatch custom" title="Pick any color"><input type="color" data-custom-color="${bind}" aria-label="Custom color"></label>
    </div>`;

  const shapeGrid = () => `<div class="shapes" role="group" aria-label="Frame shape">${SHAPES.map((s) => `<button data-set="shape" data-value="${s.id}" title="${s.name}" aria-label="${s.name}">${shapeSvg(s)}</button>`).join('')}</div>`;

  function pagePanel() {
    const doc = app.doc, page = app.page;
    const n = doc.pages.length;
    const or = orientationOf(doc.pageSize);
    return `
      <div class="panel-head"><h1>Page ${app.pageIndex + 1}${n > 1 ? ` of ${n}` : ''}</h1></div>
      <div class="section">
        <div class="layout-preview"><canvas data-layout-thumb></canvas>
          <div class="field" style="flex:1"><strong>${esc(getLayout(page.layoutId).name)}</strong>
          <button class="btn" data-act="layout">${icon('layout-grid', 16)} Change layout</button></div></div>
      </div>
      <div class="section">
        <div class="row"><label style="flex:1">${esc(doc.pageSize.name)} · ${describeSize(doc.pageSize)}</label><button class="btn" data-act="size">Change</button></div>
        ${doc.pageSize.wPt !== doc.pageSize.hPt ? `<div class="seg full" role="group" aria-label="Orientation">
          <button data-act="portrait" aria-pressed="${or === 'portrait'}">Portrait</button>
          <button data-act="landscape" aria-pressed="${or === 'landscape'}">Landscape</button></div>` : ''}
      </div>
      <div class="section">
        ${slider('Space between photos', 'gapPt', 0, 48, 1, 1, 'move-horizontal', ' pt')}
        ${slider('Page margins', 'marginPt', 0, 96, 1, 1, 'maximize', ' pt')}
        ${slider('Rounded corners', 'frame.radiusPt', 0, 48, 1, 1, 'shapes', ' pt')}
        ${slider('Frame border', 'frame.borderPt', 0, 16, 0.5, 1, 'square-dashed', ' pt')}
        <div class="field"><label>Border color</label>${swatches('frame.borderColor', FILL_COLORS)}</div>
        <div class="field"><label>Background color</label>${swatches('background', FILL_COLORS)}</div>
        ${n > 1 ? `<button class="btn" data-act="all-pages">Use these settings on every page</button>` : ''}
      </div>
      <div class="section">
        <p class="hint">Click a photo or text on the page to change it. Drag one photo onto another to swap them.</p>
      </div>`;
  }

  function photoPanel() {
    const cropping = app.ui.mode === 'crop';
    return `
      <div class="panel-head"><h1>${cropping ? 'Crop photo' : 'Photo'}</h1>
        <button class="btn ghost icon-only" data-act="remove" title="Remove photo from this slot" aria-label="Remove photo">${icon('trash-2', 18)}</button></div>
      <div class="section">
        ${cropping ? `<p class="hint">Drag the photo to move it inside its frame. Scroll or use the slider to zoom.</p>
          <button class="btn primary" data-act="crop-done">${icon('check', 16)} Done cropping</button>` : ''}
        <div class="grid-btns">
          ${cropping ? '' : `<button class="btn" data-act="crop">${icon('crop', 20)}Crop</button>`}
          <button class="btn" data-act="rotate">${icon('rotate-cw', 20)}Rotate</button>
          <button class="btn" data-act="flip">${icon('flip-horizontal-2', 20)}Flip</button>
          <button class="btn" data-act="replace">${icon('replace', 20)}Replace</button>
        </div>
        <div class="seg full" role="group" aria-label="Photo fit">
          <button data-set="fit" data-value="fill">Fill frame</button>
          <button data-set="fit" data-value="fit">Show whole photo</button>
        </div>
        ${slider('Zoom', 'zoom', 100, MAX_ZOOM * 100, 1, 100, 'zoom-in', '%')}
      </div>
      <div class="section">
        <h2>Color</h2>
        ${slider('Brightness', 'adjust.brightness', -100, 100, 1, 100, 'sun')}
        ${slider('Contrast', 'adjust.contrast', -100, 100, 1, 100, 'contrast')}
        ${slider('Color strength', 'adjust.saturation', -100, 100, 1, 100, 'droplet')}
        ${slider('Warmth', 'adjust.warmth', -100, 100, 1, 100, 'thermometer')}
        <div class="seg full" role="group" aria-label="Look">
          <button data-set="adjust.preset" data-value="none">Original</button>
          <button data-set="adjust.preset" data-value="bw">Black &amp; white</button>
          <button data-set="adjust.preset" data-value="sepia">Sepia</button>
        </div>
        <button class="btn" data-act="reset-color">Reset colors</button>
      </div>
      <div class="section"><h2>Frame shape</h2>${shapeGrid()}</div>
      <div class="section"><button class="btn" data-act="to-text">${icon('type', 16)} Change to text</button></div>`;
  }

  function emptyPanel() {
    return `
      <div class="panel-head"><h1>Empty slot</h1></div>
      <div class="section">
        <button class="btn primary big" data-act="add-photo">${icon('image-plus', 20)} Add a photo</button>
        <p class="hint">Or drag a photo here from the strip at the bottom, or from File Explorer.</p>
        <button class="btn" data-act="to-text">${icon('type', 16)} Put text here instead</button>
      </div>
      <div class="section"><h2>Frame shape</h2>${shapeGrid()}</div>`;
  }

  /** @param {boolean} isBox */
  function textPanel(isBox) {
    const s = 'style.';
    return `
      <div class="panel-head"><h1>Text</h1>
        ${isBox ? `<button class="btn ghost icon-only" data-act="delete-box" title="Delete text box" aria-label="Delete text box">${icon('trash-2', 18)}</button>` : ''}</div>
      <div class="section">
        <textarea class="text-input" data-bind="text" aria-label="Text" spellcheck="true"></textarea>
        <div class="font-picker">
          <button class="btn" data-act="fonts" aria-haspopup="listbox" aria-expanded="false"><span data-font-name></span>${icon('chevron-down', 16)}</button>
          <div class="font-list" role="listbox" hidden>${fontList()}</div>
        </div>
        <div class="row">
          <input type="range" data-bind="${s}sizePt" data-mul="1" min="6" max="200" step="1" aria-label="Text size" style="flex:1">
          <input type="number" class="num-input" data-bind="${s}sizePt" data-mul="1" min="4" max="400" step="1" aria-label="Text size in points">
        </div>
        <div class="row wrap">
          <div class="seg" role="group" aria-label="Style">
            <button data-toggle="${s}bold" title="Bold" aria-label="Bold">${icon('bold', 16)}</button>
            <button data-toggle="${s}italic" title="Italic" aria-label="Italic">${icon('italic', 16)}</button>
          </div>
          <div class="seg" role="group" aria-label="Alignment">
            <button data-set="${s}align" data-value="left" title="Align left" aria-label="Align left">${icon('align-left', 16)}</button>
            <button data-set="${s}align" data-value="center" title="Center" aria-label="Center">${icon('align-center', 16)}</button>
            <button data-set="${s}align" data-value="right" title="Align right" aria-label="Align right">${icon('align-right', 16)}</button>
          </div>
          ${isBox ? '' : `<div class="seg" role="group" aria-label="Vertical position">
            <button data-set="${s}vAlign" data-value="top" title="Top" aria-label="Top">${icon('align-vertical-justify-start', 16)}</button>
            <button data-set="${s}vAlign" data-value="middle" title="Middle" aria-label="Middle">${icon('align-vertical-justify-center', 16)}</button>
            <button data-set="${s}vAlign" data-value="bottom" title="Bottom" aria-label="Bottom">${icon('align-vertical-justify-end', 16)}</button>
          </div>`}
        </div>
        <div class="field"><label>Text color</label>${swatches(`${s}color`, TEXT_COLORS)}</div>
        ${slider('Line spacing', `${s}lineHeight`, 0.8, 2, 0.05, 1, 'move-horizontal', '×')}
      </div>
      <div class="section">
        <h2>Effects</h2>
        <div class="row">
          <button class="btn" data-toggle="${s}shadow">Shadow</button>
          <button class="btn" data-toggle="${s}outline">Outline</button>
        </div>
        <div class="field" data-when="${s}outline"><label>Outline color</label>${swatches(`${s}outlineColor`, TEXT_COLORS)}</div>
        <div class="field"><label>Background</label>${swatches(`${s}background`, FILL_COLORS, true)}</div>
      </div>
      ${isBox ? `<div class="section"><div class="row wrap">
          <button class="btn" data-act="dup-box">${icon('copy', 16)} Duplicate</button>
          <button class="btn" data-act="front">${icon('bring-to-front', 16)} Bring to front</button></div>
          <p class="hint">Drag the box to move it. Drag the side handles to change its width, the corner to resize, or the round handle to rotate.</p></div>`
        : `<div class="section"><h2>Frame shape</h2>${shapeGrid()}<button class="btn" data-act="to-photo">${icon('image', 16)} Change to photo slot</button></div>`}`;
  }

  function fontList() {
    const cats = ['Sans', 'Serif', 'Script', 'Handwriting', 'Display'];
    return cats.map((c) => `<h3>${c}</h3>${FONTS.filter((f) => f.category === c).map((f) => `<button role="option" data-font="${esc(f.family)}" style="font-family:'${esc(f.family)}'">${esc(f.family)}</button>`).join('')}`).join('');
  }

  // ---------- build + sync ----------

  function build() {
    const ctx = context();
    el.innerHTML = ctx.kind === 'page' ? pagePanel() : ctx.kind === 'photo' ? photoPanel() : ctx.kind === 'empty' ? emptyPanel() : textPanel(ctx.kind === 'box');
    fontListOpen = false;
    const thumb = /** @type {HTMLCanvasElement|null} */ (el.querySelector('[data-layout-thumb]'));
    if (thumb) drawLayoutThumb(thumb, app.doc.pageSize, app.page.layoutId, 64, app.page);
  }

  function sync() {
    const t = target(app.doc);
    if (!t) return;
    el.querySelectorAll('[data-bind]').forEach((n) => {
      const input = /** @type {HTMLInputElement} */ (n);
      if (document.activeElement === input) return;
      const v = get(t, input.getAttribute('data-bind'));
      const mul = Number(input.getAttribute('data-mul') || 1);
      const str = typeof v === 'number' ? String(Math.round(v * mul * 100) / 100) : String(v ?? '');
      if (input.value !== str) input.value = str;
    });
    el.querySelectorAll('[data-out]').forEach((n) => {
      const v = Number(get(t, n.getAttribute('data-out')) ?? 0) * Number(n.getAttribute('data-mul') || 1);
      const unit = n.getAttribute('data-unit') ?? '';
      const r = Math.round(v * 10) / 10;
      n.textContent = unit === '%' ? `${Math.round(v)}%` : unit ? `${r}${unit}` : `${r > 0 ? '+' : ''}${Math.round(v * 100) / 100}`;
    });
    el.querySelectorAll('[data-set]').forEach((n) => {
      const path = n.getAttribute('data-set');
      const cur = path === 'shape' ? app.selectedCell?.shape : get(t, path);
      n.setAttribute('aria-pressed', String(String(cur) === n.getAttribute('data-value')));
    });
    el.querySelectorAll('[data-toggle]').forEach((n) => n.setAttribute('aria-pressed', String(!!get(t, n.getAttribute('data-toggle')))));
    el.querySelectorAll('[data-color]').forEach((g) => {
      const cur = String(get(t, g.getAttribute('data-color')) ?? '').toLowerCase();
      let matched = false;
      g.querySelectorAll('[data-c]').forEach((b) => {
        const on = b.getAttribute('data-c').toLowerCase() === cur;
        matched ||= on;
        b.setAttribute('aria-pressed', String(on));
      });
      const custom = /** @type {HTMLInputElement|null} */ (g.querySelector('[data-custom-color]'));
      if (custom && cur) custom.value = cur.length === 7 ? cur : '#000000';
      g.querySelector('.custom')?.setAttribute('aria-pressed', String(!matched && !!cur));
    });
    el.querySelectorAll('[data-when]').forEach((n) => { /** @type {HTMLElement} */ (n).hidden = !get(t, n.getAttribute('data-when')); });
    const fontName = /** @type {HTMLElement|null} */ (el.querySelector('[data-font-name]'));
    const style = /** @type {any} */ (t).style;
    if (fontName && style) {
      fontName.textContent = style.font;
      fontName.style.fontFamily = `'${style.font}'`;
      el.querySelectorAll('[data-font]').forEach((b) => b.setAttribute('aria-selected', String(b.getAttribute('data-font') === style.font)));
    }
  }

  // ---------- events ----------

  el.addEventListener('input', (e) => {
    const n = /** @type {HTMLInputElement} */ (e.target);
    const bind = n.getAttribute('data-bind');
    if (bind) {
      const mul = Number(n.getAttribute('data-mul') || 1);
      const value = n.type === 'range' || n.type === 'number' ? Number(n.value) / mul : n.value;
      if (typeof value === 'number' && !Number.isFinite(value)) return;
      write(bind, value, { group: `field:${bind}` });
      return;
    }
    const cc = n.getAttribute('data-custom-color');
    if (cc) write(cc, n.value, { group: `color:${cc}` });
  });
  el.addEventListener('change', () => app.store.endGroup());

  el.addEventListener('click', (e) => {
    const t = /** @type {HTMLElement} */ (e.target);
    const setBtn = t.closest('[data-set]');
    if (setBtn) {
      write(setBtn.getAttribute('data-set'), setBtn.getAttribute('data-value'));
      return;
    }
    const tog = t.closest('[data-toggle]');
    if (tog) {
      const path = tog.getAttribute('data-toggle');
      write(path, !get(target(app.doc), path));
      return;
    }
    const sw = t.closest('[data-c]');
    if (sw) {
      const path = sw.closest('[data-color]').getAttribute('data-color');
      write(path, sw.getAttribute('data-c') || null);
      return;
    }
    const font = t.closest('[data-font]');
    if (font) {
      write('style.font', font.getAttribute('data-font'));
      toggleFonts(false);
      return;
    }
    const act = t.closest('[data-act]')?.getAttribute('data-act');
    if (act) runAct(act);
  });

  document.addEventListener('pointerdown', (e) => {
    if (fontListOpen && !/** @type {HTMLElement} */ (e.target).closest('.font-picker')) toggleFonts(false);
  });

  /** @param {boolean} open */
  function toggleFonts(open) {
    const list = /** @type {HTMLElement|null} */ (el.querySelector('.font-list'));
    if (!list) return;
    fontListOpen = open;
    list.hidden = !open;
    el.querySelector('[data-act=fonts]')?.setAttribute('aria-expanded', String(open));
    if (open) {
      loadAllFonts();
      /** @type {HTMLElement|null} */ (list.querySelector('[aria-selected=true]'))?.scrollIntoView({ block: 'center' });
    }
  }

  /** @param {string} act */
  function runAct(act) {
    const a = app.actions;
    const ctx = context();
    const id = ctx.id;
    switch (act) {
      case 'layout': return a.changeLayout();
      case 'size': return a.changePageSize();
      case 'portrait':
      case 'landscape':
        return app.store.update((d) => { d.pageSize = orient(d.pageSize, act); });
      case 'all-pages': return a.applyStyleToAllPages();
      case 'crop': return a.enterCrop(id);
      case 'crop-done': return a.exitCrop(true);
      case 'rotate': return a.rotate(id);
      case 'flip': return a.flip(id);
      case 'replace': return a.addPhotos(null, { cellId: id, single: true });
      case 'remove': return a.deleteSelection();
      case 'reset-color': return write('adjust', defaultAdjust());
      case 'to-text': return a.toggleTextSlot(id);
      case 'to-photo': return a.toggleTextSlot(id);
      case 'add-photo': return a.addPhotos(null, { cellId: id, single: true });
      case 'delete-box': return a.deleteSelection();
      case 'dup-box': return a.duplicateBox(id);
      case 'front': return a.bringToFront(id);
      case 'fonts': return toggleFonts(!fontListOpen);
    }
  }

  return {
    update() {
      const ctx = context();
      const k = `${ctx.kind}:${ctx.id}:${app.ui.mode}:${app.doc.pages.length}:${app.page.layoutId}:${app.doc.pageSize.wPt}x${app.doc.pageSize.hPt}:${app.pageIndex}`;
      if (k !== key) {
        key = k;
        build();
      }
      sync();
    },
  };
}

/** Small SVG preview of a frame shape. @param {import('../shapes.js').ShapeDef} s */
function shapeSvg(s) {
  const common = 'fill="currentColor" fill-opacity="0.18" stroke="currentColor" stroke-width="1.5" vector-effect="non-scaling-stroke"';
  let inner;
  if (s.kind === 'rect') inner = `<rect x="0.08" y="0.2" width="0.84" height="0.6" ${common}/>`;
  else if (s.kind === 'rounded') inner = `<rect x="0.08" y="0.2" width="0.84" height="0.6" rx="0.14" ${common}/>`;
  else if (s.kind === 'ellipse') inner = s.keepAspect ? `<circle cx="0.5" cy="0.5" r="0.4" ${common}/>` : `<ellipse cx="0.5" cy="0.5" rx="0.44" ry="0.3" ${common}/>`;
  else inner = `<g transform="translate(0.08 0.08) scale(0.84)"><path d="${s.d}" ${common}/></g>`;
  return `<svg viewBox="0 0 1 1" aria-hidden="true">${inner}</svg>`;
}
