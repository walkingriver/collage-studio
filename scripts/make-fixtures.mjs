// Generates test photos in tests/fixtures (labeled, varied sizes/aspect ratios).
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'tests/fixtures');
const specs = [
  { name: 'photo1-landscape.jpg', w: 4032, h: 3024, hue: 200, label: '1 Landscape' },
  { name: 'photo2-portrait.jpg', w: 3024, h: 4032, hue: 20, label: '2 Portrait' },
  { name: 'photo3-square.jpg', w: 2400, h: 2400, hue: 120, label: '3 Square' },
  { name: 'photo4-wide.jpg', w: 3840, h: 2160, hue: 280, label: '4 Wide' },
  { name: 'photo5-small.jpg', w: 1200, h: 900, hue: 330, label: '5 Small' },
  { name: 'photo6-tall.jpg', w: 1800, h: 3200, hue: 50, label: '6 Tall' },
];
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
for (const s of specs) {
  const dataUrl = await page.evaluate(({ w, h, hue, label }) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, `hsl(${hue} 70% 65%)`);
    grad.addColorStop(1, `hsl(${(hue + 60) % 360} 60% 35%)`);
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 24; i++) {
      g.fillStyle = `hsla(${(hue + i * 13) % 360} 80% ${40 + (i % 5) * 10}% / 0.35)`;
      g.beginPath(); g.arc((i * 0.37 % 1) * w, (i * 0.61 % 1) * h, (0.05 + (i % 4) * 0.03) * Math.min(w, h), 0, 7); g.fill();
    }
    g.fillStyle = '#fff'; g.font = `bold ${Math.round(Math.min(w, h) * 0.12)}px sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(label, w / 2, h / 2);
    g.font = `bold ${Math.round(Math.min(w, h) * 0.06)}px sans-serif`;
    g.fillText('TOP', w / 2, h * 0.08);
    g.textAlign = 'left'; g.fillText('L', w * 0.03, h / 2);
    return c.toDataURL('image/jpeg', 0.9);
  }, s);
  fs.writeFileSync(path.join(out, s.name), Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('wrote', s.name);
}
await browser.close();

// A copy of photo 1 marked "rotate 90° clockwise" in EXIF, like a phone held upright.
const src = fs.readFileSync(path.join(out, 'photo1-landscape.jpg'));
const exif = Buffer.from([
  0xff, 0xe1, 0x00, 0x22, // APP1, length 34
  0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
  0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // TIFF big-endian, IFD at 8
  0x00, 0x01, // 1 entry
  0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06, 0x00, 0x00, // Orientation = 6
  0x00, 0x00, 0x00, 0x00, // no next IFD
]);
fs.writeFileSync(path.join(out, 'photo7-exif-rotated.jpg'), Buffer.concat([src.subarray(0, 2), exif, src.subarray(2)]));
console.log('wrote photo7-exif-rotated.jpg');
