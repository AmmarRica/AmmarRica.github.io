/* =========================================================================
 * Tower of Chips service worker.
 *
 * ⚠️ HTML is network-first, everything else is cache-first, and "is this
 * HTML" is decided by URL/extension — NOT by `request.mode`. The update
 * check fetches index.html with `fetch()`, which is not a navigation and
 * sends `Accept: * / *`; classifying by mode alone would serve that fetch
 * from the precache forever and the game could never report a new version.
 * ====================================================================== */
const CACHE = 'tower-of-chips-v11';
const ASSETS = [
  './', './index.html', './manifest.json', './css/style.css',
  './icon.svg', './icon-192.png', './icon-512.png', './icon-maskable-512.png',
  './js/util.js', './js/data.js', './js/physics.js', './js/table.js',
  './js/render.js', './js/game.js', './js/ui.js', './js/demo.js',
];

/** HTML by path, so a same-origin fetch() of a page is treated as a page. */
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
    // Network first: a fresh page is how a new version ever gets noticed.
    // Falling back to cache offline is correct, not a failure — a reload
    // lands on the same copy, so a version found offline is installable.
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
