// Renders app/icons/icon.svg to the PNG sizes the PWA and Microsoft Store need.
// Usage: npm run icons   (uses the installed Chrome via Playwright)
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = fs.readFileSync(path.join(root, 'app/icons/icon.svg'), 'utf8');
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
const outputs = [
  { file: 'icon-192.png', size: 192, pad: 0 },
  { file: 'icon-512.png', size: 512, pad: 0 },
  // Maskable icons need their artwork inside the central 80% "safe zone".
  { file: 'maskable-512.png', size: 512, pad: 0.12, bg: '#0f6cbd' },
  { file: 'store-300.png', size: 300, pad: 0 },
];
for (const o of outputs) {
  await page.setViewportSize({ width: o.size, height: o.size });
  const inner = Math.round(o.size * (1 - o.pad * 2));
  await page.setContent(`<html><body style="margin:0;background:${o.bg ?? 'transparent'};display:grid;place-items:center;width:${o.size}px;height:${o.size}px">
    <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`);
  await page.screenshot({ path: path.join(root, 'app/icons', o.file), omitBackground: !o.bg });
  console.log('wrote', o.file);
}
await browser.close();
