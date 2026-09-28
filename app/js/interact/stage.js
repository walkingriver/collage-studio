// @ts-check
// The editor canvas: draws the current page, and handles every pointer interaction on it
// (select, drag photos between slots, crop, move/resize/rotate text boxes, in-place text
// editing, drops from the tray or File Explorer, zoom).

import { renderPage, measureTextBox } from '../render.js';
import { frameRect, panCrop, pointInRotRect, toLocal, toPage, MAX_ZOOM } from '../geometry.js';
import { shapePath } from '../shapes.js';
import { layoutText } from '../text.js';
import { swapCells, placePhoto } from '../model.js';
import { icon } from '../ui/icons.js';
import { $, showMenu } from '../ui/dom.js';

/** @typedef {import('../app.js').App} App */
/** @typedef {import('../model.js').Cell} Cell */
/** @typedef {import('../model.js').TextBox} TextBox */
/** @typedef {import('../geometry.js').RotRect} RotRect */

export const PHOTO_DRAG_TYPE = 'application/x-collage-photo';

const HANDLE_PX = 9;
const ROTATE_OFFSET_PX = 26;
const DRAG_THRESHOLD_PX = 5;

/**
 * @typedef {{kind: 'handle', box: TextBox, handle: 'left'|'right'|'scale'|'rotate'}
 *   | {kind: 'box', box: TextBox}
 *   | {kind: 'cell', cell: Cell}
 *   | {kind: 'page'} | {kind: 'none'}} Hit
 */

/** @param {App} app */
export function createStage(app) {
  const el = /** @type {HTMLElement} */ ($('#stage'));
  const canvas = /** @type {HTMLCanvasElement} */ ($('#stage-canvas'));
  const hud = /** @type {HTMLElement} */ ($('#stage-hud'));
  const ctx = canvas.getContext('2d');
  // Identity-transform context used for hit testing and measuring in points.
  const mctx = document.createElement('canvas').getContext('2d');

  let dpr = 1;
  let zoom = 1; // relative to "fit"
  let panX = 0, panY = 0; // css px, when zoomed in
  const view = { scale: 1, ox: 0, oy: 0 };
  /** @type {string|null} */
  let hoverCellId = null;
  let colors = readColors();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    colors = readColors();
    app.requestRender();
  });

  new ResizeObserver(() => app.requestRender()).observe(el);

  // ---------- view math ----------

  function layoutView() {
    const size = app.doc.pageSize;
    const w = el.clientWidth, h = el.clientHeight;
    const pad = 40;
    const fit = Math.max(0.05, Math.min((w - pad * 2) / size.wPt, (h - pad * 2) / size.hPt));
    view.scale = fit * zoom;
    const pw = size.wPt * view.scale, ph = size.hPt * view.scale;
    const maxPanX = Math.max(0, (pw - w) / 2 + pad), maxPanY = Math.max(0, (ph - h) / 2 + pad);
    panX = Math.max(-maxPanX, Math.min(maxPanX, panX));
    panY = Math.max(-maxPanY, Math.min(maxPanY, panY));
    view.ox = (w - pw) / 2 + panX;
    view.oy = (h - ph) / 2 + panY;
  }

  /** @param {{clientX: number, clientY: number}} e */
  function toPt(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left - view.ox) / view.scale, y: (e.clientY - r.top - view.oy) / view.scale };
  }

  // ---------- hit testing ----------

  /** @param {TextBox} box */
  function boxRect(box) {
    return measureTextBox(mctx, box).rect;
  }

  /** @param {RotRect} r */
  function handlePoints(r) {
    const off = ROTATE_OFFSET_PX / view.scale;
    return {
      left: toPage(r, 0, r.h / 2),
      right: toPage(r, r.w, r.h / 2),
      scale: toPage(r, r.w, r.h),
      rotate: toPage(r, r.w / 2, -off),
      top: toPage(r, r.w / 2, 0),
    };
  }

  /** @param {{x: number, y: number}} pt @returns {Hit} */
  function hit(pt) {
    const page = app.page, size = app.doc.pageSize;
    const box = app.selectedBox;
    if (box && app.ui.mode === 'normal') {
      const hp = handlePoints(boxRect(box));
      const tol = HANDLE_PX / view.scale;
      for (const h of /** @type {const} */ (['rotate', 'scale', 'left', 'right'])) {
        if (Math.hypot(pt.x - hp[h].x, pt.y - hp[h].y) <= tol) return { kind: 'handle', box, handle: h };
      }
    }
    for (let i = page.textBoxes.length - 1; i >= 0; i--) {
      const b = page.textBoxes[i];
      if (pointInRotRect(boxRect(b), pt.x, pt.y, 4 / view.scale)) return { kind: 'box', box: b };
    }
    for (let i = page.cells.length - 1; i >= 0; i--) {
      const c = page.cells[i];
      if (mctx.isPointInPath(shapePath(c.shape, frameRect(page, size, c), page.frame.radiusPt), pt.x, pt.y)) return { kind: 'cell', cell: c };
    }
    if (pt.x >= 0 && pt.y >= 0 && pt.x <= size.wPt && pt.y <= size.hPt) return { kind: 'page' };
    return { kind: 'none' };
  }

  // ---------- rendering ----------

  function render() {
    layoutView();
    dpr = window.devicePixelRatio || 1;
    const w = Math.round(el.clientWidth * dpr), h = Math.round(el.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const doc = app.doc, page = app.page, ui = app.ui;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Page with a soft shadow
    const k = dpr * view.scale;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.22)';
    ctx.shadowBlur = 18 * dpr;
    ctx.shadowOffsetY = 4 * dpr;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(view.ox * dpr, view.oy * dpr, doc.pageSize.wPt * k, doc.pageSize.hPt * k);
    ctx.restore();

    ctx.setTransform(k, 0, 0, k, view.ox * dpr, view.oy * dpr);
    renderPage(ctx, doc, page, {
      pxPerPt: k,
      mode: 'screen',
      getImage: (cell) => {
        if (cell.content?.kind !== 'photo') return null;
        const img = app.photos.drawable(cell.content);
        return img ? { img, prefiltered: true } : null;
      },
      skipTextId: ui.editing?.id ?? null,
      cropCellId: ui.mode === 'crop' ? ui.selection?.id : null,
    });
    drawOverlay();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    updateHud();
    positionEditor();
  }

  function drawOverlay() {
    const page = app.page, size = app.doc.pageSize, ui = app.ui;
    const px = 1 / view.scale;
    const outline = (/** @type {Path2D} */ path, /** @type {string} */ color, /** @type {number} */ width) => {
      ctx.lineWidth = (width + 2) * px;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.stroke(path);
      ctx.lineWidth = width * px;
      ctx.strokeStyle = color;
      ctx.stroke(path);
    };
    const cellPath = (/** @type {Cell} */ c) => shapePath(c.shape, frameRect(page, size, c), page.frame.radiusPt);

    for (const c of page.cells) {
      if (c.id === ui.dragSource) {
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fill(cellPath(c));
      }
      if (c.id === ui.dropTarget) {
        ctx.fillStyle = colors.accentSoft;
        ctx.fill(cellPath(c));
        outline(cellPath(c), colors.accent, 3);
      } else if (ui.selection?.kind === 'cell' && ui.selection.id === c.id) {
        outline(cellPath(c), colors.accent, ui.mode === 'crop' ? 3 : 2.5);
      } else if (c.id === hoverCellId && !ui.dragSource) {
        outline(cellPath(c), colors.hover, 1.5);
      }
    }

    const box = app.selectedBox;
    if (box && ui.mode === 'normal') {
      const r = boxRect(box);
      ctx.save();
      ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
      ctx.rotate((r.rotation * Math.PI) / 180);
      ctx.setLineDash([5 * px, 4 * px]);
      ctx.lineWidth = 1.5 * px;
      ctx.strokeStyle = colors.accent;
      ctx.strokeRect(-r.w / 2, -r.h / 2, r.w, r.h);
      ctx.setLineDash([]);
      ctx.restore();
      if (!ui.editing) {
        const hp = handlePoints(r);
        ctx.beginPath();
        ctx.moveTo(hp.top.x, hp.top.y);
        ctx.lineTo(hp.rotate.x, hp.rotate.y);
        ctx.lineWidth = 1.5 * px;
        ctx.strokeStyle = colors.accent;
        ctx.stroke();
        for (const [name, p] of Object.entries(hp)) {
          if (name === 'top') continue;
          ctx.beginPath();
          if (name === 'rotate') ctx.arc(p.x, p.y, 6 * px, 0, Math.PI * 2);
          else ctx.rect(p.x - 5 * px, p.y - 5 * px, 10 * px, 10 * px);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.lineWidth = 1.5 * px;
          ctx.stroke();
        }
      }
    }
  }

  // ---------- HUD (zoom bar, crop bar) ----------

  hud.innerHTML = `
    <div class="zoom-bar" role="group" aria-label="Zoom">
      <button class="btn ghost icon-only" data-z="out" title="Zoom out (Ctrl + -)">${icon('zoom-out', 18)}</button>
      <output data-z="pct">100%</output>
      <button class="btn ghost icon-only" data-z="in" title="Zoom in (Ctrl + +)">${icon('zoom-in', 18)}</button>
      <button class="btn ghost" data-z="fit" title="Fit page to window (Ctrl + 0)">${icon('maximize', 16)} Fit</button>
    </div>
    <div class="crop-bar" hidden>
      <span>Drag to move the photo · scroll to zoom</span>
      <input type="range" min="1" max="${MAX_ZOOM}" step="0.01" aria-label="Zoom photo">
      <button class="btn" data-crop="cancel">Cancel</button>
      <button class="btn primary" data-crop="done">${icon('check', 16)} Done</button>
    </div>`;
  const zoomOut = /** @type {HTMLOutputElement} */ (hud.querySelector('[data-z=pct]'));
  const cropBar = /** @type {HTMLElement} */ (hud.querySelector('.crop-bar'));
  const cropSlider = /** @type {HTMLInputElement} */ (cropBar.querySelector('input'));
  hud.addEventListener('click', (e) => {
    const b = /** @type {HTMLElement} */ (e.target).closest('button');
    if (!b) return;
    const z = b.getAttribute('data-z');
    if (z === 'in') setZoom(zoom * 1.25);
    else if (z === 'out') setZoom(zoom / 1.25);
    else if (z === 'fit') setZoom(1, true);
    const c = b.getAttribute('data-crop');
    if (c) app.actions.exitCrop(c === 'done');
  });
  cropSlider.addEventListener('input', () => {
    const cell = app.selectedCell;
    if (cell) app.editCell(cell.id, (c) => { if (c.content?.kind === 'photo') c.content.zoom = Number(cropSlider.value); }, { group: 'crop', sticky: true });
  });

  let lastStatus = '';
  /** Describes the selection for screen readers. */
  function announce() {
    const ui = app.ui, page = app.page;
    let msg = 'Nothing selected. Use the arrow keys to choose a slot.';
    const cell = app.selectedCell, box = app.selectedBox;
    if (cell) {
      const n = page.cells.indexOf(cell) + 1;
      const c = cell.content;
      const what = c?.kind === 'photo' ? `photo ${app.doc.photos[c.photoId]?.name ?? ''}. Enter to crop, Delete to remove` : c?.kind === 'text' ? `text: ${c.text}. Enter to edit` : 'empty. Enter to add a photo';
      msg = ui.mode === 'crop' ? 'Cropping. Drag or scroll to adjust, Enter when done, Escape to cancel.' : `Slot ${n} of ${page.cells.length}, ${what}.`;
    } else if (box) {
      msg = `Text box: ${box.text}. Enter to edit, arrow keys to move, Delete to remove.`;
    }
    if (msg !== lastStatus) {
      lastStatus = msg;
      const sr = document.getElementById('sr-status');
      if (sr) sr.textContent = msg;
    }
  }

  function updateHud() {
    announce();
    zoomOut.value = `${Math.round(zoom * 100)}%`;
    const cropping = app.ui.mode === 'crop';
    cropBar.hidden = !cropping;
    const c = app.selectedCell?.content;
    if (cropping && c?.kind === 'photo' && document.activeElement !== cropSlider) cropSlider.value = String(c.zoom);
  }

  /** @param {number} z @param {boolean} [reset] */
  function setZoom(z, reset = false) {
    zoom = Math.max(0.25, Math.min(6, z));
    if (reset) panX = panY = 0;
    app.requestRender();
  }

  // ---------- pointer interaction ----------

  /**
   * @typedef {object} Op
   * @property {'move-box'|'left'|'right'|'scale'|'rotate'|'drag-cell'|'pan-crop'|'pan-view'} type
   * @property {number} pointerId
   * @property {number} sx  start clientX
   * @property {number} sy
   * @property {{x: number, y: number}} startPt
   * @property {boolean} active
   * @property {any} [box]  box snapshot at start
   * @property {RotRect} [rect]
   * @property {string} [cellId]
   * @property {HTMLElement} [ghost]
   * @property {{x: number, y: number}} [last]
   */
  /** @type {Op|null} */
  let op = null;
  /** Keeps pointer events coming while dragging outside the canvas. @param {number} id */
  const capture = (id) => {
    try {
      canvas.setPointerCapture(id);
    } catch {
      // The pointer is already gone (e.g. a very quick tap); nothing to capture.
    }
  };
  /** @type {Map<number, {x: number, y: number}>} */
  const pointers = new Map();
  let pinchStart = /** @type {{dist: number, zoom: number}|null} */ (null);

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    canvas.focus({ preventScroll: true });
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pt = toPt(e);
    const ui = app.ui;

    if (ui.mode === 'crop') {
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const c = app.selectedCell?.content;
        pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: c?.kind === 'photo' ? c.zoom : 1 };
        return;
      }
      const h = hit(pt);
      if (h.kind === 'none') {
        app.actions.exitCrop(true);
        return;
      }
      op = { type: 'pan-crop', pointerId: e.pointerId, sx: e.clientX, sy: e.clientY, startPt: pt, last: pt, active: true };
      capture(e.pointerId);
      return;
    }

    const h = hit(pt);
    const base = { pointerId: e.pointerId, sx: e.clientX, sy: e.clientY, startPt: pt, active: false };
    if (h.kind === 'handle') {
      op = { ...base, type: h.handle, box: structuredClone(h.box), rect: boxRect(h.box), active: true };
    } else if (h.kind === 'box') {
      app.select({ kind: 'box', id: h.box.id });
      op = { ...base, type: 'move-box', box: structuredClone(h.box) };
    } else if (h.kind === 'cell') {
      app.select({ kind: 'cell', id: h.cell.id });
      if (h.cell.content) op = { ...base, type: 'drag-cell', cellId: h.cell.id };
    } else {
      app.select(null);
      if (zoom > 1) op = { ...base, type: 'pan-view', last: { x: e.clientX, y: e.clientY } };
    }
    if (op) capture(e.pointerId);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinchStart && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const z = Math.min(MAX_ZOOM, Math.max(1, (pinchStart.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / pinchStart.dist));
      const cell = app.selectedCell;
      if (cell) app.editCell(cell.id, (c) => { if (c.content?.kind === 'photo') c.content.zoom = z; }, { group: 'crop', sticky: true });
      return;
    }
    const pt = toPt(e);
    if (!op) {
      updateHover(pt);
      return;
    }
    if (e.pointerId !== op.pointerId) return;
    if (!op.active) {
      if (Math.hypot(e.clientX - op.sx, e.clientY - op.sy) < DRAG_THRESHOLD_PX) return;
      op.active = true;
      if (op.type === 'drag-cell') startCellDrag(op);
    }
    const dx = pt.x - op.startPt.x, dy = pt.y - op.startPt.y;
    switch (op.type) {
      case 'move-box': {
        const b0 = op.box;
        app.editBox(b0.id, (b) => {
          b.xPt = b0.xPt + dx;
          b.yPt = b0.yPt + dy;
        }, { group: 'move-box', sticky: true });
        break;
      }
      case 'left':
      case 'right':
        resizeBox(op, pt);
        break;
      case 'scale':
        scaleBox(op, pt);
        break;
      case 'rotate':
        rotateBox(op, pt, e.shiftKey);
        break;
      case 'drag-cell':
        moveCellDrag(op, e);
        break;
      case 'pan-crop': {
        const cell = app.selectedCell;
        const last = op.last;
        op.last = pt;
        if (!cell || cell.content?.kind !== 'photo') break;
        const meta = app.doc.photos[cell.content.photoId];
        const frame = frameRect(app.page, app.doc.pageSize, cell);
        const next = panCrop(cell.content, meta, frame, pt.x - last.x, pt.y - last.y);
        app.editCell(cell.id, (c) => {
          if (c.content?.kind === 'photo') Object.assign(c.content, next);
        }, { group: 'crop', sticky: true });
        break;
      }
      case 'pan-view': {
        panX += e.clientX - op.last.x;
        panY += e.clientY - op.last.y;
        op.last = { x: e.clientX, y: e.clientY };
        app.requestRender();
        break;
      }
    }
  });

  const endPointer = (/** @type {PointerEvent} */ e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchStart = null;
    if (!op || e.pointerId !== op.pointerId) return;
    if (op.type === 'drag-cell' && op.active) finishCellDrag(op, e);
    if (op.type !== 'pan-crop') app.store.endGroup();
    op = null;
  };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', (e) => {
    if (op?.type === 'drag-cell' && op.active) cancelCellDrag(op);
    endPointer(e);
  });

  /** @param {{x: number, y: number}} pt */
  function updateHover(pt) {
    const h = app.ui.mode === 'crop' ? /** @type {Hit} */ ({ kind: 'page' }) : hit(pt);
    const id = h.kind === 'cell' ? h.cell.id : null;
    if (id !== hoverCellId) {
      hoverCellId = id;
      app.requestRender();
    }
    let cursor = 'default';
    if (app.ui.mode === 'crop') cursor = 'move';
    else if (h.kind === 'handle') cursor = h.handle === 'rotate' ? 'grab' : h.handle === 'scale' ? 'nwse-resize' : 'ew-resize';
    else if (h.kind === 'box') cursor = 'move';
    else if (h.kind === 'cell') cursor = h.cell.content ? 'grab' : 'pointer';
    else if (zoom > 1) cursor = 'grab';
    canvas.style.cursor = cursor;
  }
  canvas.addEventListener('pointerleave', () => {
    if (hoverCellId) {
      hoverCellId = null;
      app.requestRender();
    }
  });

  // Text box geometry edits

  /** @param {Op} op @param {{x: number, y: number}} pt */
  function resizeBox(op, pt) {
    const r = op.rect, b0 = op.box;
    const local = toLocal(r, pt.x, pt.y);
    const newW = Math.max(40, op.type === 'right' ? local.x : r.w - local.x);
    const shift = (op.type === 'right' ? 1 : -1) * (newW - r.w) / 2;
    const a = (r.rotation * Math.PI) / 180;
    const cx = r.x + r.w / 2 + shift * Math.cos(a), cy = r.y + r.h / 2 + shift * Math.sin(a);
    app.editBox(b0.id, (b) => {
      b.wPt = newW;
      b.xPt = cx - newW / 2;
      b.yPt = cy - r.h / 2;
    }, { group: 'resize-box', sticky: true });
  }

  /** @param {Op} op @param {{x: number, y: number}} pt */
  function scaleBox(op, pt) {
    const r = op.rect, b0 = op.box;
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const d0 = Math.hypot(op.startPt.x - cx, op.startPt.y - cy) || 1;
    const k = Math.max(0.15, Math.hypot(pt.x - cx, pt.y - cy) / d0);
    app.editBox(b0.id, (b) => {
      b.style.sizePt = Math.max(6, Math.min(400, b0.style.sizePt * k));
      b.wPt = Math.max(40, b0.wPt * k);
      b.xPt = cx - b.wPt / 2;
      b.yPt = cy - (r.h * k) / 2;
    }, { group: 'scale-box', sticky: true });
  }

  /** @param {Op} op @param {{x: number, y: number}} pt @param {boolean} fine */
  function rotateBox(op, pt, fine) {
    const r = op.rect;
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    let deg = (Math.atan2(pt.y - cy, pt.x - cx) * 180) / Math.PI + 90;
    if (fine) deg = Math.round(deg / 15) * 15;
    else for (const snap of [-360, -270, -180, -90, 0, 90, 180, 270, 360]) if (Math.abs(deg - snap) < 4) deg = snap;
    deg = ((deg % 360) + 540) % 360 - 180;
    app.editBox(op.box.id, (b) => {
      b.rotation = Math.round(deg * 10) / 10;
    }, { group: 'rotate-box', sticky: true });
  }

  // Dragging a slot onto another slot (swap) or onto the tray (remove)

  /** @param {Op} op */
  function startCellDrag(op) {
    const cell = app.page.cells.find((c) => c.id === op.cellId);
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    if (cell?.content?.kind === 'photo') {
      const url = app.photos.thumb(cell.content.photoId);
      ghost.style.background = url ? `center / cover url("${url}")` : '#ccc';
    } else {
      ghost.style.background = '#fff';
      ghost.style.display = 'grid';
      ghost.style.placeItems = 'center';
      ghost.textContent = 'Aa';
      ghost.style.font = '600 28px serif';
      ghost.style.color = '#333';
    }
    document.body.appendChild(ghost);
    op.ghost = ghost;
    app.setUi({ dragSource: op.cellId });
  }

  /** @param {Op} op @param {PointerEvent} e */
  function moveCellDrag(op, e) {
    op.ghost.style.left = e.clientX + 'px';
    op.ghost.style.top = e.clientY + 'px';
    const h = hit(toPt(e));
    const target = h.kind === 'cell' && h.cell.id !== op.cellId ? h.cell.id : null;
    const overTray = !!document.elementFromPoint(e.clientX, e.clientY)?.closest('#tray');
    if (target !== app.ui.dropTarget || overTray !== app.ui.trayDrop) app.setUi({ dropTarget: target, trayDrop: overTray });
  }

  /** @param {Op} op @param {PointerEvent} e */
  function finishCellDrag(op, e) {
    const target = app.ui.dropTarget;
    const overTray = !!document.elementFromPoint(e.clientX, e.clientY)?.closest('#tray');
    cancelCellDrag(op);
    if (target) {
      app.editPage((p) => swapCells(p, op.cellId, target));
      app.select({ kind: 'cell', id: target });
    } else if (overTray) {
      app.editCell(op.cellId, (c) => { c.content = null; });
    }
  }

  /** @param {Op} op */
  function cancelCellDrag(op) {
    op.ghost?.remove();
    app.setUi({ dropTarget: null, dragSource: null, trayDrop: false });
  }

  // Double-click: crop photo, edit text, or browse for a photo

  canvas.addEventListener('dblclick', (e) => {
    const h = hit(toPt(e));
    if (app.ui.mode === 'crop') {
      app.actions.exitCrop(true);
      return;
    }
    if (h.kind === 'box') startEditing({ kind: 'box', id: h.box.id });
    else if (h.kind === 'cell') {
      const k = h.cell.content?.kind;
      if (k === 'photo') app.actions.enterCrop(h.cell.id);
      else if (k === 'text') startEditing({ kind: 'cell', id: h.cell.id });
      else app.actions.addPhotos(null, { cellId: h.cell.id });
    }
  });

  // Right-click menu

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (app.ui.mode === 'crop') return;
    const h = hit(toPt(e));
    const a = app.actions;
    /** @type {import('../ui/dom.js').MenuItem[]} */
    let items;
    if (h.kind === 'box') {
      app.select({ kind: 'box', id: h.box.id });
      const id = h.box.id;
      items = [
        { label: 'Edit text', icon: 'type', kbd: 'Enter', run: () => startEditing({ kind: 'box', id }) },
        { label: 'Duplicate', icon: 'copy', run: () => a.duplicateBox(id) },
        { label: 'Bring to front', icon: 'bring-to-front', run: () => a.bringToFront(id) },
        'sep',
        { label: 'Delete', icon: 'trash-2', kbd: 'Del', danger: true, run: () => a.deleteSelection() },
      ];
    } else if (h.kind === 'cell') {
      app.select({ kind: 'cell', id: h.cell.id });
      const id = h.cell.id, kind = h.cell.content?.kind;
      if (kind === 'photo') {
        items = [
          { label: 'Crop / move photo', icon: 'crop', kbd: 'Enter', run: () => a.enterCrop(id) },
          { label: 'Rotate', icon: 'rotate-cw', run: () => a.rotate(id) },
          { label: 'Flip', icon: 'flip-horizontal-2', run: () => a.flip(id) },
          { label: 'Replace photo…', icon: 'replace', run: () => a.addPhotos(null, { cellId: id, single: true }) },
          'sep',
          { label: 'Change to text', icon: 'type', run: () => a.toggleTextSlot(id) },
          { label: 'Remove photo', icon: 'x', kbd: 'Del', danger: true, run: () => a.deleteSelection() },
        ];
      } else if (kind === 'text') {
        items = [
          { label: 'Edit text', icon: 'type', kbd: 'Enter', run: () => startEditing({ kind: 'cell', id }) },
          { label: 'Change to photo slot', icon: 'image', run: () => a.toggleTextSlot(id) },
        ];
      } else {
        items = [
          { label: 'Add photo…', icon: 'image-plus', run: () => a.addPhotos(null, { cellId: id, single: true }) },
          { label: 'Change to text', icon: 'type', run: () => a.toggleTextSlot(id) },
        ];
      }
    } else {
      app.select(null);
      items = [
        { label: 'Add photos…', icon: 'image-plus', run: () => a.addPhotos(null, {}) },
        { label: 'Add text', icon: 'type', run: () => a.addText() },
        { label: 'Change layout…', icon: 'layout-grid', run: () => a.changeLayout() },
      ];
    }
    showMenu(e.clientX, e.clientY, items);
  });

  // Wheel: zoom the photo in crop mode, otherwise zoom (Ctrl) or scroll the view

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (app.ui.mode === 'crop') {
      const cell = app.selectedCell;
      if (cell?.content?.kind !== 'photo') return;
      const z = Math.min(MAX_ZOOM, Math.max(1, cell.content.zoom * Math.exp(-e.deltaY * 0.0025)));
      app.editCell(cell.id, (c) => { if (c.content?.kind === 'photo') c.content.zoom = z; }, { group: 'crop', sticky: true });
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      setZoom(zoom * Math.exp(-e.deltaY * 0.004));
    } else if (zoom > 1) {
      panX -= e.shiftKey ? e.deltaY : e.deltaX;
      panY -= e.shiftKey ? 0 : e.deltaY;
      app.requestRender();
    }
  }, { passive: false });

  // Drops from the photo tray or from File Explorer / Finder

  const acceptsDrop = (/** @type {DragEvent} */ e) => {
    const t = e.dataTransfer?.types ?? [];
    return t.includes('Files') || t.includes(PHOTO_DRAG_TYPE);
  };
  el.addEventListener('dragover', (e) => {
    if (!acceptsDrop(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const h = hit(toPt(e));
    const target = h.kind === 'cell' ? h.cell.id : null;
    el.classList.toggle('drop-files', !target && e.dataTransfer.types.includes('Files'));
    if (target !== app.ui.dropTarget) app.setUi({ dropTarget: target });
  });
  el.addEventListener('dragleave', (e) => {
    if (e.relatedTarget && el.contains(/** @type {Node} */ (e.relatedTarget))) return;
    el.classList.remove('drop-files');
    if (app.ui.dropTarget) app.setUi({ dropTarget: null });
  });
  el.addEventListener('drop', (e) => {
    if (!acceptsDrop(e)) return;
    e.preventDefault();
    el.classList.remove('drop-files');
    const target = app.ui.dropTarget;
    app.setUi({ dropTarget: null });
    const photoId = e.dataTransfer.getData(PHOTO_DRAG_TYPE);
    if (photoId) {
      if (target) {
        app.editPage((p) => placePhoto(p, target, photoId));
        app.select({ kind: 'cell', id: target });
      } else {
        app.actions.fillEmptyWith([photoId]);
      }
    } else if (e.dataTransfer.files.length) {
      app.actions.addPhotos([...e.dataTransfer.files], { cellId: target ?? undefined, fill: true });
    }
  });

  // ---------- in-place text editing ----------

  /** @type {HTMLTextAreaElement|null} */
  let editor = null;

  /** @param {{kind: 'cell'|'box', id: string}} target */
  function startEditing(target) {
    stopEditing();
    app.setUi({ mode: 'normal', selection: target, editing: target });
    const text = currentText();
    if (text === null) return;
    editor = document.createElement('textarea');
    editor.className = 'text-editor';
    editor.spellcheck = true;
    editor.value = text;
    editor.setAttribute('aria-label', 'Edit text');
    el.appendChild(editor);
    positionEditor();
    editor.focus();
    editor.select();
    editor.addEventListener('input', () => {
      const t = app.ui.editing;
      if (!t || !editor) return;
      const value = editor.value;
      if (t.kind === 'box') app.editBox(t.id, (b) => { b.text = value; }, { group: 'type', sticky: true });
      else app.editCell(t.id, (c) => { if (c.content?.kind === 'text') c.content.text = value; }, { group: 'type', sticky: true });
    });
    editor.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        e.stopPropagation();
        stopEditing();
        canvas.focus();
      }
      e.stopPropagation();
    });
    editor.addEventListener('blur', () => stopEditing());
  }

  function stopEditing() {
    const t = app.ui.editing;
    if (!editor && !t) return;
    const ed = editor;
    editor = null;
    ed?.remove();
    app.store.endGroup();
    if (t?.kind === 'box') {
      const box = app.page.textBoxes.find((b) => b.id === t.id);
      if (box && !box.text.trim()) app.editPage((p) => { p.textBoxes = p.textBoxes.filter((b) => b.id !== t.id); });
    }
    app.setUi({ editing: null });
  }

  function currentText() {
    const t = app.ui.editing;
    if (!t) return null;
    if (t.kind === 'box') return app.page.textBoxes.find((b) => b.id === t.id)?.text ?? null;
    const c = app.page.cells.find((x) => x.id === t.id)?.content;
    return c?.kind === 'text' ? c.text : null;
  }

  function positionEditor() {
    const t = app.ui.editing;
    if (!editor || !t) return;
    const s = view.scale;
    let style, rect, layout, rotation = 0;
    if (t.kind === 'box') {
      const box = app.page.textBoxes.find((b) => b.id === t.id);
      if (!box) return;
      const m = measureTextBox(mctx, box);
      style = box.style;
      layout = m.layout;
      rect = m.rect;
      rotation = box.rotation;
    } else {
      const cell = app.page.cells.find((c) => c.id === t.id);
      if (cell?.content?.kind !== 'text') return;
      style = cell.content.style;
      rect = frameRect(app.page, app.doc.pageSize, cell);
      const measure = (/** @type {string} */ str, /** @type {string} */ font) => {
        mctx.font = font;
        return mctx.measureText(str).width;
      };
      layout = layoutText(cell.content.text || ' ', style, rect.w, rect.h, measure);
    }
    const innerH = rect.h - layout.pad * 2;
    const top = style.vAlign === 'middle' ? (innerH - layout.textH) / 2 : style.vAlign === 'bottom' ? innerH - layout.textH : 0;
    Object.assign(editor.style, {
      left: `${view.ox + rect.x * s}px`,
      top: `${view.oy + rect.y * s}px`,
      width: `${rect.w * s}px`,
      height: `${rect.h * s}px`,
      transform: rotation ? `rotate(${rotation}deg)` : '',
      font: `${style.italic ? 'italic ' : ''}${style.bold ? 700 : 400} ${layout.sizePt * s}px/${style.lineHeight} "${style.font}", sans-serif`,
      color: style.color,
      textAlign: style.align,
      padding: `${(layout.pad + Math.max(0, top)) * s}px ${layout.pad * s}px ${layout.pad * s}px`,
      textShadow: style.shadow ? `0 ${layout.sizePt * 0.05 * s}px ${layout.sizePt * 0.18 * s}px rgba(0,0,0,0.55)` : 'none',
      background: t.kind === 'box' && style.background ? style.background : 'transparent',
      webkitTextStroke: '',
    });
  }

  // ---------- keyboard nudge ----------

  /** @param {number} dx @param {number} dy */
  function nudge(dx, dy) {
    const box = app.selectedBox;
    if (box) app.editBox(box.id, (b) => {
      b.xPt += dx;
      b.yPt += dy;
    }, { group: 'nudge' });
  }

  return {
    update: render,
    startEditing,
    stopEditing,
    nudge,
    setZoom,
    get zoom() {
      return zoom;
    },
    /** For tests and the Store screenshots. */
    view,
  };
}

function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const accent = cs.getPropertyValue('--accent').trim() || '#0f6cbd';
  return {
    accent,
    accentSoft: 'rgba(15, 108, 189, 0.18)',
    hover: 'rgba(15, 108, 189, 0.55)',
  };
}

/** @typedef {ReturnType<typeof createStage>} Stage */
