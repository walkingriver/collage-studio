// @ts-check
// Proves app/ is a plain static folder: copy it under a sub-path, serve it with a generic
// static server (Python's), and check it boots, installs its service worker, and works offline.
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 5199;
const SUBPATH = 'family/collage-studio';

test('app/ works from any folder on any static server, and offline', async ({ page, context }) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'collage-deploy-'));
  fs.cpSync(path.resolve(import.meta.dirname, '../../app'), path.join(root, SUBPATH), { recursive: true });
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  try {
    const url = `http://127.0.0.1:${PORT}/${SUBPATH}/?sw=1`;
    await expect.poll(async () => (await fetch(url).catch(() => null))?.status, { timeout: 10_000 }).toBe(200);

    const failed = [];
    page.on('requestfailed', (r) => failed.push(r.url()));
    page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
    await page.goto(url);
    await expect(page.getByRole('button', { name: 'New collage' })).toBeVisible();

    // Service worker installs and precaches everything (sw=1 turns it on for local hosts).
    await page.evaluate(() => navigator.serviceWorker.ready);
    const cached = await page.evaluate(async () => (await caches.keys()).length);
    expect(cached).toBe(1);
    expect(failed).toEqual([]);

    // Offline: reload still opens the app, and a new collage renders with its fonts.
    await context.setOffline(true);
    await page.reload();
    await page.getByRole('button', { name: 'New collage' }).click();
    await page.locator('dialog[open] [data-layout=title-grid-4]').click();
    await page.locator('dialog[open]').getByRole('button', { name: 'Create collage' }).click();
    await expect(page.locator('#app')).toBeVisible();
    expect(await page.evaluate(() => document.fonts.load('400 20px "Playfair Display"').then((f) => f.length))).toBeGreaterThan(0);
    await context.setOffline(false);
  } finally {
    server.kill();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
