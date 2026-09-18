/* =========================================================================
 * Friends Map service worker.
 *
 * Exists mainly so the page is installable and can register as an Android
 * share target (share a place from Google Maps -> Friends Map). HTML is
 * network-first so new deploys show up; icon/manifest are cache-first.
 * Leaflet is vendored and cached; map tiles are left to the browser cache.
 * ====================================================================== */
const CACHE = 'friendsmap-v1';
const ASSETS = ['./', './index.html', './manifest.json', './icon.svg', './vendor/leaflet.js', './vendor/leaflet.css'];

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
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== 'GET') return;
  const p = url.pathname;
  const isHTML = p.endsWith('/') || p.endsWith('.html');
  if (isHTML) {
    e.respondWith(
      fetch(e.request).then((r) => { const c = r.clone(); caches.open(CACHE).then((k) => k.put('./index.html', c)); return r; })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
