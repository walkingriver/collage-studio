// @ts-check
// THE page renderer. Draws a page onto a canvas whose transform already maps points to
// device pixels. Used for the editor, thumbnails, JPEG/PDF export and printing, so what
// you see is what you get.

import { frameRect, photoPlacement, cellRotation } from './geometry.js';
import { shapePath } from './shapes.js';
import { filterString } from './adjust.js';
import { layoutText, positionLines, autoHeight } from './text.js';

/** @typedef {import('./model.js').Project} Project */
/** @typedef {import('./model.js').Page} Page */
/** @typedef {import('./model.js').Cell} Cell */
/** @typedef {import('./model.js').TextBox} TextBox */
/** @typedef {import('./model.js').TextStyle} TextStyle */
/** @typedef {import('./geometry.js').RotRect} RotRect */

/**
 * @typedef {object} RenderOptions
 * @property {number} pxPerPt  device pixels per point (shadow sizes don't follow the transform)
 * @property {'screen'|'export'|'thumb'} mode
 * @property {(cell: Cell) => ({img: CanvasImageSource, prefiltered: boolean} | null)} [getImage]
 * @property {(w: number) => string} [warmthUrl]
 * @property {string|null} [skipTextId]  cell or box id whose text is being edited in place
 * @property {string|null} [cropCellId]  show the whole photo faintly behind this cell (crop mode)
 */

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Project} doc
 * @param {Page} page
 * @param {RenderOptions} opts
 */
export function renderPage(ctx, doc, page, opts) {
  const size = doc.pageSize;
  ctx.save();
  ctx.fillStyle = page.background;
  ctx.fillRect(0, 0, size.wPt, size.hPt);

  if (opts.cropCellId) {
    const cell = page.cells.find((c) => c.id === opts.cropCellId);
    if (cell) drawCropGhost(ctx, doc, page, cell, opts);
  }
  for (const cell of page.cells) drawCell(ctx, doc, page, cell, opts);
  for (const box of page.textBoxes) {
    if (box.id !== opts.skipTextId) drawTextBox(ctx, box, opts);
  }
  ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Project} doc
 * @param {Page} page
 * @param {Cell} cell
 * @param {RenderOptions} opts
 */
function drawCell(ctx, doc, page, cell, opts) {
  const frame = frameRect(page, doc.pageSize, cell);
  const path = shapePath(cell.shape, frame, page.frame.radiusPt);
  const content = cell.content;
  // Empty slots leave no trace in exports and prints.
  const framed = !cell.noFrame && (!!content || opts.mode !== 'export');
  ctx.save();
  tiltCell(ctx, frame, cellRotation(cell));
  if (framed && page.frame.shadow) {
    // Shadow sizes are in device pixels, so scale them to look the same at every zoom and DPI.
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 9 * opts.pxPerPt;
    ctx.shadowOffsetY = 3 * opts.pxPerPt;
    ctx.fillStyle = page.background;
    ctx.fill(path);
    ctx.restore();
  }
  ctx.clip(path);

  if (content?.kind === 'photo') {
    const meta = doc.photos[content.photoId];
    const got = meta && opts.getImage?.(cell);
    if (meta && got) {
      drawPhoto(ctx, content, meta, frame, got, opts);
    } else if (opts.mode !== 'export') {
      ctx.fillStyle = '#dde1e7';
      ctx.fill(path);
    }
  } else if (content?.kind === 'text') {
    if (content.style.background) {
      ctx.fillStyle = content.style.background;
      ctx.fill(path);
    }
    if (cell.id !== opts.skipTextId) {
      const layout = layoutText(content.text, content.style, frame.w, frame.h, measurer(ctx));
      drawLines(ctx, layout, content.style, frame, opts);
    }
  } else if (opts.mode === 'screen') {
    drawEmptySlot(ctx, frame, path, opts);
  } else if (opts.mode === 'thumb') {
    ctx.fillStyle = '#c9d1dc';
    ctx.fill(path);
  }

  if (framed && page.frame.borderPt > 0) {
    // Stroke is centered on the path; clipping keeps just the inside half, so double it.
    ctx.lineWidth = page.frame.borderPt * 2;
    ctx.strokeStyle = page.frame.borderColor;
    ctx.stroke(path);
  }
  ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./model.js').PhotoContent} content
 * @param {import('./model.js').PhotoMeta} meta
 * @param {import('./model.js').Rect} frame
 * @param {{img: CanvasImageSource, prefiltered: boolean}} got
 * @param {RenderOptions} opts
 */
function drawPhoto(ctx, content, meta, frame, got, opts) {
  const p = photoPlacement(content, meta, frame);
  ctx.save();
  ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
  if (content.flipH) ctx.scale(-1, 1);
  ctx.rotate((content.rotate * Math.PI) / 180);
  if (!got.prefiltered) ctx.filter = filterString(content.adjust, opts.warmthUrl);
  ctx.imageSmoothingQuality = 'high';
  const w = meta.w * p.scale, h = meta.h * p.scale;
  ctx.drawImage(got.img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {Project} doc
 * @param {Page} page
 * @param {Cell} cell
 * @param {RenderOptions} opts
 */
function drawCropGhost(ctx, doc, page, cell, opts) {
  if (cell.content?.kind !== 'photo') return;
  const meta = doc.photos[cell.content.photoId];
  const got = meta && opts.getImage?.(cell);
  if (!got) return;
  const frame = frameRect(page, doc.pageSize, cell);
  ctx.save();
  tiltCell(ctx, frame, cellRotation(cell));
  ctx.globalAlpha = 0.35;
  drawPhoto(ctx, cell.content, meta, frame, got, opts);
  ctx.restore();
}

/**
 * Turns the canvas so a tilted slot can be drawn as if it were straight.
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./model.js').Rect} frame
 * @param {number} deg
 */
export function tiltCell(ctx, frame, deg) {
  if (!deg) return;
  const cx = frame.x + frame.w / 2, cy = frame.y + frame.h / 2;
  ctx.translate(cx, cy);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.translate(-cx, -cy);
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./model.js').Rect} frame
 * @param {Path2D} path
 * @param {RenderOptions} opts
 */
function drawEmptySlot(ctx, frame, path, opts) {
  ctx.fillStyle = '#eef1f5';
  ctx.fill(path);
  ctx.setLineDash([6, 5]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#a3adbb';
  ctx.stroke(path);
  ctx.setLineDash([]);
  const s = Math.min(frame.w, frame.h);
  if (s < 40) return;
  const cx = frame.x + frame.w / 2, cy = frame.y + frame.h / 2;
  // Simple "photo" glyph
  const g = Math.min(36, s * 0.22);
  ctx.strokeStyle = '#8a95a5';
  ctx.lineWidth = Math.max(1.5, g * 0.07);
  ctx.lineJoin = 'round';
  const gy = cy - g * 0.55;
  ctx.beginPath();
  ctx.roundRect(cx - g / 2, gy - g * 0.38, g, g * 0.76, g * 0.1);
  ctx.moveTo(cx - g / 2 + g * 0.08, gy + g * 0.3);
  ctx.lineTo(cx - g * 0.12, gy - g * 0.05);
  ctx.lineTo(cx + g * 0.08, gy + g * 0.15);
  ctx.lineTo(cx + g * 0.2, gy + g * 0.05);
  ctx.lineTo(cx + g / 2 - g * 0.08, gy + g * 0.3);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx + g * 0.2, gy - g * 0.15, g * 0.07, 0, Math.PI * 2);
  ctx.stroke();
  const fs = Math.max(8, Math.min(13, s * 0.075));
  ctx.fillStyle = '#6b7686';
  ctx.font = `600 ${fs}px "Segoe UI Variable", "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (frame.w > fs * 9) {
    ctx.fillText('Drop a photo here', cx, cy + g * 0.25);
    ctx.font = `400 ${fs * 0.9}px "Segoe UI Variable", "Segoe UI", system-ui, sans-serif`;
    ctx.fillText('or double-click to browse', cx, cy + g * 0.25 + fs * 1.4);
  }
  void opts;
}

/**
 * Measures a text box and returns its layout and rotated rect (height is automatic).
 * @param {CanvasRenderingContext2D} ctx
 * @param {TextBox} box
 */
export function measureTextBox(ctx, box) {
  const layout = layoutText(box.text || ' ', box.style, box.wPt, null, measurer(ctx));
  /** @type {RotRect} */
  const rect = { x: box.xPt, y: box.yPt, w: box.wPt, h: autoHeight(layout), rotation: box.rotation };
  return { layout, rect };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {TextBox} box
 * @param {RenderOptions} opts
 */
function drawTextBox(ctx, box, opts) {
  const { layout, rect } = measureTextBox(ctx, box);
  ctx.save();
  ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
  ctx.rotate((rect.rotation * Math.PI) / 180);
  const local = { x: -rect.w / 2, y: -rect.h / 2, w: rect.w, h: rect.h };
  if (box.style.background) {
    ctx.fillStyle = box.style.background;
    ctx.beginPath();
    ctx.roundRect(local.x, local.y, local.w, local.h, Math.min(8, layout.sizePt * 0.25));
    ctx.fill();
  }
  drawLines(ctx, layout, box.style, local, opts);
  ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {import('./text.js').TextLayout} layout
 * @param {TextStyle} style
 * @param {{x: number, y: number, w: number, h: number}} box
 * @param {RenderOptions} opts
 */
function drawLines(ctx, layout, style, box, opts) {
  ctx.save();
  ctx.font = layout.font;
  ctx.textAlign = style.align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = style.color;
  const size = layout.sizePt;
  const lines = positionLines(layout, style, box);
  const shadow = () => {
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = size * 0.18 * opts.pxPerPt;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = size * 0.05 * opts.pxPerPt;
  };
  const noShadow = () => {
    ctx.shadowColor = 'transparent';
  };
  if (style.outline) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1, size * 0.14);
    ctx.strokeStyle = style.outlineColor;
    if (style.shadow) shadow();
    for (const l of lines) ctx.strokeText(l.text, l.x, l.y);
    noShadow();
  } else if (style.shadow) {
    shadow();
  }
  for (const l of lines) ctx.fillText(l.text, l.x, l.y);
  ctx.restore();
}

/** @param {CanvasRenderingContext2D} ctx @returns {import('./text.js').Measure} */
function measurer(ctx) {
  return (text, font) => {
    if (ctx.font !== font) ctx.font = font;
    return ctx.measureText(text).width;
  };
}
