import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newProject, newPage, applyLayout, swapCells, placePhoto, autoFill, removePhoto, duplicatePage, photoUsage, newPhotoContent, isProject } from '../../app/js/model.js';
import { remapContents, getLayout } from '../../app/js/layouts.js';
import { createStore } from '../../app/js/store.js';

function projectWithPhotos(n) {
  const doc = newProject({ layoutId: 'grid-4' });
  for (let i = 0; i < n; i++) doc.photos[`p${i}`] = { id: `p${i}`, name: `p${i}.jpg`, type: 'image/jpeg', w: 400, h: 300 };
  return doc;
}

test('new project defaults to US Letter portrait with one 4-grid page', () => {
  const doc = newProject();
  assert.equal(doc.pageSize.presetId, 'letter');
  assert.equal(doc.pageSize.wPt, 612);
  assert.equal(doc.pageSize.hPt, 792);
  assert.equal(doc.pages.length, 1);
  assert.equal(doc.pages[0].cells.length, 4);
  assert.ok(isProject(doc));
});

test('layouts with text slots start with text content', () => {
  const page = newPage('title-grid-4');
  assert.equal(page.cells[0].content?.kind, 'text');
  assert.equal(page.cells[1].content, null);
});

test('auto-fill places unused photos into empty slots in order', () => {
  const doc = projectWithPhotos(6);
  const page = doc.pages[0];
  assert.equal(autoFill(doc, page), 4);
  assert.deepEqual(page.cells.map((c) => c.content.photoId), ['p0', 'p1', 'p2', 'p3']);
  assert.equal(photoUsage(doc).get('p4'), undefined);
});

test('swap exchanges contents and resets the crop', () => {
  const doc = projectWithPhotos(2);
  const page = doc.pages[0];
  placePhoto(page, page.cells[0].id, 'p0');
  page.cells[0].content.zoom = 2;
  swapCells(page, page.cells[0].id, page.cells[1].id);
  assert.equal(page.cells[0].content, null);
  assert.equal(page.cells[1].content.photoId, 'p0');
  assert.equal(page.cells[1].content.zoom, 1);
});

test('changing layout keeps photos in order and reports extras', () => {
  const doc = projectWithPhotos(4);
  const page = doc.pages[0];
  autoFill(doc, page);
  const res = applyLayout(page, 'two-stack');
  assert.equal(res.droppedPhotos, 2);
  assert.deepEqual(page.cells.map((c) => c.content.photoId), ['p0', 'p1']);
  applyLayout(page, 'title-grid-4');
  assert.equal(page.cells[0].content.kind, 'text');
  assert.deepEqual(page.cells.slice(1, 3).map((c) => c.content.photoId), ['p0', 'p1']);
});

test('remap puts existing text into text slots first', () => {
  const texts = [{ kind: 'text', text: 'Hello' }, { kind: 'photo', photoId: 'a' }];
  const { assigned } = remapContents(texts, getLayout('caption-hero').cells);
  assert.equal(assigned[0].kind, 'photo');
  assert.equal(assigned[1].text, 'Hello');
});

test('removing a photo clears every slot that used it', () => {
  const doc = projectWithPhotos(1);
  doc.pages.push(newPage('one'));
  placePhoto(doc.pages[0], doc.pages[0].cells[2].id, 'p0');
  placePhoto(doc.pages[1], doc.pages[1].cells[0].id, 'p0');
  removePhoto(doc, 'p0');
  assert.equal(doc.pages[0].cells[2].content, null);
  assert.equal(doc.pages[1].cells[0].content, null);
  assert.equal(doc.photos.p0, undefined);
});

test('duplicate page gets fresh ids but same content', () => {
  const page = newPage('grid-4');
  page.cells[0].content = newPhotoContent('x');
  const copy = duplicatePage(page);
  assert.notEqual(copy.id, page.id);
  assert.notEqual(copy.cells[0].id, page.cells[0].id);
  assert.equal(copy.cells[0].content.photoId, 'x');
});

test('store: undo/redo and dirty tracking', () => {
  const store = createStore(newProject());
  assert.equal(store.isDirty(), false);
  store.update((d) => { d.title = 'A'; });
  store.update((d) => { d.title = 'B'; });
  assert.equal(store.doc.title, 'B');
  assert.equal(store.isDirty(), true);
  store.undo();
  assert.equal(store.doc.title, 'A');
  store.undo();
  assert.equal(store.doc.title, 'My Collage');
  assert.equal(store.isDirty(), false);
  assert.equal(store.undo(), false);
  store.redo();
  assert.equal(store.doc.title, 'A');
  store.update((d) => { d.title = 'C'; });
  assert.equal(store.canRedo(), false);
});

test('store: edits in the same group merge into one undo step', () => {
  const store = createStore(newProject());
  for (let i = 1; i <= 5; i++) store.update((d) => { d.pages[0].gapPt = i; }, { group: 'gap' });
  store.endGroup();
  store.update((d) => { d.pages[0].gapPt = 99; }, { group: 'gap' });
  store.undo();
  assert.equal(store.doc.pages[0].gapPt, 5);
  store.undo();
  assert.equal(store.doc.pages[0].gapPt, 12);
});

test('store: old versions are not mutated by later edits', () => {
  const store = createStore(newProject());
  const before = store.doc;
  store.update((d) => { d.pages[0].background = '#000000'; });
  assert.equal(before.pages[0].background, '#ffffff');
});

test('store: sticky groups merge until endGroup', async () => {
  const store = createStore(newProject());
  store.update((d) => { d.pages[0].gapPt = 1; }, { group: 'drag', sticky: true });
  await new Promise((r) => setTimeout(r, 1600));
  store.update((d) => { d.pages[0].gapPt = 2; }, { group: 'drag', sticky: true });
  store.endGroup();
  store.undo();
  assert.equal(store.doc.pages[0].gapPt, 12);
});
