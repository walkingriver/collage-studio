// @ts-check
// End-to-end: drives the real UI with mouse and keyboard in Edge/Chrome.
import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const fixtures = path.resolve(import.meta.dirname, '../fixtures');
const photo = (/** @type {string} */ n) => path.join(fixtures, n);
const outDir = path.resolve(import.meta.dirname, 'out');
fs.mkdirSync(outDir, { recursive: true });

// File System Access pickers are native dialogs Playwright can't drive, so replace them
// with in-memory fakes that record what the app saves and replay it on open.
async function fakeFilePickers(page) {
  await page.addInitScript(() => {
    const saved = (window.__saved = []);
    const makeHandle = (name) => {
      const h = {
        kind: 'file', name, data: null,
        async queryPermission() { return 'granted'; },
        async requestPermission() { return 'granted'; },
        async isSameEntry(o) { return o === h; },
        async createWritable() {
          const parts = [];
          return { async write(b) { parts.push(b); }, async close() { h.data = new Blob(parts); saved.push({ name, blob: h.data }); } };
        },
        async getFile() { return new File([h.data], name); },
      };
      return h;
    };
    window.showSaveFilePicker = async ({ suggestedName }) => makeHandle(suggestedName);
    window.showOpenFilePicker = async () => {
      const last = [...saved].reverse().find((s) => s.name.endsWith('.collage'));
      const h = makeHandle(last.name);
      h.data = last.blob;
      return [h];
    };
    window.__printCalls = 0;
    window.print = () => { window.__printCalls++; };
  });
}

/** Screen position of a slot's center. */
async function cellCenter(page, index) {
  return page.evaluate(async (i) => {
    const { frameRect } = await import('/js/geometry.js');
    const app = window.collage;
    const r = document.getElementById('stage-canvas').getBoundingClientRect();
    const v = app.stage.view;
    const f = frameRect(app.page, app.doc.pageSize, app.page.cells[i]);
    return { x: r.left + v.ox + (f.x + f.w / 2) * v.scale, y: r.top + v.oy + (f.y + f.h / 2) * v.scale };
  }, index);
}

const cells = (page) => page.evaluate(() => window.collage.page.cells.map((c) => ({ kind: c.content?.kind ?? null, photo: c.content?.photoId ?? null, shape: c.shape })));

test('make a collage start to finish', async ({ page }) => {
  await fakeFilePickers(page);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');

  // New collage: US Letter portrait is preselected; pick the 4 grid.
  await page.getByRole('button', { name: 'New collage' }).click();
  const dialog = page.locator('dialog[open]');
  await expect(dialog.locator('[data-preset=letter]')).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.locator('[data-orient=portrait]')).toHaveAttribute('aria-pressed', 'true');
  await dialog.locator('[data-layout=grid-4]').click();
  await dialog.getByRole('button', { name: 'Create collage' }).click();
  await expect(page.locator('#app')).toBeVisible();

  // Add photos with the tray button; they fill the empty slots in order.
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#tray [data-a=add]').click();
  await (await chooser).setFiles(['photo1-landscape.jpg', 'photo2-portrait.jpg', 'photo3-square.jpg', 'photo4-wide.jpg', 'photo5-small.jpg'].map(photo));
  await expect.poll(async () => (await cells(page)).filter((c) => c.kind === 'photo').length).toBe(4);
  await expect(page.locator('.tray-photo')).toHaveCount(5);
  const before = await cells(page);

  // Drag slot 1 onto slot 2 with the mouse: they swap.
  const a = await cellCenter(page, 0), b = await cellCenter(page, 1);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
  let now = await cells(page);
  expect(now[0].photo).toBe(before[1].photo);
  expect(now[1].photo).toBe(before[0].photo);

  // Crop: double-click, drag the photo, press Done.
  const c = await cellCenter(page, 2);
  await page.mouse.dblclick(c.x, c.y);
  await expect(page.locator('.crop-bar')).toBeVisible();
  await page.mouse.wheel(0, -400);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x - 60, c.y - 30, { steps: 6 });
  await page.mouse.up();
  await page.locator('.crop-bar [data-crop=done]').click();
  const crop = await page.evaluate(() => window.collage.page.cells[2].content);
  expect(crop.zoom).toBeGreaterThan(1.2);
  expect(crop.cx).not.toBe(0.5);

  // Color + shape from the side panel.
  await page.mouse.click(c.x, c.y);
  await page.getByRole('button', { name: 'Black & white' }).click();
  await page.locator('.shapes [data-value=heart]').click();
  now = await cells(page);
  expect(now[2].shape).toBe('heart');
  expect(await page.evaluate(() => window.collage.page.cells[2].content.adjust.preset)).toBe('bw');

  // Warmth slider (keyboard on the range input).
  const warmth = page.locator('input[data-bind="adjust.warmth"]');
  await warmth.focus();
  for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => window.collage.page.cells[2].content.adjust.warmth)).toBeCloseTo(0.2, 5);

  // Right-click slot 4 → Change to text, type, finish with Escape.
  const d = await cellCenter(page, 3);
  await page.mouse.click(d.x, d.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Change to text' }).click();
  await page.keyboard.type('Summer 2026');
  await page.keyboard.press('Escape');
  now = await cells(page);
  expect(now[3].kind).toBe('text');
  expect(await page.evaluate(() => window.collage.page.cells[3].content.text)).toBe('Summer 2026');

  // Pick a script font for that text.
  await page.mouse.click(d.x, d.y);
  await page.locator('[data-act=fonts]').click();
  await page.locator('.font-list [data-font="Dancing Script"]').click();
  expect(await page.evaluate(() => window.collage.page.cells[3].content.style.font)).toBe('Dancing Script');

  // Floating text box over the big photo.
  await page.getByRole('button', { name: 'Add text' }).click();
  await page.keyboard.type('Family Beach Day');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.collage.page.textBoxes.map((t) => t.text))).toEqual(['Family Beach Day']);

  // Undo / redo from the keyboard (focus the canvas first).
  await page.locator('#stage-canvas').focus();
  await page.keyboard.press('Control+z');
  expect(await page.evaluate(() => window.collage.page.textBoxes[0]?.text)).toBe('Your text');
  await page.keyboard.press('Control+y');
  expect(await page.evaluate(() => window.collage.page.textBoxes[0]?.text)).toBe('Family Beach Day');

  // Second page with a different layout.
  await page.getByRole('button', { name: 'Add page' }).click();
  await page.locator('dialog[open] [data-layout=three-side]').click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Add page' }).click();
  await expect(page.locator('.page-thumb')).toHaveCount(2);
  await page.locator('.tray-photo').nth(4).click(); // click a tray photo → first empty slot
  expect((await cells(page)).filter((x) => x.kind === 'photo').length).toBe(1);

  await page.locator('#stage').screenshot({ path: path.join(outDir, 'page2.png') });
  await page.locator('.page-thumb').first().click();
  await page.locator('#stage').screenshot({ path: path.join(outDir, 'page1.png') });

  // Save, then reopen and compare.
  await page.locator('#toolbar [data-a=save]').click();
  await expect(page.locator('.dirty-dot')).toBeHidden();
  const savedDoc = await page.evaluate(() => JSON.stringify(window.collage.doc));
  await page.evaluate(() => window.collage.store.update((doc) => { doc.title = 'changed'; }));
  page.once('dialog', () => {});
  await page.locator('#toolbar [data-a=open]').click();
  await page.locator('dialog[open]').getByRole('button', { name: "Don't save" }).click();
  await expect.poll(() => page.evaluate(() => window.collage.doc.title)).toBe('My Collage');
  expect(await page.evaluate(() => JSON.stringify(window.collage.doc))).toBe(savedDoc);

  // Save JPEG at 300 DPI: US Letter is 2550 × 3300 pixels.
  await page.locator('#toolbar [data-a=jpeg]').click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Save JPEG' }).click();
  await expect.poll(() => page.evaluate(() => window.__saved.filter((s) => s.name.endsWith('.jpg')).length)).toBe(1);
  const jpeg = await page.evaluate(async () => {
    const s = window.__saved.find((x) => x.name.endsWith('.jpg'));
    const bmp = await createImageBitmap(s.blob);
    const bytes = new Uint8Array(await s.blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { name: s.name, w: bmp.width, h: bmp.height, b64: btoa(bin) };
  });
  expect(jpeg).toMatchObject({ name: 'My Collage.jpg', w: 2550, h: 3300 });
  fs.writeFileSync(path.join(outDir, jpeg.name), Buffer.from(jpeg.b64, 'base64'));

  // Save as PDF goes through the print window with exact page size.
  await page.locator('#toolbar [data-a=pdf]').click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Continue' }).click();
  await expect.poll(() => page.evaluate(() => window.__printCalls)).toBe(1);
  await page.emulateMedia({ media: 'print' });
  const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
  fs.writeFileSync(path.join(outDir, 'collage.pdf'), pdf);
  const text = pdf.toString('latin1');
  expect((text.match(/\/Type\s*\/Page\b/g) ?? []).length).toBe(2);
  expect(text).toMatch(/\/MediaBox\s*\[\s*0 0 612 792\s*\]/);
  await page.emulateMedia({ media: 'screen' });

  expect(errors).toEqual([]);
});

test('iPhone HEIC photos get a clear message', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New collage' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Create collage' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#tray [data-a=add]').click();
  await (await chooser).setFiles([photo('iphone.heic')]);
  await expect(page.locator('.toast.error')).toContainText('HEIC');
});

test('changing layout keeps photos and reports extras', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New collage' }).click();
  await page.locator('dialog[open] [data-layout=grid-4]').click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Create collage' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#tray [data-a=add]').click();
  await (await chooser).setFiles(['photo1-landscape.jpg', 'photo2-portrait.jpg', 'photo3-square.jpg', 'photo4-wide.jpg'].map(photo));
  await expect.poll(async () => (await cells(page)).filter((c) => c.kind === 'photo').length).toBe(4);
  await page.getByRole('button', { name: 'Layout', exact: true }).click();
  await page.locator('dialog[open] [data-layout=two-stack]').click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Use this layout' }).click();
  await expect(page.locator('.toast')).toContainText("2 photos didn't fit");
  expect((await cells(page)).map((c) => c.kind)).toEqual(['photo', 'photo']);
});
