import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrapText, layoutText, positionLines, fontString } from '../../app/js/text.js';
import { defaultTextStyle, newProject } from '../../app/js/model.js';
import { filterString, adjustKey } from '../../app/js/adjust.js';
import { packProject, unpackProject } from '../../app/js/io/project-file.js';

// Fake measure: every character is 10 units wide at any font size.
const measure = (s) => s.length * 10;

test('wrapText wraps words, keeps newlines, and breaks long words', () => {
  assert.deepEqual(wrapText('hello big world', 90, 'f', measure), ['hello big', 'world']);
  assert.deepEqual(wrapText('a\n\nb', 100, 'f', measure), ['a', '', 'b']);
  assert.deepEqual(wrapText('abcdefghijkl', 50, 'f', measure), ['abcde', 'fghij', 'kl']);
  assert.deepEqual(wrapText('', 50, 'f', measure), ['']);
});

test('slot text shrinks to fit its box', () => {
  const style = defaultTextStyle({ sizePt: 100, lineHeight: 1 });
  const lay = layoutText('one two three four five six', style, 200, 100, (s, font) => s.length * parseFloat(font.match(/(\d+(\.\d+)?)px/)[1]) * 0.5);
  assert.ok(lay.sizePt < 100);
  assert.ok(lay.textH <= 100 - lay.pad * 2);
});

test('lines are positioned by alignment', () => {
  const style = defaultTextStyle({ align: 'left', vAlign: 'top', lineHeight: 1, sizePt: 10 });
  const lay = layoutText('a b', style, 100, 100, measure, { pad: 5 });
  const pos = positionLines(lay, style, { x: 0, y: 0, w: 100, h: 100 });
  assert.equal(pos[0].x, 5);
  assert.equal(pos[0].y, 10);
});

test('fontString includes weight, style and family', () => {
  assert.equal(fontString(defaultTextStyle({ font: 'Lora', bold: true, italic: true }), 12), 'italic 700 12px "Lora", sans-serif');
});

test('filterString builds canvas filters', () => {
  assert.equal(filterString({ brightness: 0, contrast: 0, saturation: 0, warmth: 0, preset: 'none' }), 'none');
  assert.equal(
    filterString({ brightness: 0.2, contrast: 0, saturation: -1, warmth: 0.5, preset: 'bw' }, (w) => `url(#w${w})`),
    'url(#w0.5) brightness(1.1) saturate(0) grayscale(1)',
  );
  assert.notEqual(adjustKey({ brightness: 0.1, contrast: 0, saturation: 0, warmth: 0, preset: 'none' }), adjustKey({ brightness: 0, contrast: 0, saturation: 0, warmth: 0, preset: 'none' }));
});

test('project files round-trip with photos', () => {
  const doc = newProject();
  doc.photos.abc = { id: 'abc', name: 'a.jpg', type: 'image/jpeg', w: 64, h: 64 };
  const photo = new Uint8Array([1, 2, 3, 4]);
  const zip = packProject(doc, new Map([['abc', photo]]));
  const back = unpackProject(zip);
  assert.deepEqual(back.doc, doc);
  assert.deepEqual([...back.photoBytes.get('abc')], [1, 2, 3, 4]);
});

test('unpackProject rejects non-projects with a friendly message', () => {
  assert.throws(() => unpackProject(new Uint8Array([1, 2, 3])), /not a Collage Studio project/);
});

test('slot text shrinks rather than splitting a word', () => {
  const style = defaultTextStyle({ sizePt: 40, lineHeight: 1 });
  const m = (s, font) => s.length * parseFloat(font.match(/(\d+(\.\d+)?)px/)[1]) * 0.6;
  const lay = layoutText('Summer 2026', style, 120, 200, m, { pad: 0 });
  assert.deepEqual(lay.lines, ['Summer', '2026']);
});
