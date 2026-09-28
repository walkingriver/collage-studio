import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomMosaic, randomScatter, matchAspects, seededRng } from '../../app/js/random-layout.js';
import { LAYOUTS } from '../../app/js/layouts.js';
import { PAGE_PRESETS, pageSizeFromPreset } from '../../app/js/page-sizes.js';
import { newPage, suggestFrame, applyLayout } from '../../app/js/model.js';
import { cellRect, contentRect, frameRect, cellRotation, rotateAround, toFrameLocal } from '../../app/js/geometry.js';

const EPS = 1e-6;

test('mosaic tiles cover the page exactly, once each, for 1..16 photos', () => {
  for (const A of [0.75, 1, 1.333, 0.5]) {
    for (let n = 1; n <= 16; n++) {
      const rng = seededRng(n * 97 + Math.round(A * 10));
      const cells = randomMosaic(n, A, Array(n).fill(1.33), rng);
      assert.equal(cells.length, n);
      assert.deepEqual([...cells.map((c) => c.item)].sort((a, b) => a - b), [...Array(n).keys()]);
      const area = cells.reduce((s, c) => s + c.w * c.h, 0);
      assert.ok(Math.abs(area - 1) < 1e-4, `area ${area}`);
      for (const c of cells) assert.ok(c.x >= -EPS && c.y >= -EPS && c.x + c.w <= 1 + EPS && c.y + c.h <= 1 + EPS);
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const a = cells[i], b = cells[j];
        const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        assert.ok(ox <= 1e-4 || oy <= 1e-4, 'tiles must not overlap');
      }
    }
  }
});

test('mosaic gives tall photos tall tiles and wide photos wide tiles', () => {
  const A = 0.75;
  const want = [0.5, 2, 2, 0.5, 1.33];
  const cells = randomMosaic(want.length, A, want, seededRng(7));
  const aspect = (c) => (c.w * A) / c.h;
  const byItem = new Map(cells.map((c) => [c.item, c]));
  const tallest = Math.min(...cells.map(aspect));
  assert.ok(aspect(byItem.get(0)) < 1 && aspect(byItem.get(3)) < 1.2, 'portrait photos in taller tiles');
  assert.ok(aspect(byItem.get(1)) > 1 && aspect(byItem.get(2)) > 1, 'landscape photos in wider tiles');
  assert.ok([aspect(byItem.get(0)), aspect(byItem.get(3))].includes(tallest));
});

test('each call gives a different arrangement', () => {
  const a = JSON.stringify(randomMosaic(6, 0.75, Array(6).fill(1.33)));
  const b = JSON.stringify(randomMosaic(6, 0.75, Array(6).fill(1.33)));
  assert.notEqual(a, b);
});

test('aspect matching pairs sorted with sorted', () => {
  const { cellFor, cost } = matchAspects([2, 0.5, 1], [0.5, 1, 2], seededRng(1));
  assert.deepEqual(cellFor, [1, 2, 0]);
  assert.ok(cost < 1e-9);
});

test('scattered prints stay on the page even when tilted', () => {
  for (const preset of PAGE_PRESETS) {
    for (const orientation of ['portrait', 'landscape']) {
      const size = pageSizeFromPreset(preset.id, orientation);
      const page = newPage('scatter-3');
      const c = contentRect(page, size);
      for (let n = 1; n <= 12; n++) {
        const cells = randomScatter(n, c.w / c.h, Array(n).fill(1.33), seededRng(n + preset.id.length));
        assert.equal(new Set(cells.map((x) => x.item)).size, n);
        for (const cell of cells) {
          assert.ok(Math.abs(cell.rot) >= 1.5 && Math.abs(cell.rot) <= 9);
          const r = { x: c.x + cell.x * c.w, y: c.y + cell.y * c.h, w: cell.w * c.w, h: cell.h * c.h };
          for (const [px, py] of [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]) {
            const p = rotateAround(px, py, r.x + r.w / 2, r.y + r.h / 2, cell.rot);
            assert.ok(p.x >= c.x - 0.01 && p.x <= c.x + c.w + 0.01 && p.y >= c.y - 0.01 && p.y <= c.y + c.h + 0.01, `${preset.id} ${orientation} n=${n}`);
          }
        }
      }
    }
  }
});

test('overlapping layouts: tilted corners stay on the page at every size', () => {
  for (const preset of PAGE_PRESETS) {
    for (const orientation of ['portrait', 'landscape']) {
      const size = pageSizeFromPreset(preset.id, orientation);
      for (const layout of LAYOUTS.filter((l) => l.overlap)) {
        const page = newPage(layout.id);
        for (const cell of page.cells) {
          const f = frameRect(page, size, cell);
          const deg = cellRotation(cell);
          for (const [px, py] of [[f.x, f.y], [f.x + f.w, f.y], [f.x, f.y + f.h], [f.x + f.w, f.y + f.h]]) {
            const p = rotateAround(px, py, f.x + f.w / 2, f.y + f.h / 2, deg);
            assert.ok(p.x >= 0 && p.y >= 0 && p.x <= size.wPt && p.y <= size.hPt, `${layout.id} ${preset.id} ${orientation}`);
          }
        }
      }
    }
  }
});

test('overlap layouts add no spacing, keep tilt, and suggest print borders', () => {
  const size = pageSizeFromPreset('letter', 'portrait');
  const page = newPage('inset-corner');
  assert.equal(page.overlap, true);
  assert.equal(page.frame.borderPt, 8);
  assert.equal(page.frame.shadow, true);
  assert.equal(page.cells[0].noFrame, true);
  assert.equal(page.cells[1].rotation, 3);
  page.gapPt = 40;
  const full = cellRect(page, size, page.cells[0]);
  const c = contentRect(page, size);
  assert.deepEqual(full, { x: c.x, y: c.y, w: c.w, h: c.h });
  applyLayout(page, 'grid-4');
  assert.equal(page.overlap, false);
  assert.equal(page.cells[0].rotation, undefined);
});

test('suggested frames never replace a border the user chose', () => {
  const frame = { borderPt: 3, borderColor: '#ff0000', radiusPt: 0, shadow: false };
  suggestFrame(frame, { borderPt: 8, borderColor: '#ffffff', shadow: true });
  assert.deepEqual(frame, { borderPt: 3, borderColor: '#ff0000', radiusPt: 0, shadow: true });
});

test('points map into a tilted frame and back', () => {
  const f = { x: 100, y: 100, w: 200, h: 100 };
  const local = toFrameLocal(f, 30, 250, 180);
  const back = rotateAround(local.x, local.y, 200, 150, 30);
  assert.ok(Math.abs(back.x - 250) < 1e-9 && Math.abs(back.y - 180) < 1e-9);
});

/** Fraction of each print covered by prints drawn after it (sampled). */
function hiddenFractions(cells, A) {
  const boxes = cells.map((c) => {
    const w = c.w * A, h = c.h, r = (c.rot * Math.PI) / 180;
    return { cx: c.x * A + w / 2, cy: c.y + h / 2, w, h, cos: Math.cos(r), sin: Math.sin(r) };
  });
  const inside = (b, px, py) => {
    const dx = px - b.cx, dy = py - b.cy;
    return Math.abs(dx * b.cos + dy * b.sin) <= b.w / 2 && Math.abs(-dx * b.sin + dy * b.cos) <= b.h / 2;
  };
  return boxes.map((b, k) => {
    let covered = 0;
    const S = 10;
    for (let i = 0; i < S; i++) for (let j = 0; j < S; j++) {
      const lx = ((i + 0.5) / S - 0.5) * b.w, ly = ((j + 0.5) / S - 0.5) * b.h;
      const px = b.cx + lx * b.cos - ly * b.sin, py = b.cy + lx * b.sin + ly * b.cos;
      if (boxes.some((o, m) => m > k && inside(o, px, py))) covered++;
    }
    return covered / (S * S);
  });
}

test('scattered prints overlap but no photo gets buried', () => {
  for (const A of [0.75, 1.333]) {
    for (const n of [3, 5, 8, 12]) {
      let sumWorst = 0;
      for (let s = 1; s <= 30; s++) {
        const worst = Math.max(...hiddenFractions(randomScatter(n, A, Array(n).fill(1.33), seededRng(s * 131 + n)), A));
        assert.ok(worst < 0.6, `A=${A} n=${n} seed=${s}: ${Math.round(worst * 100)}% hidden`);
        sumWorst += worst;
      }
      assert.ok(sumWorst / 30 < 0.35, `A=${A} n=${n}: typical worst ${Math.round((sumWorst / 30) * 100)}%`);
    }
  }
});
