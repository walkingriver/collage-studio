// @ts-check
// "Surprise me" layouts, generated on the fly. Pure (no DOM); pass `rng` for repeatable tests.
//
// - Mosaic: splits the page into n tiles again and again at random, then keeps the try
//   whose tile shapes best match the photos (tall photos in tall tiles), so little is cropped.
// - Scatter: tilted, overlapping prints spread around the page on a jittered grid.

/** @typedef {import('./layouts.js').LayoutCell} LayoutCell */
/** @typedef {LayoutCell & {item: number}} PlacedCell  item = index into the `want` list */
/** @typedef {{x: number, y: number, w: number, h: number}} R */

const MOSAIC_TRIES = 60;

/**
 * @param {number} n  number of slots
 * @param {number} areaAspect  content area width / height
 * @param {number[]} want  preferred aspect ratio (w/h) of each item, length n
 * @param {() => number} [rng]
 * @returns {PlacedCell[]}  in drawing order
 */
export function randomMosaic(n, areaAspect, want, rng = Math.random) {
  /** @type {PlacedCell[]|null} */
  let best = null;
  let bestScore = Infinity;
  for (let t = 0; t < MOSAIC_TRIES; t++) {
    const rects = partition({ x: 0, y: 0, w: 1, h: 1 }, n, areaAspect, rng);
    const aspects = rects.map((r) => (r.w * areaAspect) / r.h);
    const { cellFor, cost } = matchAspects(aspects, want, rng);
    // A little noise keeps repeated clicks from settling on the same answer.
    const score = (cost + sizePenalty(rects)) * (0.9 + rng() * 0.2);
    if (score < bestScore) {
      bestScore = score;
      best = want.map((_, item) => ({ ...tidy(rects[cellFor[item]]), item }));
    }
  }
  return /** @type {PlacedCell[]} */ (best);
}

/**
 * Recursively splits a rect into n tiles, cutting across the longer side most of the time.
 * @param {R} r
 * @param {number} n
 * @param {number} A  area aspect, to judge real (not fractional) proportions
 * @param {() => number} rng
 * @returns {R[]}
 */
function partition(r, n, A, rng) {
  if (n <= 1) return [r];
  const n1 = Math.min(n - 1, Math.max(1, Math.round(n * (0.3 + rng() * 0.4))));
  const frac = Math.min(0.8, Math.max(0.2, (n1 / n) * (0.85 + rng() * 0.3)));
  const wide = r.w * A > r.h;
  const sideBySide = wide ? rng() < 0.85 : rng() < 0.15;
  const [a, b] = sideBySide
    ? [{ x: r.x, y: r.y, w: r.w * frac, h: r.h }, { x: r.x + r.w * frac, y: r.y, w: r.w * (1 - frac), h: r.h }]
    : [{ x: r.x, y: r.y, w: r.w, h: r.h * frac }, { x: r.x, y: r.y + r.h * frac, w: r.w, h: r.h * (1 - frac) }];
  return [...partition(a, n1, A, rng), ...partition(b, n - n1, A, rng)];
}

/**
 * Pairs tiles with items so each tile's shape is close to its item's shape.
 * Sorting both by aspect and pairing in order is optimal for this cost.
 * @param {number[]} tileAspects
 * @param {number[]} want
 * @param {() => number} rng
 * @returns {{cellFor: number[], cost: number}}  cellFor[item] = tile index
 */
export function matchAspects(tileAspects, want, rng = Math.random) {
  const shuffled = (/** @type {number} */ len) => shuffle([...Array(len).keys()], rng);
  const tiles = shuffled(tileAspects.length).sort((i, j) => tileAspects[i] - tileAspects[j]);
  const items = shuffled(want.length).sort((i, j) => want[i] - want[j]);
  const cellFor = new Array(want.length);
  let cost = 0;
  items.forEach((item, k) => {
    cellFor[item] = tiles[k];
    cost += Math.abs(Math.log(tileAspects[tiles[k]] / want[item]));
  });
  return { cellFor, cost };
}

/** Discourages tiny tiles next to huge ones. @param {R[]} rects */
function sizePenalty(rects) {
  const avg = 1 / rects.length;
  return rects.reduce((p, r) => {
    const a = r.w * r.h;
    return p + (a < avg * 0.35 ? (avg * 0.35 - a) / avg * 4 : 0);
  }, 0);
}

const SCATTER_TRIES = 30;

/**
 * Overlapping, tilted prints spread over the page. Several random tries are scored so no
 * photo ends up mostly hidden and the page doesn't have big bare patches.
 * @param {number} n
 * @param {number} A  content area width / height
 * @param {number[]} want  preferred aspect ratio of each item
 * @param {() => number} [rng]
 * @returns {PlacedCell[]}  in drawing order (random, so any photo may end up on top)
 */
export function randomScatter(n, A, want, rng = Math.random) {
  /** @type {PlacedCell[]|null} */
  let best = null;
  let bestScore = Infinity;
  for (let t = 0; t < SCATTER_TRIES; t++) {
    const cells = oneScatter(n, A, want, rng);
    const score = scatterCost(cells, A) * (0.9 + rng() * 0.2);
    if (score < bestScore) {
      bestScore = score;
      best = cells;
    }
  }
  return /** @type {PlacedCell[]} */ (best);
}

/**
 * @param {number} n
 * @param {number} A
 * @param {number[]} want
 * @param {() => number} rng
 * @returns {PlacedCell[]}
 */
function oneScatter(n, A, want, rng) {
  // Work in units where the content area is A wide and 1 tall.
  let cols = Math.max(1, Math.round(Math.sqrt(n * A)));
  let rows = Math.ceil(n / cols);
  if ((cols - 1) * rows >= n) cols--;
  rows = Math.ceil(n / cols);
  const cw = A / cols, ch = 1 / rows;
  const slots = shuffle([...Array(cols * rows).keys()], rng).slice(0, n);
  const out = want.map((aspect, item) => {
    const s = slots[item];
    const col = s % cols, row = Math.floor(s / cols);
    const a = Math.min(1.7, Math.max(0.6, aspect));
    const base = Math.sqrt(cw * ch) * (0.88 + rng() * 0.2);
    let w = base * Math.sqrt(a), h = base / Math.sqrt(a);
    const sign = rng() < 0.5 ? -1 : 1;
    const rot = Math.round(sign * (1.5 + rng() * 7.5) * 10) / 10;
    const rad = (rot * Math.PI) / 180;
    const cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad));
    // Shrink prints whose tilted corners wouldn't fit on the page.
    const shrink = Math.min(1, (A * 0.995) / (w * cos + h * sin), 0.995 / (w * sin + h * cos));
    w *= shrink;
    h *= shrink;
    const hx = (w * cos + h * sin) / 2;
    const hy = (w * sin + h * cos) / 2;
    let cx = (col + 0.5) * cw + (rng() - 0.5) * cw * 0.3;
    let cy = (row + 0.5) * ch + (rng() - 0.5) * ch * 0.3;
    cx = Math.min(A - hx, Math.max(hx, cx));
    cy = Math.min(1 - hy, Math.max(hy, cy));
    return { ...tidy({ x: (cx - w / 2) / A, y: cy - h / 2, w: w / A, h }), rot, item };
  });
  return shuffle(out, rng);
}

/**
 * Lower is better: photos hidden under later ones, plus bare page.
 * @param {PlacedCell[]} cells  in drawing order
 * @param {number} A
 */
function scatterCost(cells, A) {
  const boxes = cells.map((c) => {
    const w = c.w * A, h = c.h, rad = ((c.rot ?? 0) * Math.PI) / 180;
    return { cx: c.x * A + w / 2, cy: c.y + h / 2, w, h, cos: Math.cos(rad), sin: Math.sin(rad) };
  });
  const inside = (/** @type {typeof boxes[0]} */ b, /** @type {number} */ px, /** @type {number} */ py) => {
    const dx = px - b.cx, dy = py - b.cy;
    const lx = dx * b.cos + dy * b.sin, ly = -dx * b.sin + dy * b.cos;
    return Math.abs(lx) <= b.w / 2 && Math.abs(ly) <= b.h / 2;
  };
  let hidden = 0, worst = 0;
  const S = 5;
  boxes.forEach((b, k) => {
    let covered = 0;
    for (let i = 0; i < S; i++) for (let j = 0; j < S; j++) {
      const lx = ((i + 0.5) / S - 0.5) * b.w, ly = ((j + 0.5) / S - 0.5) * b.h;
      const px = b.cx + lx * b.cos - ly * b.sin, py = b.cy + lx * b.sin + ly * b.cos;
      if (boxes.some((o, m) => m > k && inside(o, px, py))) covered++;
    }
    const f = covered / (S * S);
    hidden += f * f;
    worst = Math.max(worst, f);
  });
  let bare = 0;
  const G = 14;
  for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) {
    if (!boxes.some((b) => inside(b, ((i + 0.5) / G) * A, (j + 0.5) / G))) bare++;
  }
  return hidden + 6 * Math.max(0, worst - 0.25) + 1.5 * (bare / (G * G));
}

/**
 * @template T
 * @param {T[]} arr
 * @param {() => number} rng
 */
function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Rounds edges (not sizes) so neighbouring tiles still share exact edges. @param {R} r */
function tidy(r) {
  const q = (/** @type {number} */ v) => Math.round(v * 1e6) / 1e6;
  const x0 = q(r.x), y0 = q(r.y), x1 = q(r.x + r.w), y1 = q(r.y + r.h);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Small seeded random number generator, for tests. @param {number} seed */
export function seededRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
