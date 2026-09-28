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
 * @property {number} [rot]    tilt in degrees (clockwise)
 * @property {boolean} [noFrame]  no border or shadow (e.g. a full-page background photo)
 */

/**
 * @typedef {object} Layout
 * @property {string} id
 * @property {string} name
 * @property {string} group  section in the layout picker
 * @property {LayoutCell[]} cells  drawn in order, so later cells sit on top
 * @property {boolean} [overlap]  cells overlap on purpose: no spacing is added between them
 * @property {{borderPt?: number, borderColor?: string, shadow?: boolean}} [frame]  suggested frame look
 */

export const LAYOUT_GROUPS = ['Simple', 'Big + small', 'Mosaic', 'With text', 'Shapes', 'Overlapping'];

/** White print borders with a soft shadow, for layouts where photos overlap. */
export const PRINTS = { borderPt: 8, borderColor: '#ffffff', shadow: true };

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

/**
 * Columns of stacked photos with different heights (a "masonry" look).
 * @param {number[][]} cols  each column's photo heights as fractions summing to 1
 */
function masonry(cols) {
  const w = 1 / cols.length;
  return cols.flatMap((heights, c) => {
    let y = 0;
    return heights.map((h) => {
      const cell = { x: c * w, y, w, h };
      y += h;
      return cell;
    });
  });
}

/** @param {number} x @param {number} y @param {number} w @param {number} h @param {number} rot */
const tilt = (x, y, w, h, rot) => ({ x, y, w, h, rot });

/** @type {Layout[]} */
export const LAYOUTS = [
  // Simple
  { id: 'one', group: 'Simple', name: 'Single photo', cells: grid(1, 1) },
  { id: 'two-stack', group: 'Simple', name: '2 stacked', cells: grid(1, 2) },
  { id: 'two-side', group: 'Simple', name: '2 side by side', cells: grid(2, 1) },
  { id: 'three-stack', group: 'Simple', name: '3 stacked', cells: grid(1, 3) },
  { id: 'three-side', group: 'Simple', name: '3 columns', cells: grid(3, 1) },
  { id: 'grid-4', group: 'Simple', name: '4 grid', cells: grid(2, 2) },
  { id: 'strips-4', group: 'Simple', name: '4 strips', cells: grid(1, 4) },
  { id: 'grid-6', group: 'Simple', name: '6 grid', cells: grid(2, 3) },
  { id: 'grid-8', group: 'Simple', name: '8 grid', cells: grid(2, 4) },
  { id: 'grid-9', group: 'Simple', name: '9 grid', cells: grid(3, 3) },
  { id: 'grid-10', group: 'Simple', name: '10 grid', cells: grid(2, 5) },
  { id: 'grid-12', group: 'Simple', name: '12 grid', cells: grid(3, 4) },
  { id: 'grid-16', group: 'Simple', name: '16 grid', cells: grid(4, 4) },

  // Big + small
  { id: 'hero-top-2', group: 'Big + small', name: '1 big + 2', cells: [{ x: 0, y: 0, w: 1, h: 0.6 }, ...grid(2, 1, { y: 0.6, h: 0.4 })] },
  { id: 'hero-bottom-2', group: 'Big + small', name: '2 + 1 big', cells: [...grid(2, 1, { h: 0.4 }), { x: 0, y: 0.4, w: 1, h: 0.6 }] },
  { id: 'hero-left-2', group: 'Big + small', name: 'Big left + 2', cells: [{ x: 0, y: 0, w: 0.6, h: 1 }, ...grid(1, 2, { x: 0.6, w: 0.4 })] },
  { id: 'hero-top-3', group: 'Big + small', name: '1 big + 3', cells: [{ x: 0, y: 0, w: 1, h: 0.6 }, ...grid(3, 1, { y: 0.6, h: 0.4 })] },
  { id: 'hero-left-3', group: 'Big + small', name: 'Big left + 3', cells: [{ x: 0, y: 0, w: 0.62, h: 1 }, ...grid(1, 3, { x: 0.62, w: 0.38 })] },
  { id: 'hero-right-3', group: 'Big + small', name: '3 + big right', cells: [...grid(1, 3, { w: 0.4 }), { x: 0.4, y: 0, w: 0.6, h: 1 }] },
  {
    id: 'big-middle', group: 'Big + small', name: 'Big middle',
    cells: [...grid(2, 1, { h: 0.25 }), { x: 0, y: 0.25, w: 1, h: 0.5 }, ...grid(2, 1, { y: 0.75, h: 0.25 })],
  },
  { id: 'hero-top-4', group: 'Big + small', name: '1 big + 4', cells: [{ x: 0, y: 0, w: 1, h: 0.55 }, ...grid(2, 2, { y: 0.55, h: 0.45 })] },
  { id: 'strip-top-hero', group: 'Big + small', name: '4 across + 1 big', cells: [...grid(4, 1, { h: 0.22 }), { x: 0, y: 0.22, w: 1, h: 0.78 }] },
  {
    id: 'big-corner-6', group: 'Big + small', name: '1 big + 5',
    cells: [
      { x: 0, y: 0, w: 2 / 3, h: 2 / 3 },
      ...grid(1, 2, { x: 2 / 3, w: 1 / 3, h: 2 / 3 }),
      ...grid(3, 1, { y: 2 / 3, h: 1 / 3 }),
    ],
  },
  {
    id: 'big-middle-7', group: 'Big + small', name: '3 + big + 3',
    cells: [...grid(3, 1, { h: 0.24 }), { x: 0, y: 0.24, w: 1, h: 0.52 }, ...grid(3, 1, { y: 0.76, h: 0.24 })],
  },

  // Mosaic
  {
    id: 'mosaic-5', group: 'Mosaic', name: 'Mosaic 5',
    cells: [{ x: 0, y: 0, w: 0.6, h: 0.5 }, { x: 0.6, y: 0, w: 0.4, h: 0.5 }, ...grid(3, 1, { y: 0.5, h: 0.5 })],
  },
  {
    id: 'mosaic-6', group: 'Mosaic', name: 'Mosaic 6',
    cells: [...grid(3, 1, { h: 0.3 }), { x: 0, y: 0.3, w: 1, h: 0.4 }, ...grid(2, 1, { y: 0.7, h: 0.3 })],
  },
  {
    id: 'mosaic-7', group: 'Mosaic', name: 'Mosaic 7',
    cells: [{ x: 0, y: 0, w: 0.66, h: 0.5 }, ...grid(1, 2, { x: 0.66, w: 0.34, h: 0.5 }), ...grid(4, 1, { y: 0.5, h: 0.5 })],
  },
  { id: 'masonry-6', group: 'Mosaic', name: 'Masonry 6', cells: masonry([[0.58, 0.42], [0.36, 0.64], [0.5, 0.5]]) },
  { id: 'masonry-9', group: 'Mosaic', name: 'Masonry 9', cells: masonry([[0.4, 0.3, 0.3], [0.25, 0.45, 0.3], [0.34, 0.33, 0.33]]) },
  { id: 'masonry-8', group: 'Mosaic', name: 'Masonry 8', cells: masonry([[0.3, 0.45, 0.25], [0.55, 0.45], [0.2, 0.35, 0.45]]) },

  // With text
  {
    id: 'title-grid-4', group: 'With text', name: 'Title + 4',
    cells: [{ x: 0, y: 0, w: 1, h: 0.14, text: 'Our Family' }, ...grid(2, 2, { y: 0.14, h: 0.86 })],
  },
  {
    id: 'title-hero-2', group: 'With text', name: 'Title + 1 big + 2',
    cells: [{ x: 0, y: 0, w: 1, h: 0.14, text: 'Summer Memories' }, { x: 0, y: 0.14, w: 1, h: 0.5 }, ...grid(2, 1, { y: 0.64, h: 0.36 })],
  },
  {
    id: 'caption-hero', group: 'With text', name: 'Photo + caption',
    cells: [{ x: 0, y: 0, w: 1, h: 0.84 }, { x: 0, y: 0.84, w: 1, h: 0.16, text: 'A day to remember' }],
  },
  {
    id: 'caption-grid-6', group: 'With text', name: '6 + caption',
    cells: [...grid(2, 3, { h: 0.86 }), { x: 0, y: 0.86, w: 1, h: 0.14, text: 'Family Reunion 2026' }],
  },
  {
    id: 'center-text-8', group: 'With text', name: '8 around a message',
    cells: grid(3, 3).map((c, i) => (i === 4 ? { ...c, text: 'Happy Birthday!' } : c)),
  },
  {
    id: 'title-side-3', group: 'With text', name: 'Words + 3',
    cells: [{ x: 0, y: 0, w: 0.36, h: 1, text: 'Our Trip' }, ...grid(1, 3, { x: 0.36, w: 0.64 })],
  },

  // Shapes
  { id: 'circles-4', group: 'Shapes', name: '4 circles', cells: grid(2, 2, { shape: 'circle' }) },
  { id: 'circles-6', group: 'Shapes', name: '6 circles', cells: grid(2, 3, { shape: 'circle' }) },
  { id: 'circles-9', group: 'Shapes', name: '9 circles', cells: grid(3, 3, { shape: 'circle' }) },
  { id: 'hearts-4', group: 'Shapes', name: '4 hearts', cells: grid(2, 2, { shape: 'heart' }) },
  { id: 'stars-6', group: 'Shapes', name: '6 stars', cells: grid(2, 3, { shape: 'star' }) },
  { id: 'arches-3', group: 'Shapes', name: '3 arches', cells: grid(3, 1, { shape: 'arch' }) },
  {
    id: 'heart-center', group: 'Shapes', name: 'Heart + 4',
    cells: [
      { x: 0, y: 0, w: 0.48, h: 0.24 }, { x: 0.52, y: 0, w: 0.48, h: 0.24 },
      { x: 0.1, y: 0.25, w: 0.8, h: 0.5, shape: 'heart' },
      { x: 0, y: 0.76, w: 0.48, h: 0.24 }, { x: 0.52, y: 0.76, w: 0.48, h: 0.24 },
    ],
  },

  // Overlapping
  {
    id: 'scatter-3', group: 'Overlapping', name: '3 snapshots', overlap: true, frame: PRINTS,
    cells: [tilt(0.04, 0.03, 0.62, 0.42, -5), tilt(0.34, 0.3, 0.62, 0.42, 4), tilt(0.06, 0.56, 0.6, 0.4, -2)],
  },
  {
    id: 'scatter-5', group: 'Overlapping', name: '5 snapshots', overlap: true, frame: PRINTS,
    cells: [
      tilt(0.02, 0.02, 0.52, 0.34, -6), tilt(0.46, 0.06, 0.5, 0.32, 5), tilt(0.2, 0.33, 0.58, 0.36, -2),
      tilt(0.02, 0.64, 0.5, 0.33, 4), tilt(0.48, 0.62, 0.5, 0.34, -5),
    ],
  },
  {
    id: 'scatter-7', group: 'Overlapping', name: '7 snapshots', overlap: true, frame: PRINTS,
    cells: [
      tilt(0.02, 0.02, 0.44, 0.27, -7), tilt(0.5, 0.03, 0.46, 0.28, 5), tilt(0.14, 0.26, 0.4, 0.25, 3),
      tilt(0.54, 0.3, 0.42, 0.26, -4), tilt(0.03, 0.52, 0.44, 0.26, -3), tilt(0.48, 0.55, 0.46, 0.27, 6),
      tilt(0.22, 0.74, 0.52, 0.25, -2),
    ],
  },
  {
    id: 'title-scatter-4', group: 'Overlapping', name: 'Title + 4 snapshots', overlap: true, frame: PRINTS,
    cells: [
      { x: 0.05, y: 0, w: 0.9, h: 0.14, text: 'Our Summer', noFrame: true },
      tilt(0.02, 0.16, 0.52, 0.4, -5), tilt(0.46, 0.18, 0.52, 0.38, 4),
      tilt(0.04, 0.56, 0.5, 0.4, 3), tilt(0.46, 0.58, 0.52, 0.4, -4),
    ],
  },
  {
    id: 'tilted-grid-4', group: 'Overlapping', name: 'Tilted 4', overlap: true, frame: PRINTS,
    cells: [tilt(0.02, 0.02, 0.5, 0.5, -3), tilt(0.48, 0.03, 0.5, 0.48, 3), tilt(0.03, 0.5, 0.48, 0.48, 2), tilt(0.49, 0.49, 0.5, 0.5, -2)],
  },
  {
    id: 'cascade-4', group: 'Overlapping', name: 'Cascade', overlap: true, frame: PRINTS,
    cells: [tilt(0, 0, 0.6, 0.4, -3), tilt(0.13, 0.2, 0.6, 0.4, 2), tilt(0.26, 0.4, 0.6, 0.4, -2), tilt(0.39, 0.6, 0.6, 0.4, 3)],
  },
  {
    id: 'fan-3', group: 'Overlapping', name: 'Fanned prints', overlap: true, frame: PRINTS,
    cells: [
      tilt(0.04, 0.12, 0.5, 0.56, -10), tilt(0.46, 0.12, 0.5, 0.56, 10), tilt(0.25, 0.08, 0.5, 0.56, 0),
      { x: 0.05, y: 0.8, w: 0.9, h: 0.18, text: 'Our Adventure', noFrame: true },
    ],
  },
  {
    id: 'inset-corner', group: 'Overlapping', name: 'Big photo + inset', overlap: true, frame: PRINTS,
    cells: [{ x: 0, y: 0, w: 1, h: 1, noFrame: true }, tilt(0.52, 0.62, 0.42, 0.32, 3)],
  },
  {
    id: 'inset-two', group: 'Overlapping', name: 'Big photo + 2 insets', overlap: true, frame: PRINTS,
    cells: [{ x: 0, y: 0, w: 1, h: 1, noFrame: true }, tilt(0.05, 0.05, 0.38, 0.28, -4), tilt(0.56, 0.66, 0.38, 0.28, 4)],
  },
  {
    id: 'cover-circle', group: 'Overlapping', name: 'Cover + circle', overlap: true, frame: PRINTS,
    cells: [
      { x: 0, y: 0, w: 1, h: 0.55, noFrame: true },
      { x: 0, y: 0.62, w: 0.485, h: 0.38 }, { x: 0.515, y: 0.62, w: 0.485, h: 0.38 },
      { x: 0.32, y: 0.4, w: 0.36, h: 0.3, shape: 'circle' },
    ],
  },
  {
    id: 'bubbles-5', group: 'Overlapping', name: 'Bubbles', overlap: true, frame: { borderPt: 6, borderColor: '#ffffff', shadow: true },
    cells: [
      { x: 0.093, y: 0.097, w: 0.556, h: 0.417, shape: 'circle' },
      { x: 0.537, y: 0.083, w: 0.407, h: 0.306, shape: 'circle' },
      { x: 0.481, y: 0.389, w: 0.444, h: 0.333, shape: 'circle' },
      { x: 0.065, y: 0.535, w: 0.426, h: 0.319, shape: 'circle' },
      { x: 0.537, y: 0.708, w: 0.37, h: 0.278, shape: 'circle' },
    ],
  },
  {
    id: 'center-circle', group: 'Overlapping', name: '4 + center circle', frame: { borderPt: 6, borderColor: '#ffffff', shadow: true },
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
