/* =========================================================================
 * Birdex service worker.
 *
 * HTML is network-first so a new deploy is noticed on the next online
 * visit; everything else is cache-first, which is what makes the dex and
 * its 130 entries usable in a field with no signal. "Is this HTML" is
 * decided by path, not request.mode, so a plain fetch() of the page is
 * still treated as a page.
 *
 * Photos never touch this cache — they live in IndexedDB.
 * ====================================================================== */
const CACHE = 'birdex-v3';
const ASSETS = [
  './', './index.html', './manifest.json', './css/style.css',
  './icon.svg', './icon-maskable.svg',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png',
  './js/core.js',
  './js/species-songbirds.js', './js/species-migrants.js',
  './js/species-water-raptors.js', './js/species-world.js',
  './js/species-na-waterfowl.js', './js/species-na-shorebirds.js',
  './js/species-na-raptors.js', './js/species-na-woodland.js',
  './js/species-na-songbirds.js',
  './js/art.js', './js/store.js', './js/photos.js', './js/views.js', './js/app.js'
];

function isHTML(url) {
  const p = new URL(url).pathname;
  return p.endsWith('/') || p.endsWith('.html');
}

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

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  if (isHTML(req.url)) {
    e.respondWith(
      fetch(req).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => { try { c.put(req, copy); } catch (_) {} });
        return resp;
      }).catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((resp) => {
      const copy = resp.clone();
      caches.open(CACHE).then((c) => { try { c.put(req, copy); } catch (_) {} });
      return resp;
    }))
  );
});
