// Tower of Chips service worker — offline play + installable.
const CACHE = 'tower-of-chips-v1';
const ASSETS = [
  './', './index.html', './manifest.json', './icon.svg', './css/style.css',
  './js/util.js', './js/data.js', './js/physics.js', './js/table.js',
  './js/render.js', './js/game.js', './js/ui.js', './js/demo.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).then((resp) => {
      const copy = resp.clone();
      caches.open(CACHE).then((c) => { try { c.put(e.request, copy); } catch (_) {} });
      return resp;
    }).catch(() => caches.match('./index.html')))
  );
});
