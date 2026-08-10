/* =========================================================================
 * Storage.
 *
 * Everything lives in IndexedDB on the device: photos are Blobs, so there
 * is no server, no upload and no account. Object URLs are cached and
 * revoked centrally, because a photo grid that mints a fresh URL per
 * render leaks memory quickly on a phone.
 * ====================================================================== */
(function (global) {
  'use strict';

  const Birdex = global.Birdex = global.Birdex || {};
  const DB_NAME = 'birdex';
  const DB_VERSION = 1;

  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('sightings')) {
          const s = db.createObjectStore('sightings', { keyPath: 'id' });
          s.createIndex('ts', 'ts');
          s.createIndex('speciesId', 'speciesId');
        }
        if (!db.objectStoreNames.contains('photos')) {
          const p = db.createObjectStore('photos', { keyPath: 'id' });
          p.createIndex('ts', 'ts');
          p.createIndex('sightingId', 'sightingId');
          p.createIndex('speciesId', 'speciesId');
        }
        if (!db.objectStoreNames.contains('collections')) {
          db.createObjectStore('collections', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }

  function tx(names, mode, fn) {
    return open().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(names, mode);
      let result;
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
      result = fn(names.map ? names.map(n => t.objectStore(n)) : t.objectStore(names), t);
    }));
  }

  function reqp(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  const store = Birdex.store = {};

  store.id = function (prefix) {
    /* Time-ordered so a plain sort by id is also a sort by creation. */
    return (prefix || 'x') + '_' + Date.now().toString(36) + '_' +
      Math.random().toString(36).slice(2, 8);
  };

  /* ---------------------------- sightings --------------------------- */

  store.putSighting = function (s) {
    return tx('sightings', 'readwrite', st => { st.put(s); }).then(() => s);
  };

  store.allSightings = function () {
    return open().then(db => new Promise((resolve, reject) => {
      const out = [];
      const req = db.transaction('sightings').objectStore('sightings').index('ts').openCursor(null, 'prev');
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return resolve(out);
        out.push(cur.value);
        cur.continue();
      };
      req.onerror = () => reject(req.error);
    }));
  };

  store.getSighting = function (id) {
    return open().then(db => reqp(db.transaction('sightings').objectStore('sightings').get(id)));
  };

  /** Deleting a sighting takes its photos with it, and cleans collections. */
  store.deleteSighting = function (id) {
    return store.photosForSighting(id).then(photos => {
      const photoIds = photos.map(p => p.id);
      return store.removePhotosFromCollections(photoIds)
        .then(() => tx(['sightings', 'photos'], 'readwrite', ([sg, ph]) => {
          sg.delete(id);
          photoIds.forEach(pid => { ph.delete(pid); Birdex.store.revoke(pid); });
        }))
        .then(() => store.getSetting('dexPhotos', {}))
        .then(map => {
          let changed = false;
          for (const k in map) if (photoIds.indexOf(map[k]) !== -1) { delete map[k]; changed = true; }
          return changed ? store.setSetting('dexPhotos', map) : null;
        });
    });
  };

  /* ------------------------------ photos ---------------------------- */

  store.putPhoto = function (p) {
    return tx('photos', 'readwrite', st => { st.put(p); }).then(() => p);
  };

  store.getPhoto = function (id) {
    return open().then(db => reqp(db.transaction('photos').objectStore('photos').get(id)));
  };

  store.photosForSighting = function (sightingId) {
    return byIndex('photos', 'sightingId', sightingId);
  };

  store.photosForSpecies = function (speciesId) {
    return byIndex('photos', 'speciesId', speciesId).then(list => list.sort((a, b) => b.ts - a.ts));
  };

  store.allPhotos = function () {
    return open().then(db => new Promise((resolve, reject) => {
      const out = [];
      const req = db.transaction('photos').objectStore('photos').index('ts').openCursor(null, 'prev');
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return resolve(out);
        out.push(cur.value);
        cur.continue();
      };
      req.onerror = () => reject(req.error);
    }));
  };

  store.deletePhoto = function (id) {
    return store.removePhotosFromCollections([id])
      .then(() => tx('photos', 'readwrite', st => { st.delete(id); }))
      .then(() => store.getSetting('dexPhotos', {}))
      .then(map => {
        let changed = false;
        for (const k in map) if (map[k] === id) { delete map[k]; changed = true; }
        return changed ? store.setSetting('dexPhotos', map) : null;
      })
      .then(() => store.revoke(id));
  };

  function byIndex(storeName, indexName, key) {
    return open().then(db => reqp(db.transaction(storeName).objectStore(storeName).index(indexName).getAll(key)));
  }

  /* --------------------------- collections -------------------------- */

  store.allCollections = function () {
    return open().then(db => reqp(db.transaction('collections').objectStore('collections').getAll()))
      .then(list => list.sort((a, b) => a.createdAt - b.createdAt));
  };

  store.putCollection = function (c) {
    return tx('collections', 'readwrite', st => { st.put(c); }).then(() => c);
  };

  store.getCollection = function (id) {
    return open().then(db => reqp(db.transaction('collections').objectStore('collections').get(id)));
  };

  store.deleteCollection = function (id) {
    return tx('collections', 'readwrite', st => { st.delete(id); });
  };

  /** Keep collections honest when the photos underneath them disappear. */
  store.removePhotosFromCollections = function (photoIds) {
    if (!photoIds.length) return Promise.resolve();
    return store.allCollections().then(cols => {
      const dirty = [];
      for (const c of cols) {
        const before = c.photoIds.length;
        c.photoIds = c.photoIds.filter(id => photoIds.indexOf(id) === -1);
        if (c.photoIds.length !== before) {
          if (photoIds.indexOf(c.cover) !== -1) c.cover = c.photoIds[0] || null;
          dirty.push(c);
        }
      }
      if (!dirty.length) return;
      return tx('collections', 'readwrite', st => { dirty.forEach(c => st.put(c)); });
    });
  };

  /* ----------------------------- settings --------------------------- */

  store.getSetting = function (key, fallback) {
    return open().then(db => reqp(db.transaction('settings').objectStore('settings').get(key)))
      .then(row => (row && row.value !== undefined) ? row.value : fallback);
  };

  store.setSetting = function (key, value) {
    return tx('settings', 'readwrite', st => { st.put({ key, value }); }).then(() => value);
  };

  /* --------------------------- object URLs -------------------------- */

  const urls = new Map();

  /** Stable object URL per photo id, so repeated renders reuse one URL. */
  store.url = function (photo, which) {
    const key = photo.id + ':' + (which || 'thumb');
    if (urls.has(key)) return urls.get(key);
    const blob = which === 'full' ? (photo.full || photo.thumb) : (photo.thumb || photo.full);
    const u = URL.createObjectURL(blob);
    urls.set(key, u);
    return u;
  };

  store.revoke = function (photoId) {
    for (const key of Array.from(urls.keys())) {
      if (key.indexOf(photoId + ':') === 0) {
        URL.revokeObjectURL(urls.get(key));
        urls.delete(key);
      }
    }
  };

  /* ------------------------------ admin ----------------------------- */

  store.estimate = function () {
    if (!navigator.storage || !navigator.storage.estimate) return Promise.resolve(null);
    return navigator.storage.estimate().catch(() => null);
  };

  store.wipe = function () {
    return tx(['sightings', 'photos', 'collections', 'settings'], 'readwrite', ([a, b, c, d]) => {
      a.clear(); b.clear(); c.clear(); d.clear();
    }).then(() => {
      urls.forEach(u => URL.revokeObjectURL(u));
      urls.clear();
    });
  };

  /** Metadata-only backup. Photos are deliberately left out — see the UI copy. */
  store.exportJSON = function () {
    return Promise.all([store.allSightings(), store.allCollections(), store.getSetting('dexPhotos', {})])
      .then(([sightings, collections, dexPhotos]) => JSON.stringify({
        app: 'birdex', version: 1, exportedAt: new Date().toISOString(),
        sightings, collections, dexPhotos
      }, null, 2));
  };

})(window);
