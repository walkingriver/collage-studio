// @ts-check
// Page geometry and crop math, all in points. Pure functions (no DOM).

import { getShape } from './shapes.js';

/** @typedef {import('./model.js').Rect} Rect */
/** @typedef {import('./model.js').Page} Page */
/** @typedef {import('./model.js').Cell} Cell */
/** @typedef {import('./model.js').PhotoContent} PhotoContent */
/** @typedef {import('./model.js').PhotoMeta} PhotoMeta */
/** @typedef {import('./page-sizes.js').PageSize} PageSize */

const EPS = 1e-6;

/**
 * The area inside the page margins.
 * @param {Page} page
 * @param {PageSize} size
 * @returns {Rect}
 */
export function contentRect(page, size) {
  const m = Math.max(0, Math.min(page.marginPt, size.wPt / 2 - 1, size.hPt / 2 - 1));
  return { x: m, y: m, w: size.wPt - 2 * m, h: size.hPt - 2 * m };
}

/**
 * A cell's rect in points. Edges shared with other cells are inset by half the gap,
 * so the outer edges line up with the margins and inner gaps are all the same.
 * Pages whose slots overlap on purpose get no gap.
 * The rect is before the slot's tilt (see cellRotation), which turns it around its center.
 * @param {Page} page
 * @param {PageSize} size
 * @param {Cell} cell
 * @returns {Rect}
 */
export function cellRect(page, size, cell) {
  const c = contentRect(page, size);
  const g = page.overlap ? 0 : Math.max(0, page.gapPt) / 2;
  const r = cell.rect;
  let x0 = c.x + r.x * c.w, y0 = c.y + r.y * c.h;
  let x1 = c.x + (r.x + r.w) * c.w, y1 = c.y + (r.y + r.h) * c.h;
  if (r.x > EPS) x0 += g;
  if (r.y > EPS) y0 += g;
  if (r.x + r.w < 1 - EPS) x1 -= g;
  if (r.y + r.h < 1 - EPS) y1 -= g;
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}

/**
 * The rect the frame shape is drawn in: the cell rect, or its largest centered square
 * for shapes that keep their proportions (circle, heart, star...).
 * @param {Page} page
 * @param {PageSize} size
 * @param {Cell} cell
 * @returns {Rect}
 */
export function frameRect(page, size, cell) {
  const r = cellRect(page, size, cell);
  if (!getShape(cell.shape).keepAspect) return r;
  const s = Math.min(r.w, r.h);
  return { x: r.x + (r.w - s) / 2, y: r.y + (r.h - s) / 2, w: s, h: s };
}

/** Slot tilt in degrees (clockwise). @param {Cell} cell */
export function cellRotation(cell) {
  return cell.rotation ?? 0;
}

/**
 * Turns a point around a center by `deg` degrees (clockwise on screen).
 * @param {number} px
 * @param {number} py
 * @param {number} cx
 * @param {number} cy
 * @param {number} deg
 */
export function rotateAround(px, py, cx, cy, deg) {
  if (!deg) return { x: px, y: py };
  const a = (deg * Math.PI) / 180;
  const dx = px - cx, dy = py - cy;
  return { x: cx + dx * Math.cos(a) - dy * Math.sin(a), y: cy + dx * Math.sin(a) + dy * Math.cos(a) };
}

/**
 * A page point in a tilted frame's own (untilted) coordinates.
 * @param {Rect} frame
 * @param {number} deg
 * @param {number} px
 * @param {number} py
 */
export function toFrameLocal(frame, deg, px, py) {
  return rotateAround(px, py, frame.x + frame.w / 2, frame.y + frame.h / 2, -deg);
}

/**
 * Photo size after rotation.
 * @param {PhotoMeta} meta
 * @param {number} rotate
 */
export function orientedSize(meta, rotate) {
  return rotate === 90 || rotate === 270 ? { w: meta.h, h: meta.w } : { w: meta.w, h: meta.h };
}

/**
 * Where the (rotated) photo is drawn for a frame: returns its on-page rect.
 * With fit 'fill' the photo always covers the frame; with 'fit' it is fully visible.
 * @param {PhotoContent} content
 * @param {PhotoMeta} meta
 * @param {Rect} frame
 * @returns {Rect & {scale: number}}  scale = points per image pixel
 */
export function photoPlacement(content, meta, frame) {
  const o = orientedSize(meta, content.rotate);
  const base = content.fit === 'fit' ? Math.min(frame.w / o.w, frame.h / o.h) : Math.max(frame.w / o.w, frame.h / o.h);
  const scale = base * Math.max(1, content.zoom);
  const w = o.w * scale, h = o.h * scale;
  const { cx, cy } = clampCenter(content.cx, content.cy, w, h, frame);
  return { x: frame.x + frame.w / 2 - cx * w, y: frame.y + frame.h / 2 - cy * h, w, h, scale };
}

/**
 * Keeps the photo covering the frame when it is larger than the frame, and centered otherwise.
 * @param {number} cx
 * @param {number} cy
 * @param {number} w  displayed photo width
 * @param {number} h
 * @param {Rect} frame
 */
export function clampCenter(cx, cy, w, h, frame) {
  const clamp1 = (/** @type {number} */ c, /** @type {number} */ size, /** @type {number} */ span) => {
    if (size <= span + EPS) return 0.5;
    const lo = span / 2 / size;
    return Math.min(1 - lo, Math.max(lo, c));
  };
  return { cx: clamp1(cx, w, frame.w), cy: clamp1(cy, h, frame.h) };
}

/**
 * New crop center after dragging the photo by (dx, dy) points inside its frame.
 * @param {PhotoContent} content
 * @param {PhotoMeta} meta
 * @param {Rect} frame
 * @param {number} dx
 * @param {number} dy
 */
export function panCrop(content, meta, frame, dx, dy) {
  const p = photoPlacement(content, meta, frame);
  const cur = clampCenter(content.cx, content.cy, p.w, p.h, frame);
  return clampCenter(cur.cx - dx / p.w, cur.cy - dy / p.h, p.w, p.h, frame);
}

export const MAX_ZOOM = 5;

/**
 * @typedef {{x: number, y: number, w: number, h: number, rotation: number}} RotRect
 */

/**
 * True when point (px, py) is inside a rect rotated (degrees) around its center.
 * @param {RotRect} r
 * @param {number} px
 * @param {number} py
 * @param {number} [pad]
 */
export function pointInRotRect(r, px, py, pad = 0) {
  const p = toLocal(r, px, py);
  return p.x >= -pad && p.x <= r.w + pad && p.y >= -pad && p.y <= r.h + pad;
}

/**
 * Converts a page point into a rotated rect's local coordinates (origin at its top-left).
 * @param {RotRect} r
 * @param {number} px
 * @param {number} py
 */
export function toLocal(r, px, py) {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const a = (-r.rotation * Math.PI) / 180;
  const dx = px - cx, dy = py - cy;
  return { x: dx * Math.cos(a) - dy * Math.sin(a) + r.w / 2, y: dx * Math.sin(a) + dy * Math.cos(a) + r.h / 2 };
}

/**
 * Converts a rotated rect's local point to page coordinates.
 * @param {RotRect} r
 * @param {number} lx
 * @param {number} ly
 */
export function toPage(r, lx, ly) {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const a = (r.rotation * Math.PI) / 180;
  const dx = lx - r.w / 2, dy = ly - r.h / 2;
  return { x: cx + dx * Math.cos(a) - dy * Math.sin(a), y: cy + dx * Math.sin(a) + dy * Math.cos(a) };
}
