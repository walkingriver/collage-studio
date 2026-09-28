// @ts-check
// Dialogs: page size + layout chooser, export options, Save-as-PDF tip.

import { openDialog, esc } from './dom.js';
import { PAGE_PRESETS, pageSizeFromPreset, customPageSize, orient, orientationOf, describeSize, PT_PER_IN, PT_PER_CM } from '../page-sizes.js';
import { LAYOUTS, LAYOUT_GROUPS } from '../layouts.js';
import { drawLayoutThumb } from './thumbs.js';

/** @typedef {import('../page-sizes.js').PageSize} PageSize */

/**
 * Chooses a page size and/or a layout.
 * @param {{title: string, subtitle?: string, ok: string, size?: PageSize, layoutId?: string, showSize?: boolean, showLayout?: boolean,
 *   style?: {marginPt?: number, gapPt?: number}}} o
 * @returns {Promise<{pageSize: PageSize, layoutId: string}|null>}
 */
export function choosePageAndLayout(o) {
  const showSize = o.showSize ?? true, showLayout = o.showLayout ?? true;
  let size = o.size ?? pageSizeFromPreset('letter', 'portrait');
  /** @type {'portrait'|'landscape'} */
  let orientation = orientationOf(size);
  let presetId = size.presetId;
  let layoutId = o.layoutId ?? 'grid-4';
  let unit = /** @type {'in'|'cm'} */ ('in');
  const k = () => (unit === 'cm' ? PT_PER_CM : PT_PER_IN);

  const sizeTiles = [...PAGE_PRESETS, { id: 'custom', name: 'Custom size', wIn: 0, hIn: 0, group: 'Paper' }].map((p) => {
    const w = p.id === 'custom' ? 30 : Math.round((Math.min(p.wIn, p.hIn) / 17) * 44 + 8);
    const h = p.id === 'custom' ? 30 : Math.round((Math.max(p.wIn, p.hIn) / 17) * 44 + 8);
    const dims = p.id === 'custom' ? 'Any size' : `${fmt(Math.min(p.wIn, p.hIn))} × ${fmt(Math.max(p.wIn, p.hIn))} in`;
    return `<button type="button" class="size-tile" data-preset="${p.id}" aria-pressed="false">
      <span class="shape" style="width:${w}px;height:${h}px;${p.id === 'custom' ? 'border-style:dashed' : ''}"></span>
      <strong>${esc(p.name)}</strong><small>${dims}</small></button>`;
  }).join('');

  const body = `
    ${showSize ? `<h2>Page size</h2>
    <div class="size-grid">${sizeTiles}</div>
    <div class="row wrap" style="gap:16px">
      <div class="seg" role="group" aria-label="Orientation">
        <button type="button" data-orient="portrait">Portrait</button>
        <button type="button" data-orient="landscape">Landscape</button>
      </div>
      <div class="custom-size" data-custom hidden>
        <label>Width <input class="num-input" type="number" min="1" max="60" step="0.1" data-cw></label>
        <span>×</span>
        <label>Height <input class="num-input" type="number" min="1" max="60" step="0.1" data-ch></label>
        <select class="num-input" style="width:auto" data-unit><option value="in">inches</option><option value="cm">cm</option></select>
      </div>
      <span class="hint" data-size-desc></span>
    </div>` : ''}
    ${showLayout ? LAYOUT_GROUPS.map((g) => `<h2>${esc(g)}</h2><div class="layout-grid">${LAYOUTS.filter((l) => l.group === g).map((l) => `<button type="button" class="layout-tile" data-layout="${l.id}" aria-pressed="false" title="${esc(l.name)}"><canvas></canvas><span>${esc(l.name)}</span></button>`).join('')}</div>`).join('') : ''}`;

  return openDialog({
    title: o.title,
    subtitle: o.subtitle,
    wide: true,
    body,
    buttons: `<button type="button" class="btn" data-close="">Cancel</button><button type="button" class="btn primary" data-close="ok">${esc(o.ok)}</button>`,
    setup(root) {
      const cw = /** @type {HTMLInputElement} */ (root.querySelector('[data-cw]'));
      const ch = /** @type {HTMLInputElement} */ (root.querySelector('[data-ch]'));
      const unitSel = /** @type {HTMLSelectElement} */ (root.querySelector('[data-unit]'));

      let drawnFor = '';
      const refresh = () => {
        root.querySelectorAll('[data-preset]').forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('data-preset') === presetId)));
        root.querySelectorAll('[data-orient]').forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('data-orient') === orientation)));
        root.querySelectorAll('[data-layout]').forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('data-layout') === layoutId)));
        const custom = /** @type {HTMLElement|null} */ (root.querySelector('[data-custom]'));
        if (custom) custom.hidden = presetId !== 'custom';
        const desc = root.querySelector('[data-size-desc]');
        if (desc) desc.textContent = `${size.name} · ${describeSize(size)}`;
        // Layout previews only change with the page shape.
        const shapeKey = `${size.wPt}x${size.hPt}`;
        if (shapeKey !== drawnFor) {
          drawnFor = shapeKey;
          root.querySelectorAll('[data-layout]').forEach((b) => {
            drawLayoutThumb(/** @type {HTMLCanvasElement} */ (b.querySelector('canvas')), size, /** @type {string} */ (b.getAttribute('data-layout')), 84, o.style);
          });
        }
      };
      const setCustomInputs = () => {
        if (!cw) return;
        cw.value = fmt(size.wPt / k());
        ch.value = fmt(size.hPt / k());
      };

      root.addEventListener('click', (e) => {
        const t = /** @type {HTMLElement} */ (e.target);
        const preset = t.closest('[data-preset]')?.getAttribute('data-preset');
        if (preset) {
          presetId = preset;
          if (preset !== 'custom') size = pageSizeFromPreset(preset, orientation);
          else {
            size = { ...size, presetId: 'custom', name: 'Custom' };
            setCustomInputs();
          }
          refresh();
        }
        const or = /** @type {'portrait'|'landscape'|undefined} */ (/** @type {unknown} */ (t.closest('[data-orient]')?.getAttribute('data-orient')));
        if (or) {
          orientation = or;
          size = orient(size, or);
          setCustomInputs();
          refresh();
        }
        const lay = t.closest('[data-layout]')?.getAttribute('data-layout');
        if (lay) {
          layoutId = lay;
          refresh();
        }
      });
      root.addEventListener('dblclick', (e) => {
        if (/** @type {HTMLElement} */ (e.target).closest('[data-layout]')) /** @type {HTMLElement} */ (root.querySelector('[data-close=ok]')).click();
      });
      const onCustom = () => {
        const w = Math.min(60, Math.max(1, Number(cw.value) || 1)), h = Math.min(60, Math.max(1, Number(ch.value) || 1));
        size = customPageSize(w, h, unit);
        orientation = orientationOf(size);
        refresh();
      };
      cw?.addEventListener('change', onCustom);
      ch?.addEventListener('change', onCustom);
      unitSel?.addEventListener('change', () => {
        unit = /** @type {'in'|'cm'} */ (unitSel.value);
        setCustomInputs();
      });
      setCustomInputs();
      refresh();
      /** @type {HTMLElement|null} */ (root.querySelector(`[data-layout="${layoutId}"]`))?.scrollIntoView({ block: 'nearest' });
    },
  }).then((r) => (r === 'ok' ? { pageSize: size, layoutId } : null));
}

/**
 * @param {number} pageCount
 * @returns {Promise<{pages: 'current'|'all', dpi: number}|null>}
 */
export function chooseJpegOptions(pageCount) {
  let result = { pages: /** @type {'current'|'all'} */ ('current'), dpi: 300 };
  return openDialog({
    title: 'Save as JPEG',
    subtitle: 'Each page becomes one JPEG picture.',
    body: `
      ${pageCount > 1 ? `<h2>Pages</h2><div class="radio-row">
        <label class="choice"><input type="radio" name="pages" value="current" checked><span><strong>This page</strong></span></label>
        <label class="choice"><input type="radio" name="pages" value="all"><span><strong>All ${pageCount} pages</strong><small>You'll pick a folder</small></span></label>
      </div>` : ''}
      <h2>Quality</h2>
      <div class="radio-row">
        <label class="choice"><input type="radio" name="dpi" value="300" checked><span><strong>Best, for printing</strong><br><small>300 DPI</small></span></label>
        <label class="choice"><input type="radio" name="dpi" value="150"><span><strong>Smaller, for email</strong><br><small>150 DPI</small></span></label>
      </div>`,
    buttons: `<button type="button" class="btn" data-close="">Cancel</button><button type="button" class="btn primary" data-close="ok">Save JPEG</button>`,
    setup(root) {
      root.addEventListener('change', () => {
        const pages = /** @type {HTMLInputElement|null} */ (root.querySelector('input[name=pages]:checked'))?.value;
        const dpi = /** @type {HTMLInputElement} */ (root.querySelector('input[name=dpi]:checked')).value;
        result = { pages: pages === 'all' ? 'all' : 'current', dpi: Number(dpi) };
      });
    },
  }).then((r) => (r === 'ok' ? result : null));
}

/** Explains how to save a PDF from the print window. @returns {Promise<boolean>} */
export function pdfTip() {
  return openDialog({
    title: 'Save as PDF',
    body: `<p style="margin:0">The print window will open. To save a PDF:</p>
      <ol style="margin:0;padding-left:20px;line-height:1.8">
        <li>Set <strong>Printer</strong> (or <strong>Destination</strong>) to <strong>Save as PDF</strong>.</li>
        <li>Click <strong>Save</strong> and choose where to put the file.</li>
      </ol>
      <p class="hint">Pick “Save as PDF”, not “Microsoft Print to PDF”. It keeps your exact page size.</p>
      <label class="row" style="gap:6px"><input type="checkbox" data-skip> Don't show this again</label>`,
    buttons: `<button type="button" class="btn" data-close="">Cancel</button><button type="button" class="btn primary" data-close="ok">Continue</button>`,
    setup(root) {
      root.querySelector('[data-skip]')?.addEventListener('change', (e) => {
        try {
          localStorage.setItem('pdf-tip-skip', /** @type {HTMLInputElement} */ (e.target).checked ? '1' : '');
        } catch { /* private mode */ }
      });
    },
  }).then((r) => r === 'ok');
}

/** @param {number} n */
function fmt(n) {
  return String(Math.round(n * 100) / 100);
}
