'use strict';
// Keeps the installed game playable without a connection. The game's own files always come fresh from the network
// when there is one (so an update shows up at once), and from the last copy kept here when there isn't; the 3D engine
// and fonts from the CDNs never change at their pinned versions, so they're kept the first time they load.
const CACHE = 'graveyard-shift-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const pinned = /(^|\.)(cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(url.hostname);
  if (url.origin === location.origin) {
    // (asked of the server every time, not taken from the browser's own cache: the host keeps files for ten minutes,
    // and a reload in that time would otherwise run the old game, or a mix of old and new files)
    e.respondWith(fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' })).then((res) => { if (res.ok) { const c = res.clone(); caches.open(CACHE).then((ca) => ca.put(req, c)); } return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./'))));
  } else if (pinned) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { if (res.ok || res.type === 'opaque') { const c = res.clone(); caches.open(CACHE).then((ca) => ca.put(req, c)); } return res; })));
  }
});
