import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LAYOUTS } from '../../app/js/layouts.js';
import { PAGE_PRESETS, pageSizeFromPreset } from '../../app/js/page-sizes.js';
import { newPage, newPhotoContent } from '../../app/js/model.js';
import { cellRect, contentRect, frameRect, photoPlacement, panCrop, pointInRotRect, toLocal, toPage } from '../../app/js/geometry.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test('every layout keeps its cells inside the content area at every page size', () => {
  for (const preset of PAGE_PRESETS) {
    for (const orientation of ['portrait', 'landscape']) {
      const size = pageSizeFromPreset(preset.id, orientation);
      for (const layout of LAYOUTS) {
        const page = newPage(layout.id);
        const c = contentRect(page, size);
        for (const cell of page.cells) {
          const r = cellRect(page, size, cell);
          assert.ok(r.x >= c.x - 1e-6 && r.y >= c.y - 1e-6, `${layout.id} ${preset.id} top-left`);
          assert.ok(r.x + r.w <= c.x + c.w + 1e-6 && r.y + r.h <= c.y + c.h + 1e-6, `${layout.id} ${preset.id} bottom-right`);
          assert.ok(r.w > 0 && r.h > 0);
        }
      }
    }
  }
});

test('layout cell fractions are within 0..1', () => {
  for (const layout of LAYOUTS) {
    for (const c of layout.cells) {
      assert.ok(c.x >= 0 && c.y >= 0 && c.x + c.w <= 1 + 1e-9 && c.y + c.h <= 1 + 1e-9, layout.id);
    }
  }
});

test('gaps between neighbors equal the gap setting; outer edges touch the margin', () => {
  const size = pageSizeFromPreset('letter', 'portrait');
  const page = newPage('grid-4');
  page.marginPt = 36;
  page.gapPt = 12;
  const [a, b, c] = page.cells.map((cell) => cellRect(page, size, cell));
  close(b.x - (a.x + a.w), 12);
  close(c.y - (a.y + a.h), 12);
  close(a.x, 36);
  close(a.y, 36);
  close(b.x + b.w, size.wPt - 36);
});

test('keep-aspect shapes get a centered square frame', () => {
  const size = pageSizeFromPreset('letter', 'portrait');
  const page = newPage('two-stack');
  page.cells[0].shape = 'circle';
  const cell = cellRect(page, size, page.cells[0]);
  const frame = frameRect(page, size, page.cells[0]);
  close(frame.w, frame.h);
  close(frame.w, Math.min(cell.w, cell.h));
  close(frame.x + frame.w / 2, cell.x + cell.w / 2);
});

test('fill placement always covers the frame, even when panned to the extreme', () => {
  const meta = { id: 'p', name: 'p', type: 'image/jpeg', w: 4000, h: 3000 };
  const frame = { x: 10, y: 20, w: 200, h: 300 };
  for (const rotate of [0, 90, 180, 270]) {
    for (const zoom of [1, 1.7, 3]) {
      for (const [cx, cy] of [[0, 0], [1, 1], [0.5, 0.5], [-5, 9]]) {
        const content = { ...newPhotoContent('p'), rotate, zoom, cx, cy };
        const p = photoPlacement(content, meta, frame);
        assert.ok(p.x <= frame.x + 1e-6 && p.y <= frame.y + 1e-6, `rot ${rotate} zoom ${zoom}`);
        assert.ok(p.x + p.w >= frame.x + frame.w - 1e-6 && p.y + p.h >= frame.y + frame.h - 1e-6);
      }
    }
  }
});

test('fit placement shows the whole photo, centered', () => {
  const meta = { id: 'p', name: 'p', type: 'image/jpeg', w: 4000, h: 3000 };
  const frame = { x: 0, y: 0, w: 300, h: 300 };
  const p = photoPlacement({ ...newPhotoContent('p'), fit: 'fit' }, meta, frame);
  close(p.w, 300);
  close(p.h, 225);
  close(p.y, 37.5);
});

test('panning moves the crop and stops at the edges', () => {
  const meta = { id: 'p', name: 'p', type: 'image/jpeg', w: 4000, h: 2000 };
  const frame = { x: 0, y: 0, w: 100, h: 100 };
  const content = newPhotoContent('p');
  const right = panCrop(content, meta, frame, -1000, 0); // drag photo far left → see its right side
  close(right.cx, 0.75);
  close(right.cy, 0.5);
});

test('rotated rect hit testing and coordinate round-trip', () => {
  const r = { x: 100, y: 100, w: 200, h: 50, rotation: 90 };
  // After rotating 90° around the center (200,125), the box spans x 175..225, y 25..225.
  assert.ok(pointInRotRect(r, 200, 40));
  assert.ok(!pointInRotRect(r, 120, 125));
  const local = toLocal(r, 210, 60);
  const back = toPage(r, local.x, local.y);
  close(back.x, 210);
  close(back.y, 60);
});
