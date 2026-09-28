// Service worker: keeps the whole app available offline.
// VERSION is replaced with the commit id by the deploy workflow, so each deploy is an update.
const VERSION = 'dev';
const CACHE = `collage-studio-${VERSION}`;

// Every file the app needs. tests/unit/sw.test.js checks this list against the files on disk.
const FILES = [
  './',
  'index.html',
  'support.html',
  'privacy.html',
  'manifest.webmanifest',
  'css/app.css',
  'css/fonts.css',
  'vendor/fflate.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'images/sample-collage.jpg',
  'js/main.js',
  'js/app.js',
  'js/actions.js',
  'js/store.js',
  'js/model.js',
  'js/layouts.js',
  'js/random-layout.js',
  'js/page-sizes.js',
  'js/shapes.js',
  'js/geometry.js',
  'js/text.js',
  'js/adjust.js',
  'js/filters-dom.js',
  'js/render.js',
  'js/images.js',
  'js/fonts.js',
  'js/font-catalog.js',
  'js/interact/stage.js',
  'js/io/db.js',
  'js/io/fs.js',
  'js/io/autosave.js',
  'js/io/project-file.js',
  'js/export/raster.js',
  'js/export/print.js',
  'js/ui/dom.js',
  'js/ui/icons.js',
  'js/ui/thumbs.js',
  'js/ui/dialogs.js',
  'js/ui/toolbar.js',
  'js/ui/pages-strip.js',
  'js/ui/tray.js',
  'js/ui/inspector.js',
  'js/ui/start.js',
  // FONTS (generated list below is checked by the test too)
  ...FONT_FILES(),
];

function FONT_FILES() {
  return [
    'open-sans', 'montserrat', 'lato', 'nunito', 'poppins', 'raleway', 'playfair-display', 'lora', 'merriweather', 'eb-garamond',
  ].flatMap((f) => ['400-normal', '400-italic', '700-normal', '700-italic'].map((v) => `fonts/${f}-latin-${v}.woff2`))
    .concat(['dancing-script', 'caveat', 'amatic-sc', 'fredoka'].flatMap((f) => ['400-normal', '700-normal'].map((v) => `fonts/${f}-latin-${v}.woff2`)))
    .concat(['great-vibes', 'pacifico', 'satisfy', 'parisienne', 'patrick-hand', 'indie-flower', 'bebas-neue', 'abril-fatface', 'lobster'].map((f) => `fonts/${f}-latin-400-normal.woff2`));
}

self.addEventListener('install', (event) => {
  // cache: 'reload' skips the browser's HTTP cache so one version never mixes with another.
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      return await fetch(req);
    } catch {
      // Offline and not cached: fall back to the app shell for page loads.
      if (req.mode === 'navigate') return (await cache.match('index.html')) ?? Response.error();
      return Response.error();
    }
  })());
});
