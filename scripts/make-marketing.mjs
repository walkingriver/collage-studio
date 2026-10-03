// Makes the link-preview image (Open Graph / X card, 1200×630) and the start-screen
// sample collage, using the app's own renderer and drawn sample "photos".
// Usage: node scripts/make-marketing.mjs
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'app/images');
fs.mkdirSync(out, { recursive: true });
const PORT = 5188;
const server = spawn('node', [path.join(root, 'scripts/serve.mjs'), String(PORT)], { stdio: 'ignore' });

try {
  await new Promise((r) => setTimeout(r, 600));
  const browser = await chromium.launch({ channel: 'chrome' });
  const page = await browser.newPage();
  await page.goto(`http://localhost:${PORT}/`);
  const images = await page.evaluate(async () => {
    const { renderPage } = await import('./js/render.js');
    await Promise.all(['700 80px "Montserrat"', '600 30px "Montserrat"', '400 30px "Lato"', '700 30px "Lato"'].map((f) => document.fonts.load(f)));

    // ---------- drawn sample photos ----------
    const scene = (w, h, draw) => {
      const c = new OffscreenCanvas(w, h);
      draw(c.getContext('2d'), w, h);
      return c.transferToImageBitmap();
    };
    const lin = (g, y0, y1, stops) => {
      const gr = g.createLinearGradient(0, y0, 0, y1);
      stops.forEach((s, i) => gr.addColorStop(i / (stops.length - 1), s));
      return gr;
    };
    const poly = (g, pts, fill) => {
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
      g.fillStyle = fill;
      g.fill();
    };
    const sunset = scene(1200, 900, (g, w, h) => {
      g.fillStyle = lin(g, 0, h * 0.62, ['#5b4b8a', '#ff6f91', '#ffb86b']);
      g.fillRect(0, 0, w, h * 0.62);
      g.save();
      g.shadowColor = 'rgba(255,230,160,0.9)';
      g.shadowBlur = 80;
      g.fillStyle = '#fff2c2';
      g.beginPath(); g.arc(w * 0.5, h * 0.56, h * 0.12, 0, 7); g.fill();
      g.restore();
      g.fillStyle = lin(g, h * 0.6, h, ['#3d5a80', '#1d2d44']);
      g.fillRect(0, h * 0.6, w, h * 0.4);
      poly(g, [[0, h * 0.62], [w * 0.18, h * 0.56], [w * 0.3, h * 0.6], [w * 0.36, h * 0.62]], '#2b2d42');
      g.fillStyle = 'rgba(255,214,150,0.55)';
      for (let i = 0; i < 9; i++) {
        const y = h * (0.64 + i * 0.035), half = w * (0.12 - i * 0.01);
        g.fillRect(w * 0.5 - half, y, half * 2, h * 0.008);
      }
    });
    const mountains = scene(1200, 900, (g, w, h) => {
      g.fillStyle = lin(g, 0, h * 0.6, ['#6fb3f2', '#dff1ff']);
      g.fillRect(0, 0, w, h);
      poly(g, [[0, h * 0.6], [w * 0.2, h * 0.3], [w * 0.38, h * 0.52], [w * 0.55, h * 0.22], [w * 0.78, h * 0.5], [w * 0.92, h * 0.35], [w, h * 0.45], [w, h * 0.65], [0, h * 0.65]], '#8a98c9');
      poly(g, [[w * 0.55, h * 0.22], [w * 0.61, h * 0.3], [w * 0.58, h * 0.29], [w * 0.53, h * 0.31], [w * 0.5, h * 0.29]], '#ffffff');
      poly(g, [[w * 0.2, h * 0.3], [w * 0.25, h * 0.37], [w * 0.21, h * 0.36], [w * 0.16, h * 0.36]], '#ffffff');
      poly(g, [[0, h * 0.7], [w * 0.25, h * 0.48], [w * 0.45, h * 0.66], [w * 0.7, h * 0.5], [w, h * 0.68], [w, h * 0.75], [0, h * 0.75]], '#4f5f96');
      g.fillStyle = lin(g, h * 0.74, h, ['#4a90c2', '#2c5f8a']);
      g.fillRect(0, h * 0.74, w, h * 0.26);
      g.fillStyle = '#244d3d';
      for (let i = 0; i < 14; i++) {
        const x = (i / 13) * w, s = h * (0.05 + (i % 3) * 0.015);
        poly(g, [[x, h * 0.74 - s * 2.2], [x + s * 0.6, h * 0.745], [x - s * 0.6, h * 0.745]], '#2e5a45');
      }
    });
    const beach = scene(1200, 900, (g, w, h) => {
      g.fillStyle = lin(g, 0, h * 0.45, ['#7fd6f7', '#e6f9ff']);
      g.fillRect(0, 0, w, h * 0.45);
      g.fillStyle = '#fff7c9';
      g.beginPath(); g.arc(w * 0.82, h * 0.15, h * 0.07, 0, 7); g.fill();
      g.fillStyle = lin(g, h * 0.45, h * 0.62, ['#19b3c7', '#0b8fa6']);
      g.fillRect(0, h * 0.45, w, h * 0.17);
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.beginPath();
      for (let x = 0; x <= w; x += 40) g.lineTo(x, h * 0.62 + Math.sin(x / 50) * 8);
      g.lineTo(w, h * 0.66); g.lineTo(0, h * 0.66); g.fill();
      g.fillStyle = lin(g, h * 0.63, h, ['#f7e1b5', '#e8c88f']);
      g.fillRect(0, h * 0.64, w, h * 0.36);
      // umbrella
      g.strokeStyle = '#6b4f3a'; g.lineWidth = 10;
      g.beginPath(); g.moveTo(w * 0.35, h * 0.9); g.lineTo(w * 0.38, h * 0.52); g.stroke();
      const cx = w * 0.38, cy = h * 0.53, r = w * 0.17;
      for (let i = 0; i < 6; i++) {
        g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, r, Math.PI + (i * Math.PI) / 6, Math.PI + ((i + 1) * Math.PI) / 6); g.closePath();
        g.fillStyle = i % 2 ? '#ffffff' : '#e5484d'; g.fill();
      }
      // towel
      g.save(); g.translate(w * 0.64, h * 0.82); g.rotate(-0.12);
      ['#ffd166', '#118ab2', '#ffd166', '#118ab2'].forEach((c, i) => { g.fillStyle = c; g.fillRect(-w * 0.12, -h * 0.05 + i * h * 0.025, w * 0.24, h * 0.025); });
      g.restore();
    });
    const balloons = scene(900, 1200, (g, w, h) => {
      g.fillStyle = lin(g, 0, h, ['#4fb3ff', '#dff3ff']);
      g.fillRect(0, 0, w, h);
      const cloud = (x, y, s) => {
        g.fillStyle = 'rgba(255,255,255,0.9)';
        [[0, 0, 1], [0.9, 0.1, 0.8], [-0.9, 0.15, 0.7], [0.4, -0.4, 0.75]].forEach(([dx, dy, k]) => { g.beginPath(); g.arc(x + dx * s, y + dy * s, s * k, 0, 7); g.fill(); });
      };
      cloud(w * 0.25, h * 0.2, 40); cloud(w * 0.75, h * 0.62, 55); cloud(w * 0.2, h * 0.85, 45);
      const balloon = (x, y, r, colors) => {
        g.save();
        g.beginPath(); g.arc(x, y, r, Math.PI * 0.85, Math.PI * 2.15); g.lineTo(x + r * 0.28, y + r * 1.35); g.lineTo(x - r * 0.28, y + r * 1.35); g.closePath();
        g.clip();
        colors.forEach((c, i) => { g.fillStyle = c; g.fillRect(x - r + (i * 2 * r) / colors.length, y - r, (2 * r) / colors.length + 1, r * 2.5); });
        g.restore();
        g.strokeStyle = '#5b4636'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(x - r * 0.28, y + r * 1.35); g.lineTo(x - r * 0.16, y + r * 1.62); g.moveTo(x + r * 0.28, y + r * 1.35); g.lineTo(x + r * 0.16, y + r * 1.62); g.stroke();
        g.fillStyle = '#8a5a3b'; g.fillRect(x - r * 0.18, y + r * 1.6, r * 0.36, r * 0.24);
      };
      balloon(w * 0.36, h * 0.32, w * 0.2, ['#e5484d', '#ffd166', '#e5484d', '#ffd166']);
      balloon(w * 0.72, h * 0.22, w * 0.11, ['#06d6a0', '#118ab2', '#06d6a0']);
      balloon(w * 0.66, h * 0.72, w * 0.14, ['#9b5de5', '#f15bb5', '#fee440', '#f15bb5']);
    });
    const flowers = scene(1200, 900, (g, w, h) => {
      g.fillStyle = lin(g, 0, h * 0.45, ['#a8dcff', '#eef9ff']);
      g.fillRect(0, 0, w, h * 0.5);
      g.fillStyle = lin(g, h * 0.35, h, ['#8fd46f', '#3c8f43']);
      g.beginPath(); g.moveTo(0, h * 0.45); g.quadraticCurveTo(w * 0.5, h * 0.3, w, h * 0.48); g.lineTo(w, h); g.lineTo(0, h); g.fill();
      const colors = ['#ff5d8f', '#ffd166', '#ffffff', '#c77dff', '#ff8c42'];
      let seed = 7;
      const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
      for (let i = 0; i < 90; i++) {
        const y = h * (0.5 + Math.pow(rnd(), 0.8) * 0.48), x = rnd() * w, s = 6 + ((y - h * 0.5) / (h * 0.5)) * 26;
        g.fillStyle = colors[i % colors.length];
        for (let p = 0; p < 5; p++) { const a = (p / 5) * Math.PI * 2; g.beginPath(); g.arc(x + Math.cos(a) * s * 0.6, y + Math.sin(a) * s * 0.6, s * 0.5, 0, 7); g.fill(); }
        g.fillStyle = '#ffb703'; g.beginPath(); g.arc(x, y, s * 0.35, 0, 7); g.fill();
      }
    });
    const art = { sunset, mountains, beach, balloons, flowers };

    // ---------- collage with the app renderer ----------
    const photos = Object.fromEntries(Object.entries(art).map(([id, b]) => [id, { id, name: id, type: 'image/jpeg', w: b.width, h: b.height }]));
    const prints = (specs) => specs.map(([id, x, y, w, h, rot]) => ({
      id, rect: { x, y, w, h }, shape: 'rect', rotation: rot,
      content: { kind: 'photo', photoId: id, fit: 'fill', zoom: 1, cx: 0.5, cy: 0.5, rotate: 0, flipH: false, adjust: { brightness: 0, contrast: 0, saturation: 0, warmth: 0, preset: 'none' } },
    }));
    const draw = (W, H, background, cells, extra) => {
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d');
      const bg = g.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, '#e8f2fc'); bg.addColorStop(1, '#fdeee2');
      const pg = { id: 'p', layoutId: 'x', marginPt: 0, gapPt: 0, overlap: true, background: /** @type {any} */ (bg),
        frame: { borderPt: Math.round(W / 110), borderColor: '#ffffff', radiusPt: 0, shadow: true }, cells, textBoxes: [] };
      const doc = { schemaVersion: 1, title: '', pageSize: { presetId: 'custom', name: '', wPt: W, hPt: H }, pages: [pg], photos };
      extra?.before?.(g);
      renderPage(g, doc, pg, { pxPerPt: 1.6, mode: 'export', getImage: (cell) => ({ img: art[cell.content.photoId], prefiltered: true }) });
      extra?.after?.(g);
      return c;
    };

    // Link preview: words on the left, prints on the right.
    const icon = await createImageBitmap(await (await fetch('icons/icon-512.png')).blob());
    const og = draw(1200, 630, null, prints([
      ['mountains', 0.66, 0.05, 0.3, 0.42, 5],
      ['sunset', 0.46, 0.07, 0.3, 0.42, -6],
      ['balloons', 0.8, 0.4, 0.17, 0.46, 4],
      ['beach', 0.5, 0.5, 0.3, 0.42, 3],
      ['flowers', 0.64, 0.31, 0.26, 0.37, -2],
    ]), {
      after(g) {
        g.drawImage(icon, 72, 92, 104, 104);
        g.fillStyle = '#1b1b1b';
        g.font = '700 84px "Montserrat"';
        g.fillText('Collage', 66, 300);
        g.fillText('Studio', 66, 386);
        g.fillStyle = '#3d3d3d';
        g.font = '400 32px "Lato"';
        g.fillText('Photo collages in minutes.', 70, 450);
        g.fillStyle = '#0f6cbd';
        g.font = '700 26px "Lato"';
        g.fillText('Free  ·  No sign-up  ·  Private', 70, 500);
        g.fillStyle = '#6b6b6b';
        g.font = '400 22px "Lato"';
        g.fillText('collagestudio.walkingriver.com', 70, 575);
      },
    });

    // Start-screen sample: just the prints.
    const hero = draw(960, 680, null, prints([
      ['mountains', 0.52, 0.04, 0.44, 0.44, 5],
      ['sunset', 0.04, 0.06, 0.46, 0.46, -6],
      ['balloons', 0.73, 0.44, 0.24, 0.52, 4],
      ['beach', 0.06, 0.5, 0.44, 0.45, 3],
      ['flowers', 0.34, 0.3, 0.4, 0.42, -2],
    ]));
    return { og: og.toDataURL('image/jpeg', 0.88), hero: hero.toDataURL('image/jpeg', 0.85) };
  });
  for (const [name, dataUrl] of [['og-image.jpg', images.og], ['sample-collage.jpg', images.hero]]) {
    fs.writeFileSync(path.join(out, name), Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log('wrote app/images/' + name, Math.round(fs.statSync(path.join(out, name)).size / 1024) + ' KB');
  }
  await browser.close();
} finally {
  server.kill();
}
