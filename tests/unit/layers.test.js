import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUTS } from '../../app/js/layouts.js';
import { PAGE_PRESETS, pageSizeFromPreset } from '../../app/js/page-sizes.js';
import { newPage, moveCellLayer } from '../../app/js/model.js';
import { cellsOverlap, polygonsOverlap } from '../../app/js/geometry.js';

const letter = pageSizeFromPreset('letter', 'portrait');
const overlapsOn = (page, size = letter) => (a, b) => cellsOverlap(page, size, a, b);
const ids = (page) => page.cells.map((c) => c.id);

test('slots in non-overlapping layouts never count as overlapping, even with no gap', () => {
  for (const preset of PAGE_PRESETS) {
    const size = pageSizeFromPreset(preset.id, 'portrait');
    for (const layout of LAYOUTS.filter((l) => !l.overlap && l.id !== 'center-circle')) {
      for (const gap of [12, 0]) {
        const page = newPage(layout.id);
        page.gapPt = gap;
        for (const a of page.cells) for (const b of page.cells) {
          assert.equal(cellsOverlap(page, size, a, b), false, `${layout.id} ${preset.id} gap ${gap}`);
        }
      }
    }
  }
});

test('overlapping layouts, and a slot tilted into its neighbour, do overlap', () => {
  const scatter = newPage('scatter-3');
  assert.ok(cellsOverlap(scatter, letter, scatter.cells[0], scatter.cells[1]));
  const grid = newPage('grid-4');
  grid.gapPt = 4;
  assert.equal(cellsOverlap(grid, letter, grid.cells[0], grid.cells[1]), false);
  grid.cells[0].rotation = 10;
  assert.ok(cellsOverlap(grid, letter, grid.cells[0], grid.cells[1]));
});

test('touching polygons are not overlapping; crossing ones are', () => {
  const sq = (x, y) => [{ x, y }, { x: x + 10, y }, { x: x + 10, y: y + 10 }, { x, y: y + 10 }];
  assert.equal(polygonsOverlap(sq(0, 0), sq(10, 0)), false);
  assert.equal(polygonsOverlap(sq(0, 0), sq(9, 0)), true);
  assert.equal(polygonsOverlap(sq(0, 0), sq(30, 30)), false);
});

test('to front / to back move past everything; forward / backward step past the next overlap', () => {
  // A overlaps C and D, but not B.
  const page = { cells: ['A', 'B', 'C', 'D'].map((id) => ({ id })) };
  const overlap = (a, b) => [a.id, b.id].sort().join('') !== 'AB';
  assert.equal(moveCellLayer(page, 'A', 'forward', overlap), true);
  assert.deepEqual(ids(page), ['B', 'C', 'A', 'D']);
  assert.equal(moveCellLayer(page, 'A', 'forward', overlap), true);
  assert.deepEqual(ids(page), ['B', 'C', 'D', 'A']);
  assert.equal(moveCellLayer(page, 'A', 'forward', overlap), false);
  assert.equal(moveCellLayer(page, 'A', 'backward', overlap), true);
  assert.deepEqual(ids(page), ['B', 'C', 'A', 'D']);
  assert.equal(moveCellLayer(page, 'A', 'back', overlap), true);
  assert.deepEqual(ids(page), ['A', 'B', 'C', 'D']);
  assert.equal(moveCellLayer(page, 'A', 'back', overlap), false);
  assert.equal(moveCellLayer(page, 'A', 'front', overlap), true);
  assert.deepEqual(ids(page), ['B', 'C', 'D', 'A']);
});

test('nothing moves when the slot overlaps nothing in that direction', () => {
  const page = newPage('scatter-3');
  const before = ids(page);
  const top = page.cells[page.cells.length - 1].id;
  assert.equal(moveCellLayer(page, top, 'front', overlapsOn(page)), false);
  assert.deepEqual(ids(page), before);
  assert.equal(moveCellLayer(page, top, 'back', overlapsOn(page)), true);
  assert.equal(page.cells[0].id, top);
});
