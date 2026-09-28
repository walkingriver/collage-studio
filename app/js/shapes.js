// @ts-check
// Frame shapes. Custom shapes are SVG path strings in a 0..1 unit box so they can be
// reused as-is by other platforms (e.g. a future Swift app). No DOM access at import time.

/**
 * @typedef {object} ShapeDef
 * @property {string} id
 * @property {string} name
 * @property {boolean} keepAspect  When true the shape is drawn in the largest centered square of the cell.
 * @property {'rect'|'rounded'|'ellipse'|'path'} kind
 * @property {string} [d]  SVG path data in unit coordinates (kind === 'path').
 */

/** Five-point star, generated once as a path string. */
function starPath(points = 5, inner = 0.4) {
  const cmds = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? 0.5 : 0.5 * inner;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    cmds.push(`${i === 0 ? 'M' : 'L'}${fx(0.5 + r * Math.cos(a))} ${fx(0.53 + r * Math.sin(a))}`);
  }
  return cmds.join(' ') + ' Z';
}

/** Scalloped circle ("flower") with `n` bumps. */
function scallopPath(n = 12) {
  const R = 0.42, bump = 0.08;
  const cmds = [];
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    const x0 = 0.5 + R * Math.cos(a0), y0 = 0.5 + R * Math.sin(a0);
    const x1 = 0.5 + R * Math.cos(a1), y1 = 0.5 + R * Math.sin(a1);
    const am = (a0 + a1) / 2;
    const cx = 0.5 + (R + bump * 2) * Math.cos(am), cy = 0.5 + (R + bump * 2) * Math.sin(am);
    if (i === 0) cmds.push(`M${fx(x0)} ${fx(y0)}`);
    cmds.push(`Q${fx(cx)} ${fx(cy)} ${fx(x1)} ${fx(y1)}`);
  }
  return cmds.join(' ') + ' Z';
}

/** @param {number} n */
function fx(n) {
  return (Math.round(n * 10000) / 10000).toString();
}

/** @type {ShapeDef[]} */
export const SHAPES = [
  { id: 'rect', name: 'Rectangle', keepAspect: false, kind: 'rect' },
  { id: 'rounded', name: 'Rounded', keepAspect: false, kind: 'rounded' },
  { id: 'oval', name: 'Oval', keepAspect: false, kind: 'ellipse' },
  { id: 'circle', name: 'Circle', keepAspect: true, kind: 'ellipse' },
  {
    id: 'heart', name: 'Heart', keepAspect: true, kind: 'path',
    d: 'M0.5 0.97 C0.5 0.97 0 0.66 0 0.3 C0 0.13 0.13 0.03 0.27 0.03 C0.38 0.03 0.46 0.1 0.5 0.19 C0.54 0.1 0.62 0.03 0.73 0.03 C0.87 0.03 1 0.13 1 0.3 C1 0.66 0.5 0.97 0.5 0.97 Z',
  },
  { id: 'star', name: 'Star', keepAspect: true, kind: 'path', d: starPath() },
  { id: 'hexagon', name: 'Hexagon', keepAspect: true, kind: 'path', d: 'M0.25 0.067 L0.75 0.067 L1 0.5 L0.75 0.933 L0.25 0.933 L0 0.5 Z' },
  { id: 'diamond', name: 'Diamond', keepAspect: false, kind: 'path', d: 'M0.5 0 L1 0.5 L0.5 1 L0 0.5 Z' },
  { id: 'arch', name: 'Arch', keepAspect: false, kind: 'path', d: 'M0 1 L0 0.5 C0 0.22 0.22 0 0.5 0 C0.78 0 1 0.22 1 0.5 L1 1 Z' },
  { id: 'scallop', name: 'Scallop', keepAspect: true, kind: 'path', d: scallopPath() },
];

/** @param {string} id */
export function getShape(id) {
  return SHAPES.find((s) => s.id === id) ?? SHAPES[0];
}

/**
 * Builds a Path2D for a shape inside a rect (in points). Browser only.
 * @param {string} shapeId
 * @param {{x: number, y: number, w: number, h: number}} r  frame rect (already aspect-corrected)
 * @param {number} cornerPt  corner radius used by plain rectangles
 * @returns {Path2D}
 */
export function shapePath(shapeId, r, cornerPt = 0) {
  const s = getShape(shapeId);
  const p = new Path2D();
  switch (s.kind) {
    case 'rect':
      if (cornerPt > 0) p.roundRect(r.x, r.y, r.w, r.h, Math.min(cornerPt, r.w / 2, r.h / 2));
      else p.rect(r.x, r.y, r.w, r.h);
      break;
    case 'rounded':
      p.roundRect(r.x, r.y, r.w, r.h, Math.max(cornerPt, Math.min(r.w, r.h) * 0.15));
      break;
    case 'ellipse':
      p.ellipse(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 0, 0, Math.PI * 2);
      break;
    default:
      p.addPath(new Path2D(s.d), new DOMMatrix([r.w, 0, 0, r.h, r.x, r.y]));
  }
  return p;
}
