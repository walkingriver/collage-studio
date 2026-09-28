// @ts-check
// Collage layout templates. Cell rects are fractions (0..1) of the page's content area
// (the page minus its margins), so every layout works at any page size or orientation.

/**
 * @typedef {object} LayoutCell
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 * @property {string} [shape]  default 'rect'
 * @property {string} [text]   when set, the cell starts as a text slot with this text
 */

/** @typedef {{id: string, name: string, cells: LayoutCell[]}} Layout */

/**
 * Evenly divided grid.
 * @param {number} cols
 * @param {number} rows
 * @param {{x?: number, y?: number, w?: number, h?: number, shape?: string}} [area]
 * @returns {LayoutCell[]}
 */
function grid(cols, rows, area = {}) {
  const { x = 0, y = 0, w = 1, h = 1, shape } = area;
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      cells.push({ x: x + (c * w) / cols, y: y + (r * h) / rows, w: w / cols, h: h / rows, ...(shape ? { shape } : {}) });
    }
  }
  return cells;
}

/** @type {Layout[]} */
export const LAYOUTS = [
  { id: 'one', name: 'Single photo', cells: grid(1, 1) },
  { id: 'two-stack', name: '2 stacked', cells: grid(1, 2) },
  { id: 'two-side', name: '2 side by side', cells: grid(2, 1) },
  { id: 'three-stack', name: '3 stacked', cells: grid(1, 3) },
  { id: 'three-side', name: '3 columns', cells: grid(3, 1) },
  { id: 'hero-top-2', name: '1 big + 2', cells: [{ x: 0, y: 0, w: 1, h: 0.6 }, ...grid(2, 1, { y: 0.6, h: 0.4 })] },
  { id: 'hero-left-2', name: 'Big left + 2', cells: [{ x: 0, y: 0, w: 0.6, h: 1 }, ...grid(1, 2, { x: 0.6, w: 0.4 })] },
  { id: 'hero-bottom-2', name: '2 + 1 big', cells: [...grid(2, 1, { h: 0.4 }), { x: 0, y: 0.4, w: 1, h: 0.6 }] },
  { id: 'grid-4', name: '4 grid', cells: grid(2, 2) },
  { id: 'hero-top-3', name: '1 big + 3', cells: [{ x: 0, y: 0, w: 1, h: 0.6 }, ...grid(3, 1, { y: 0.6, h: 0.4 })] },
  { id: 'hero-right-3', name: '3 + big right', cells: [...grid(1, 3, { w: 0.4 }), { x: 0.4, y: 0, w: 0.6, h: 1 }] },
  {
    id: 'big-middle', name: 'Big middle',
    cells: [...grid(2, 1, { h: 0.25 }), { x: 0, y: 0.25, w: 1, h: 0.5 }, ...grid(2, 1, { y: 0.75, h: 0.25 })],
  },
  {
    id: 'mosaic-5', name: 'Mosaic 5',
    cells: [{ x: 0, y: 0, w: 0.6, h: 0.5 }, { x: 0.6, y: 0, w: 0.4, h: 0.5 }, ...grid(3, 1, { y: 0.5, h: 0.5 })],
  },
  { id: 'hero-top-4', name: '1 big + 4', cells: [{ x: 0, y: 0, w: 1, h: 0.55 }, ...grid(2, 2, { y: 0.55, h: 0.45 })] },
  { id: 'grid-6', name: '6 grid', cells: grid(2, 3) },
  {
    id: 'mosaic-6', name: 'Mosaic 6',
    cells: [...grid(3, 1, { h: 0.3 }), { x: 0, y: 0.3, w: 1, h: 0.4 }, ...grid(2, 1, { y: 0.7, h: 0.3 })],
  },
  { id: 'strips-4', name: '4 strips', cells: grid(1, 4) },
  { id: 'grid-8', name: '8 grid', cells: grid(2, 4) },
  { id: 'grid-9', name: '9 grid', cells: grid(3, 3) },
  { id: 'grid-12', name: '12 grid', cells: grid(3, 4) },
  {
    id: 'title-grid-4', name: 'Title + 4',
    cells: [{ x: 0, y: 0, w: 1, h: 0.14, text: 'Our Family' }, ...grid(2, 2, { y: 0.14, h: 0.86 })],
  },
  {
    id: 'title-hero-2', name: 'Title + 1 big + 2',
    cells: [{ x: 0, y: 0, w: 1, h: 0.14, text: 'Summer Memories' }, { x: 0, y: 0.14, w: 1, h: 0.5 }, ...grid(2, 1, { y: 0.64, h: 0.36 })],
  },
  {
    id: 'caption-hero', name: 'Photo + caption',
    cells: [{ x: 0, y: 0, w: 1, h: 0.84 }, { x: 0, y: 0.84, w: 1, h: 0.16, text: 'A day to remember' }],
  },
  { id: 'circles-4', name: '4 circles', cells: grid(2, 2, { shape: 'circle' }) },
  { id: 'circles-6', name: '6 circles', cells: grid(2, 3, { shape: 'circle' }) },
  {
    id: 'heart-center', name: 'Heart + 4',
    cells: [
      { x: 0, y: 0, w: 0.48, h: 0.24 }, { x: 0.52, y: 0, w: 0.48, h: 0.24 },
      { x: 0.1, y: 0.25, w: 0.8, h: 0.5, shape: 'heart' },
      { x: 0, y: 0.76, w: 0.48, h: 0.24 }, { x: 0.52, y: 0.76, w: 0.48, h: 0.24 },
    ],
  },
  {
    id: 'center-circle', name: '4 + center circle',
    cells: [...grid(2, 2), { x: 0.25, y: 0.3, w: 0.5, h: 0.4, shape: 'circle' }],
  },
];

export const DEFAULT_LAYOUT_ID = 'grid-4';

/** @param {string} id */
export function getLayout(id) {
  return LAYOUTS.find((l) => l.id === id) ?? LAYOUTS.find((l) => l.id === DEFAULT_LAYOUT_ID);
}

/**
 * Decides which existing contents go into which cells of a new layout.
 * Text slots get existing text first, other slots get photos, then any text left over.
 * @template T
 * @param {Array<{kind: string} & T | null>} oldContents  in the old layout's order
 * @param {LayoutCell[]} newCells
 * @returns {{assigned: Array<({kind: string} & T) | null>, droppedPhotos: number, droppedTexts: number}}
 */
export function remapContents(oldContents, newCells) {
  const photos = oldContents.filter((c) => c && c.kind === 'photo');
  const texts = oldContents.filter((c) => c && c.kind === 'text');
  /** @type {Array<({kind: string} & T) | null>} */
  const assigned = newCells.map(() => null);
  newCells.forEach((cell, i) => {
    if (cell.text !== undefined && texts.length) assigned[i] = texts.shift();
  });
  newCells.forEach((cell, i) => {
    if (cell.text === undefined && !assigned[i] && photos.length) assigned[i] = photos.shift();
  });
  newCells.forEach((cell, i) => {
    if (cell.text === undefined && !assigned[i] && texts.length) assigned[i] = texts.shift();
  });
  return { assigned, droppedPhotos: photos.length, droppedTexts: texts.length };
}
