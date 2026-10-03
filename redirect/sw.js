// Collage Studio has moved to https://collagestudio.walkingriver.com/.
// This service worker replaces the real app's at the old address. Its only job is to
// retire itself: it clears every cache the old app left behind, sends any tab that's
// still open on the old address to the new one, then unregisters so this origin goes
// back to being a plain (non-PWA) redirect page for anyone who lands here later.
const DEST = 'https://collagestudio.walkingriver.com/';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) await caches.delete(key);
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const client of clients) client.navigate(DEST).catch(() => {});
    await self.registration.unregister();
  })());
});

// No fetch handler: this worker never intercepts requests, so nothing here can ever
// serve stale content. index.html / 404.html handle the redirect for plain navigations.
