/* =========================================================================
 * App state, routing and actions.
 *
 * Views are pure-ish render functions in views.js; everything that touches
 * state, storage or the device lives here.
 * ====================================================================== */
(function (global) {
  'use strict';

  const Birdex = global.Birdex = global.Birdex || {};
  const App = Birdex.app = {};

  const state = App.state = {
    ready: false,
    sightings: [],
    photos: [],
    collections: [],
    dexPhotos: {},          // speciesId -> photoId chosen as the dex portrait
    bySpecies: {},          // speciesId -> { count, first, last, photoIds }
    geo: null,              // { lat, lng, acc, ts }
    regionCode: null,
    regionExact: true,
    manualRegion: null,     // user override, wins over GPS
    geoStatus: 'idle',      // idle | locating | ok | denied | unavailable | outside
    geoError: null,
    month: new Date().getMonth() + 1,
    route: { name: 'dex', params: {} },
    dexQuery: '',
    dexFilter: 'all',
    nearbyFilter: 'all',
    pending: { photos: [], speciesId: null, notes: '', count: 1, ts: null, query: '' },
    sheet: null,
    storage: undefined,     // undefined = not asked yet, null = asking
    toast: null,
    demo: false
  };

  function freshPending() {
    return { photos: [], speciesId: null, notes: '', count: 1, ts: null, query: '' };
  }

  /* ------------------------------------------------------------------ */
  /* Derived data                                                        */
  /* ------------------------------------------------------------------ */

  function recompute() {
    const by = {};
    for (const s of state.sightings) {
      const e = by[s.speciesId] || (by[s.speciesId] = { count: 0, first: s.ts, last: s.ts, photoIds: [], regions: {} });
      e.count++;
      e.first = Math.min(e.first, s.ts);
      e.last = Math.max(e.last, s.ts);
      if (s.region) e.regions[s.region] = (e.regions[s.region] || 0) + 1;
    }
    for (const p of state.photos) {
      const e = by[p.speciesId];
      if (e) e.photoIds.push(p.id);
    }
    state.bySpecies = by;
  }

  App.seen = function (id) { return !!state.bySpecies[id]; };
  App.record = function (id) { return state.bySpecies[id] || null; };

  App.points = function () {
    let pts = 0;
    for (const id in state.bySpecies) {
      const sp = Birdex.get(id);
      if (sp) pts += sp.points;
    }
    return pts;
  };

  App.stats = function () {
    const speciesCount = Object.keys(state.bySpecies).length;
    const regions = {};
    const months = {};
    const families = {};
    for (const s of state.sightings) {
      if (s.region) regions[s.region] = true;
      months[new Date(s.ts).getMonth()] = true;
      const sp = Birdex.get(s.speciesId);
      if (sp) families[sp.fam] = (families[sp.fam] || 0) + 1;
    }
    return {
      species: speciesCount,
      sightings: state.sightings.length,
      photos: state.photos.length,
      points: App.points(),
      regions: Object.keys(regions).length,
      months: Object.keys(months).length,
      families,
      pctComplete: Math.round(speciesCount / Birdex.count() * 1000) / 10
    };
  };

  /** Photos of one species, newest first. */
  App.photosFor = function (speciesId) {
    return state.photos.filter(p => p.speciesId === speciesId).sort((a, b) => b.ts - a.ts);
  };

  App.photo = function (id) { return state.photos.find(p => p.id === id) || null; };

  /** The image that represents a species: your pick, else your latest shot. */
  App.dexPhoto = function (speciesId) {
    const chosen = state.dexPhotos[speciesId];
    if (chosen) {
      const p = App.photo(chosen);
      if (p) return p;
    }
    return App.photosFor(speciesId)[0] || null;
  };

  /* ------------------------------------------------------------------ */
  /* Badges                                                              */
  /* ------------------------------------------------------------------ */

  const BADGES = App.badges = [
    { id: 'first', name: 'First Light', desc: 'Log your first sighting.', test: s => s.sightings >= 1 },
    { id: 'ten', name: 'Ten Down', desc: 'Find 10 species.', test: s => s.species >= 10 },
    { id: 'fifty', name: 'Half Century', desc: 'Find 50 species.', test: s => s.species >= 50 },
    { id: 'century', name: 'Century', desc: 'Find 100 species.', test: s => s.species >= 100 },
    { id: 'shutter', name: 'Shutterbug', desc: 'Store 25 photos.', test: s => s.photos >= 25 },
    { id: 'roamer', name: 'Roamer', desc: 'Log sightings in 3 regions.', test: s => s.regions >= 3 },
    { id: 'allyear', name: 'All Year', desc: 'Log sightings in 6 different months.', test: s => s.months >= 6 },
    { id: 'night', name: 'Night Shift', desc: 'Find an owl.', test: (s, ctx) => ctx.family('Owls') || ctx.family('Barn Owls') },
    { id: 'talons', name: 'Talons', desc: 'Find 5 hawks, eagles or falcons.',
      test: (s, ctx) => ctx.familyCount('Hawks & Eagles') + ctx.familyCount('Falcons') + ctx.familyCount('Osprey') >= 5 },
    { id: 'waders', name: 'Waterline', desc: 'Find 8 waterbirds.',
      test: (s, ctx) => ['Ducks & Geese', 'Herons & Egrets', 'Sandpipers', 'Gulls & Terns', 'Rails & Coots',
        'Grebes', 'Loons', 'Pelicans', 'Cormorants', 'Cranes'].reduce((n, f) => n + ctx.familyCount(f), 0) >= 8 },
    { id: 'rare', name: 'Rare Find', desc: 'Find a species rated Rare or better.',
      test: (s, ctx) => ctx.anySpecies(sp => sp.globalTier.pts >= 180) },
    { id: 'curator', name: 'Curator', desc: 'Build a collection of 5 photos.',
      test: () => state.collections.some(c => c.photoIds.length >= 5) }
  ];

  App.earnedBadges = function () {
    const s = App.stats();
    const seenSpecies = Object.keys(state.bySpecies).map(id => Birdex.get(id)).filter(Boolean);
    const ctx = {
      family: fam => seenSpecies.some(sp => sp.fam === fam),
      familyCount: fam => seenSpecies.filter(sp => sp.fam === fam).length,
      anySpecies: fn => seenSpecies.some(fn)
    };
    return BADGES.map(b => ({ badge: b, earned: !!b.test(s, ctx) }));
  };

  /* ------------------------------------------------------------------ */
  /* Location                                                            */
  /* ------------------------------------------------------------------ */

  App.regionCode = function () {
    return state.manualRegion || state.regionCode;
  };

  App.regionLabel = function () {
    const code = App.regionCode();
    const r = code && Birdex.region(code);
    return r ? r.name : 'Location not set';
  };

  App.locate = function (opts) {
    opts = opts || {};
    if (!navigator.geolocation) {
      state.geoStatus = 'unavailable';
      state.geoError = 'This device has no location support.';
      return Promise.resolve(null);
    }
    state.geoStatus = 'locating';
    App.render();

    return new Promise(resolve => {
      navigator.geolocation.getCurrentPosition(pos => {
        App.setPosition(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
        resolve(state.geo);
      }, err => {
        state.geoStatus = err.code === 1 ? 'denied' : 'unavailable';
        state.geoError = err.code === 1
          ? 'Location permission was declined. You can pick a region by hand instead.'
          : 'Could not get a fix. You can pick a region by hand instead.';
        App.render();
        resolve(null);
      }, { enableHighAccuracy: !!opts.precise, timeout: 12000, maximumAge: opts.fresh ? 0 : 300000 });
    });
  };

  App.setPosition = function (lat, lng, acc) {
    state.geo = { lat, lng, acc: acc || null, ts: Date.now() };
    const hit = Birdex.regionAt(lat, lng);
    if (hit.region) {
      state.regionCode = hit.region.code;
      state.regionExact = hit.exact;
      state.geoStatus = 'ok';
      state.geoError = null;
    } else {
      state.regionCode = null;
      state.geoStatus = 'outside';
      state.geoError = 'You are outside the regions this dex has abundance data for' +
        (hit.nearest ? ' (nearest is ' + hit.nearest.name + ', about ' + hit.km + ' km away).' : '.');
    }
    Birdex.store.setSetting('lastGeo', state.geo);
    App.render();
    return state.geo;
  };

  App.setManualRegion = function (code) {
    state.manualRegion = code || null;
    Birdex.store.setSetting('manualRegion', state.manualRegion);
    App.render();
  };

  /* ------------------------------------------------------------------ */
  /* Actions                                                             */
  /* ------------------------------------------------------------------ */

  App.toast = function (msg, kind) {
    state.toast = { msg, kind: kind || 'info', id: Date.now() };
    App.render();
    clearTimeout(App._toastTimer);
    App._toastTimer = setTimeout(() => {
      state.toast = null;
      App.render();
    }, 3200);
  };

  /**
   * Commit the pending sighting: a sighting row, its photos, and a note of
   * whether this was a lifer (which is the whole reason a dex is fun).
   */
  App.saveSighting = function () {
    const p = state.pending;
    if (!p.speciesId) {
      App.toast('Pick which bird this was first.', 'warn');
      return Promise.resolve(null);
    }
    const sp = Birdex.get(p.speciesId);
    const lifer = !App.seen(p.speciesId);
    const ts = p.ts || Date.now();
    const code = App.regionCode();

    const sighting = {
      id: Birdex.store.id('sg'),
      speciesId: p.speciesId,
      ts,
      lat: state.geo ? state.geo.lat : null,
      lng: state.geo ? state.geo.lng : null,
      acc: state.geo ? state.geo.acc : null,
      region: code || null,
      manualRegion: !!state.manualRegion,
      notes: (p.notes || '').trim(),
      count: Math.max(1, parseInt(p.count, 10) || 1),
      photoIds: []
    };

    /* Photos were decoded and re-encoded when they were picked; all that is
     * left is to attach them to the sighting that now exists. */
    const saves = p.photos.map(pending => {
      const photo = {
        id: Birdex.store.id('ph'),
        sightingId: sighting.id,
        speciesId: sighting.speciesId,
        ts,
        full: pending.full, thumb: pending.thumb, w: pending.w, h: pending.h,
        bytes: pending.full.size + pending.thumb.size
      };
      sighting.photoIds.push(photo.id);
      return Birdex.store.putPhoto(photo).then(() => photo);
    });

    return Promise.all(saves)
      .then(saved => Birdex.store.putSighting(sighting).then(() => saved))
      .then(saved => {
        state.sightings.unshift(sighting);
        state.sightings.sort((a, b) => b.ts - a.ts);
        saved.forEach(ph => state.photos.unshift(ph));
        recompute();
        p.photos.forEach(ph => { if (ph.url) URL.revokeObjectURL(ph.url); });
        state.pending = freshPending();
        App.go('#/species/' + sighting.speciesId + (lifer ? '?new=1' : ''));
        App.toast(lifer
          ? 'New dex entry: ' + sp.n + '  +' + sp.points + ' pts'
          : 'Logged ' + sp.n + '.', lifer ? 'good' : 'info');
        return sighting;
      });
  };

  App.deleteSighting = function (id) {
    return Birdex.store.deleteSighting(id).then(() => {
      const s = state.sightings.find(x => x.id === id);
      state.sightings = state.sightings.filter(x => x.id !== id);
      state.photos = state.photos.filter(p => p.sightingId !== id);
      return Birdex.store.allCollections();
    }).then(cols => {
      state.collections = cols;
      return Birdex.store.getSetting('dexPhotos', {});
    }).then(map => {
      state.dexPhotos = map;
      recompute();
      App.toast('Sighting deleted.');
      App.render();
    });
  };

  App.setDexPhoto = function (speciesId, photoId) {
    state.dexPhotos[speciesId] = photoId;
    return Birdex.store.setSetting('dexPhotos', state.dexPhotos).then(() => {
      App.toast('Dex photo updated.', 'good');
      App.render();
    });
  };

  App.deletePhoto = function (photoId) {
    return Birdex.store.deletePhoto(photoId).then(() => {
      state.photos = state.photos.filter(p => p.id !== photoId);
      for (const s of state.sightings) {
        if (s.photoIds) s.photoIds = s.photoIds.filter(id => id !== photoId);
      }
      return Birdex.store.allCollections();
    }).then(cols => {
      state.collections = cols;
      return Birdex.store.getSetting('dexPhotos', {});
    }).then(map => {
      state.dexPhotos = map;
      recompute();
      App.toast('Photo deleted.');
      App.render();
    });
  };

  App.createCollection = function (name) {
    const c = {
      id: Birdex.store.id('cl'),
      name: (name || 'New collection').trim().slice(0, 60),
      note: '',
      createdAt: Date.now(),
      photoIds: [],
      cover: null
    };
    return Birdex.store.putCollection(c).then(() => {
      state.collections.push(c);
      App.render();
      return c;
    });
  };

  App.updateCollection = function (id, patch) {
    const c = state.collections.find(x => x.id === id);
    if (!c) return Promise.resolve(null);
    Object.assign(c, patch);
    if (!c.cover || c.photoIds.indexOf(c.cover) === -1) c.cover = c.photoIds[0] || null;
    return Birdex.store.putCollection(c).then(() => { App.render(); return c; });
  };

  App.toggleInCollection = function (collectionId, photoId) {
    const c = state.collections.find(x => x.id === collectionId);
    if (!c) return Promise.resolve(null);
    const i = c.photoIds.indexOf(photoId);
    if (i === -1) c.photoIds.push(photoId); else c.photoIds.splice(i, 1);
    return App.updateCollection(collectionId, {});
  };

  App.deleteCollection = function (id) {
    return Birdex.store.deleteCollection(id).then(() => {
      state.collections = state.collections.filter(c => c.id !== id);
      App.toast('Collection deleted.');
      App.go('#/collections');
    });
  };

  /* ------------------------------------------------------------------ */
  /* Pending sighting helpers                                            */
  /* ------------------------------------------------------------------ */

  App.addPendingPhotos = function (files) {
    const list = Array.from(files || []);
    if (!list.length) return Promise.resolve([]);
    App.toast('Processing ' + list.length + ' photo' + (list.length > 1 ? 's' : '') + '…');
    return list.reduce((chain, f) => chain.then(() =>
      Birdex.photos.process(f)
        .then(out => {
          /* One preview URL per pending photo, minted here rather than in
           * the view, which would leak a URL on every re-render. */
          out.url = URL.createObjectURL(out.thumb);
          state.pending.photos.push(out);
        })
        .catch(() => { App.toast('One file could not be read.', 'warn'); })
    ), Promise.resolve()).then(() => {
      App.render();
      return state.pending.photos;
    });
  };

  App.removePendingPhoto = function (index) {
    const gone = state.pending.photos.splice(index, 1)[0];
    if (gone && gone.url) URL.revokeObjectURL(gone.url);
    App.render();
  };

  /* ------------------------------------------------------------------ */
  /* Routing                                                             */
  /* ------------------------------------------------------------------ */

  function parseRoute() {
    const raw = (location.hash || '#/dex').replace(/^#/, '');
    const [path, qs] = raw.split('?');
    const parts = path.split('/').filter(Boolean);
    const params = {};
    if (qs) {
      qs.split('&').forEach(kv => {
        const [k, v] = kv.split('=');
        params[decodeURIComponent(k)] = decodeURIComponent(v || '');
      });
    }
    const name = parts[0] || 'dex';
    if (parts[1]) params.id = decodeURIComponent(parts[1]);
    return { name, params };
  }

  App.go = function (hash) {
    if (location.hash === hash) { App.render(); return; }
    location.hash = hash;
  };

  App.back = function () {
    if (history.length > 1) history.back();
    else App.go('#/dex');
  };

  App.render = function () {
    if (!state.ready) return;
    Birdex.views.render(state);
  };

  /* ------------------------------------------------------------------ */
  /* Boot                                                                */
  /* ------------------------------------------------------------------ */

  App.boot = function () {
    return Promise.all([
      Birdex.store.allSightings(),
      Birdex.store.allPhotos(),
      Birdex.store.allCollections(),
      Birdex.store.getSetting('dexPhotos', {}),
      Birdex.store.getSetting('manualRegion', null),
      Birdex.store.getSetting('lastGeo', null)
    ]).then(([sightings, photos, collections, dexPhotos, manualRegion, lastGeo]) => {
      state.sightings = sightings;
      state.photos = photos;
      state.collections = collections;
      state.dexPhotos = dexPhotos || {};
      state.manualRegion = manualRegion;
      if (lastGeo) {
        state.geo = lastGeo;
        const hit = Birdex.regionAt(lastGeo.lat, lastGeo.lng);
        if (hit.region) { state.regionCode = hit.region.code; state.regionExact = hit.exact; state.geoStatus = 'ok'; }
      }
      recompute();
      state.ready = true;
      state.route = parseRoute();
      Birdex.views.mount();
      App.render();

      window.addEventListener('hashchange', () => {
        state.route = parseRoute();
        window.scrollTo(0, 0);
        App.render();
      });

      /* A dex without a location is only half useful, so ask early — but
       * only when the browser says we already have permission, to avoid a
       * cold prompt on first paint. */
      if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'geolocation' })
          .then(p => { if (p.state === 'granted') App.locate(); })
          .catch(() => {});
      }
    });
  };

  /* ------------------------------------------------------------------ */
  /* Demo hook — drives the app for the automated tester                 */
  /* ------------------------------------------------------------------ */

  let demoTimer = null;

  function demoStep() {
    const code = App.regionCode();
    const pool = code ? Birdex.speciesForRegion(code) .map(r => r.sp) : Birdex.all();
    const undiscovered = pool.filter(sp => !App.seen(sp.id));
    if (!undiscovered.length) return Promise.resolve();
    const sp = undiscovered[0];
    const seed = state.sightings.length + 1;

    return Birdex.photos.synthetic(seed).then(img => {
      img.url = URL.createObjectURL(img.thumb);
      state.pending.photos = [img];
      state.pending.speciesId = sp.id;
      state.pending.notes = 'Logged by the demo birder.';
      state.pending.count = 1;
      state.pending.ts = Date.now() - seed * 3600e3;
      return App.saveSighting();
    });
  }

  global.__birdex = {
    setDemo(on) { on ? this.startDemo() : this.stopDemo(); },
    startDemo() {
      if (demoTimer) return;
      state.demo = true;
      if (!App.regionCode()) App.setManualRegion('NE');
      const tick = () => { demoStep().then(() => { if (demoTimer) demoTimer = setTimeout(tick, 350); }); };
      demoTimer = setTimeout(tick, 60);
    },
    stopDemo() {
      state.demo = false;
      clearTimeout(demoTimer);
      demoTimer = null;
    },
    state() {
      const s = App.stats();
      return {
        progress: s.species,
        score: s.points,
        mode: state.route.name,
        species: s.species,
        sightings: s.sightings,
        photos: s.photos,
        region: App.regionCode(),
        total: Birdex.count()
      };
    },
    /* Handles for tests: seed a position or a sighting without a camera. */
    setPosition: (lat, lng, acc) => App.setPosition(lat, lng, acc || 25),
    setRegion: code => App.setManualRegion(code),
    logSpecies(id, withPhoto) {
      state.pending.speciesId = id;
      state.pending.notes = 'test';
      const go = withPhoto === false
        ? Promise.resolve()
        : Birdex.photos.synthetic(state.sightings.length + 1).then(img => {
            img.url = URL.createObjectURL(img.thumb);
            state.pending.photos = [img];
          });
      return go.then(() => App.saveSighting());
    },
    app: App,
    core: Birdex
  };

})(window);
