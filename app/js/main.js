// @ts-check
// Entry point: builds the app, wires views, keyboard shortcuts, autosave, file launch
// handling and the service worker.

import { createApp } from './app.js';
import { createActions } from './actions.js';
import { createStage } from './interact/stage.js';
import { createToolbar } from './ui/toolbar.js';
import { createPagesStrip } from './ui/pages-strip.js';
import { createTray } from './ui/tray.js';
import { createInspector } from './ui/inspector.js';
import { createStart } from './ui/start.js';
import { typingInField, toast } from './ui/dom.js';
import { startAutosave, readSession, removeUnusedPhotos } from './io/autosave.js';
import { requestPersistence } from './io/db.js';

const app = createApp();
app.actions = createActions(app);
app.stage = createStage(app);
app.addView(app.stage);
app.addView(createToolbar(app));
app.addView(createPagesStrip(app));
app.addView(createTray(app));
app.addView(createInspector(app));
const start = createStart(app);
document.addEventListener('cs:show-editor', () => start.hide());

// Canvas text doesn't redraw by itself when a font finishes loading.
document.fonts.addEventListener('loadingdone', () => {
  app.requestRender();
  document.dispatchEvent(new Event('cs:assets-loaded'));
});

// Exposed for debugging and automated tests.
/** @type {any} */ (window).collage = app;

// ---------- keyboard ----------

document.addEventListener('keydown', (e) => {
  if (document.querySelector('dialog[open]') || document.querySelector('.menu')) return;
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  const a = app.actions;
  const onStart = !document.getElementById('start').hidden;

  if (mod && k === 'o') {
    e.preventDefault();
    a.openCollage();
    return;
  }
  if (onStart) return;
  if (mod && k === 's') {
    e.preventDefault();
    a.save({ saveAs: e.shiftKey });
    return;
  }
  if (typingInField()) return;
  if (mod && k === 'z') {
    e.preventDefault();
    if (e.shiftKey) a.redo();
    else a.undo();
  } else if (mod && k === 'y') {
    e.preventDefault();
    a.redo();
  } else if (mod && k === 'p') {
    e.preventDefault();
    a.print();
  } else if (mod && (k === '=' || k === '+')) {
    e.preventDefault();
    app.stage.setZoom(app.stage.zoom * 1.25);
  } else if (mod && k === '-') {
    e.preventDefault();
    app.stage.setZoom(app.stage.zoom / 1.25);
  } else if (mod && k === '0') {
    e.preventDefault();
    app.stage.setZoom(1, true);
  } else if (mod && (e.code === 'BracketRight' || e.code === 'BracketLeft') && app.selectedCell) {
    // Stacking order: Ctrl+] forward, Ctrl+[ backward; add Shift for all the way.
    e.preventDefault();
    const up = e.code === 'BracketRight';
    a.layer(app.selectedCell.id, up ? (e.shiftKey ? 'front' : 'forward') : (e.shiftKey ? 'back' : 'backward'));
  } else if (mod && k === 'd' && app.selectedBox) {
    e.preventDefault();
    a.duplicateBox(app.selectedBox.id);
  } else if (k === 'delete' || k === 'backspace') {
    if (app.ui.selection) {
      e.preventDefault();
      a.deleteSelection();
    }
  } else if (k === 'escape') {
    if (app.ui.mode === 'crop') a.exitCrop(false);
    else app.select(null);
  } else if (k === 'enter') {
    const cell = app.selectedCell, box = app.selectedBox;
    if (app.ui.mode === 'crop') a.exitCrop(true);
    else if (box) app.stage.startEditing({ kind: 'box', id: box.id });
    else if (cell?.content?.kind === 'photo') a.enterCrop(cell.id);
    else if (cell?.content?.kind === 'text') app.stage.startEditing({ kind: 'cell', id: cell.id });
    else if (cell) a.addPhotos(null, { cellId: cell.id, single: true });
    else return;
    e.preventDefault();
  } else if (k.startsWith('arrow') && app.selectedBox) {
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    app.stage.nudge(k === 'arrowleft' ? -step : k === 'arrowright' ? step : 0, k === 'arrowup' ? -step : k === 'arrowdown' ? step : 0);
  } else if (k.startsWith('arrow') && document.activeElement?.id === 'stage-canvas' && app.ui.mode === 'normal') {
    // Keyboard users move between slots with the arrow keys.
    e.preventDefault();
    const cells = app.page.cells;
    const i = app.selectedCell ? cells.indexOf(app.selectedCell) : -1;
    const dir = k === 'arrowright' || k === 'arrowdown' ? 1 : -1;
    app.select({ kind: 'cell', id: cells[(i + dir + cells.length) % cells.length].id });
  }
});

// Files dropped outside a drop target would otherwise open in the window.
addEventListener('dragover', (e) => {
  if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
});
addEventListener('drop', (e) => {
  if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
});

addEventListener('beforeunload', (e) => {
  if (app.store.isDirty() && document.getElementById('start').hidden) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// ---------- opening .collage files from File Explorer (installed app) ----------

const w = /** @type {any} */ (window);
let launchedWithFile = false;
if ('launchQueue' in w) {
  w.launchQueue.setConsumer(async (/** @type {any} */ params) => {
    const handle = params.files?.[0];
    if (!handle) return;
    launchedWithFile = true;
    try {
      await app.actions.openCollage({ file: await handle.getFile(), handle });
    } catch (e) {
      console.error(e);
    }
  });
}

// ---------- startup ----------

async function boot() {
  requestPersistence();
  const session = await readSession();
  const hasWork = !!session && session.dirty && (Object.keys(session.doc.photos).length > 0 || session.doc.pages.some((p) => p.textBoxes.length > 0));
  // Photos kept in the browser are only needed for the unsaved session (if any).
  await removeUnusedPhotos(new Set(session ? Object.keys(session.doc.photos) : []));
  startAutosave(app);
  if (!launchedWithFile) await start.show(hasWork ? session : null);
}
boot();

// ---------- service worker (offline + updates) ----------

const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname) && !new URLSearchParams(location.search).has('sw');
if ('serviceWorker' in navigator && !isLocal) {
  // Reload only when the user asked for the update, not when the first install takes control.
  let updateRequested = false;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const offer = (/** @type {ServiceWorker} */ worker) => {
      toast('A new version of Collage Studio is ready.', {
        action: 'Update now',
        onAction: () => {
          updateRequested = true;
          worker.postMessage('skip-waiting');
        },
      });
    };
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) offer(nw);
      });
    });
  });
  let reloading = false;
  // Unsaved work survives the reload: autosave writes on pagehide and is offered again.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !updateRequested) return;
    reloading = true;
    location.reload();
  });
}
