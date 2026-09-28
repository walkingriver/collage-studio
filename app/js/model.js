// @ts-check
// Document model: types, factories and edit helpers. Pure data (JSON-safe), no DOM.
// Edit helpers mutate the draft they are given; the store hands them a fresh copy.

import { getLayout, remapContents, DEFAULT_LAYOUT_ID } from './layouts.js';
import { pageSizeFromPreset } from './page-sizes.js';
import { DEFAULT_FONT } from './font-catalog.js';

export const SCHEMA_VERSION = 1;

/** @typedef {import('./page-sizes.js').PageSize} PageSize */
/** @typedef {{x: number, y: number, w: number, h: number}} Rect */

/**
 * Photo adjustments. Sliders are -1..1 with 0 meaning "unchanged".
 * @typedef {object} Adjust
 * @property {number} brightness
 * @property {number} contrast
 * @property {number} saturation
 * @property {number} warmth
 * @property {'none'|'bw'|'sepia'} preset
 */

/**
 * @typedef {object} TextStyle
 * @property {string} font
 * @property {number} sizePt
 * @property {string} color
 * @property {boolean} bold
 * @property {boolean} italic
 * @property {'left'|'center'|'right'} align
 * @property {'top'|'middle'|'bottom'} vAlign
 * @property {number} lineHeight  multiple of font size
 * @property {boolean} shadow
 * @property {boolean} outline
 * @property {string} outlineColor
 * @property {string|null} background  fill behind the text (slots and boxes)
 */

/**
 * @typedef {object} PhotoContent
 * @property {'photo'} kind
 * @property {string} photoId
 * @property {'fill'|'fit'} fit
 * @property {number} zoom  >= 1
 * @property {number} cx  point of the (rotated) image shown at the frame center, 0..1
 * @property {number} cy
 * @property {0|90|180|270} rotate
 * @property {boolean} flipH
 * @property {Adjust} adjust
 */

/** @typedef {{kind: 'text', text: string, style: TextStyle}} TextContent */
/** @typedef {PhotoContent | TextContent} CellContent */

/**
 * A layout slot. `rotation` (degrees) and `noFrame` are optional so older files still load.
 * @typedef {{id: string, rect: Rect, shape: string, content: CellContent | null, rotation?: number, noFrame?: boolean}} Cell
 */

/**
 * A floating text box. Height is derived from its text, so only width is stored.
 * @typedef {{id: string, xPt: number, yPt: number, wPt: number, rotation: number, text: string, style: TextStyle}} TextBox
 */

/** @typedef {{borderPt: number, borderColor: string, radiusPt: number, shadow?: boolean}} FrameStyle */

/**
 * @typedef {object} Page
 * @property {string} id
 * @property {string} layoutId
 * @property {number} marginPt
 * @property {number} gapPt
 * @property {string} background
 * @property {FrameStyle} frame
 * @property {Cell[]} cells
 * @property {TextBox[]} textBoxes
 * @property {boolean} [overlap]  slots overlap on purpose, so no spacing is added between them
 */

/** @typedef {{id: string, name: string, type: string, w: number, h: number}} PhotoMeta  id is the content hash */

/**
 * @typedef {object} Project
 * @property {number} schemaVersion
 * @property {string} title
 * @property {PageSize} pageSize
 * @property {Page[]} pages
 * @property {Record<string, PhotoMeta>} photos
 */

export function uid() {
  return globalThis.crypto.randomUUID().slice(0, 8);
}

/** @returns {Adjust} */
export function defaultAdjust() {
  return { brightness: 0, contrast: 0, saturation: 0, warmth: 0, preset: 'none' };
}

/** @param {Adjust} a */
export function isDefaultAdjust(a) {
  return !a.brightness && !a.contrast && !a.saturation && !a.warmth && a.preset === 'none';
}

/**
 * @param {Partial<TextStyle>} [overrides]
 * @returns {TextStyle}
 */
export function defaultTextStyle(overrides = {}) {
  return {
    font: DEFAULT_FONT, sizePt: 28, color: '#222222', bold: false, italic: false,
    align: 'center', vAlign: 'middle', lineHeight: 1.2,
    shadow: false, outline: false, outlineColor: '#ffffff', background: null,
    ...overrides,
  };
}

/** Style for text that fills a layout slot. */
export function slotTextStyle() {
  return defaultTextStyle({ font: 'Playfair Display', sizePt: 40 });
}

/**
 * @param {string} photoId
 * @returns {PhotoContent}
 */
export function newPhotoContent(photoId) {
  return { kind: 'photo', photoId, fit: 'fill', zoom: 1, cx: 0.5, cy: 0.5, rotate: 0, flipH: false, adjust: defaultAdjust() };
}

/**
 * @param {string} [text]
 * @returns {TextContent}
 */
export function newTextContent(text = 'Your text here') {
  return { kind: 'text', text, style: slotTextStyle() };
}

/**
 * @param {string} layoutId
 * @returns {Page}
 */
export function newPage(layoutId = DEFAULT_LAYOUT_ID) {
  /** @type {Page} */
  const page = {
    id: uid(), layoutId, marginPt: 36, gapPt: 12, background: '#ffffff',
    frame: { borderPt: 0, borderColor: '#ffffff', radiusPt: 0, shadow: false },
    cells: [],
    textBoxes: [],
  };
  applyLayout(page, layoutId);
  return page;
}

/**
 * Builds a slot from a layout cell.
 * @param {import('./layouts.js').LayoutCell} c
 * @param {CellContent|null} content
 * @returns {Cell}
 */
export function cellFromLayout(c, content) {
  /** @type {Cell} */
  const cell = { id: uid(), rect: { x: c.x, y: c.y, w: c.w, h: c.h }, shape: c.shape ?? 'rect', content };
  if (c.rot) cell.rotation = c.rot;
  if (c.noFrame) cell.noFrame = true;
  return cell;
}

/**
 * Applies a layout's suggested frame look without overriding choices already made:
 * a border is only added when there is none, and shadows are only turned on.
 * @param {FrameStyle} frame
 * @param {{borderPt?: number, borderColor?: string, shadow?: boolean}|undefined} suggestion
 */
export function suggestFrame(frame, suggestion) {
  if (!suggestion) return;
  if (!frame.borderPt && suggestion.borderPt) {
    frame.borderPt = suggestion.borderPt;
    if (suggestion.borderColor) frame.borderColor = suggestion.borderColor;
  }
  if (suggestion.shadow) frame.shadow = true;
}

/**
 * @param {{pageSize?: PageSize, layoutId?: string, title?: string}} [opts]
 * @returns {Project}
 */
export function newProject(opts = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    title: opts.title ?? 'My Collage',
    pageSize: opts.pageSize ?? pageSizeFromPreset('letter', 'portrait'),
    pages: [newPage(opts.layoutId)],
    photos: {},
  };
}

/**
 * @param {Page} page  must share the project's page size
 * @param {string} text
 * @param {Partial<TextStyle>} [style]
 * @param {PageSize} [pageSize]
 * @returns {TextBox}
 */
export function newTextBox(page, text, style = {}, pageSize) {
  const w = pageSize ? pageSize.wPt * 0.6 : 360;
  const cx = pageSize ? pageSize.wPt / 2 : 306, cy = pageSize ? pageSize.hPt / 2 : 396;
  return { id: uid(), xPt: cx - w / 2, yPt: cy - 30, wPt: w, rotation: 0, text, style: defaultTextStyle({ bold: true, ...style }) };
}

// ---------- lookups ----------

/** @param {Project} doc @param {string} pageId */
export function findPage(doc, pageId) {
  return doc.pages.find((p) => p.id === pageId);
}

/** @param {Page} page @param {string} cellId */
export function findCell(page, cellId) {
  return page.cells.find((c) => c.id === cellId);
}

/** @param {Page} page @param {string} boxId */
export function findTextBox(page, boxId) {
  return page.textBoxes.find((b) => b.id === boxId);
}

/**
 * How many slots use each photo, across all pages.
 * @param {Project} doc
 * @returns {Map<string, number>}
 */
export function photoUsage(doc) {
  const m = new Map();
  for (const p of doc.pages) for (const c of p.cells) {
    if (c.content?.kind === 'photo') m.set(c.content.photoId, (m.get(c.content.photoId) ?? 0) + 1);
  }
  return m;
}

// ---------- edits (mutate the draft) ----------

/**
 * Switches a page to another layout, carrying contents over in order.
 * @param {Page} page
 * @param {string} layoutId
 * @returns {{droppedPhotos: number, droppedTexts: number}}
 */
export function applyLayout(page, layoutId) {
  const layout = getLayout(layoutId);
  const { assigned, droppedPhotos, droppedTexts } = remapContents(page.cells.map((c) => c.content), layout.cells);
  page.layoutId = layout.id;
  page.overlap = !!layout.overlap;
  suggestFrame(page.frame, layout.frame);
  page.cells = layout.cells.map((c, i) => {
    let content = assigned[i];
    if (content?.kind === 'photo') content = resetCrop(content);
    if (!content && c.text !== undefined) content = newTextContent(c.text);
    return cellFromLayout(c, content ?? null);
  });
  return { droppedPhotos, droppedTexts };
}

/**
 * Swaps the contents of two cells (a photo's crop is reset, since frame shapes differ).
 * @param {Page} page
 * @param {string} aId
 * @param {string} bId
 */
export function swapCells(page, aId, bId) {
  const a = findCell(page, aId), b = findCell(page, bId);
  if (!a || !b || a === b) return;
  [a.content, b.content] = [resetCrop(b.content), resetCrop(a.content)];
}

/**
 * A photo's crop back to centered and unzoomed (its frame changed shape).
 * @template {CellContent|null} C
 * @param {C} c
 * @returns {C}
 */
export function resetCrop(c) {
  return c?.kind === 'photo' ? /** @type {C} */ ({ ...c, zoom: 1, cx: 0.5, cy: 0.5 }) : c;
}

/**
 * Puts a photo into a cell, replacing whatever was there.
 * @param {Page} page
 * @param {string} cellId
 * @param {string} photoId
 */
export function placePhoto(page, cellId, photoId) {
  const cell = findCell(page, cellId);
  if (cell) cell.content = newPhotoContent(photoId);
}

/**
 * Fills empty photo slots on a page with photos not used anywhere yet, in tray order.
 * @param {Project} doc
 * @param {Page} page
 * @returns {number} how many slots were filled
 */
export function autoFill(doc, page) {
  const used = photoUsage(doc);
  const unused = Object.keys(doc.photos).filter((id) => !used.has(id));
  let n = 0;
  for (const cell of page.cells) {
    if (cell.content || !unused.length) continue;
    cell.content = newPhotoContent(unused.shift());
    n++;
  }
  return n;
}

/**
 * Removes a photo from the project and from every slot that uses it.
 * @param {Project} doc
 * @param {string} photoId
 */
export function removePhoto(doc, photoId) {
  delete doc.photos[photoId];
  for (const p of doc.pages) for (const c of p.cells) {
    if (c.content?.kind === 'photo' && c.content.photoId === photoId) c.content = null;
  }
}

/**
 * Deep-copies a page with fresh ids.
 * @param {Page} page
 * @returns {Page}
 */
export function duplicatePage(page) {
  const copy = structuredClone(page);
  copy.id = uid();
  for (const c of copy.cells) c.id = uid();
  for (const b of copy.textBoxes) b.id = uid();
  return copy;
}

/**
 * Basic shape check for documents loaded from disk.
 * @param {any} doc
 * @returns {doc is Project}
 */
export function isProject(doc) {
  return !!doc && typeof doc === 'object' && typeof doc.schemaVersion === 'number' && Array.isArray(doc.pages)
    && doc.pageSize && typeof doc.pageSize.wPt === 'number' && typeof doc.photos === 'object';
}
