/* =========================================================================
 * Views.
 *
 * One render pass rewrites the screen from state; all interaction is
 * delegated from the root, so nothing needs re-binding. Focus and caret
 * position are preserved across renders so typing in a search box works.
 * ====================================================================== */
(function (global) {
  'use strict';

  const Birdex = global.Birdex = global.Birdex || {};
  const views = Birdex.views = {};
  const esc = s => Birdex.escape(s);
  const App = () => Birdex.app;

  let root, viewEl, headEl, tabsEl, toastEl, sheetEl;

  const TABS = [
    { name: 'dex', href: '#/dex', label: 'Dex', icon: 'grid' },
    { name: 'nearby', href: '#/nearby', label: 'Nearby', icon: 'pin' },
    { name: 'log', href: '#/log', label: 'Log', icon: 'plus', primary: true },
    { name: 'collections', href: '#/collections', label: 'Album', icon: 'album' },
    { name: 'history', href: '#/history', label: 'History', icon: 'clock' }
  ];

  const ICONS = {
    grid: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/>',
    pin: '<path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/>',
    plus: '<path d="M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7z"/>',
    album: '<path d="M4 5h16v14H4zm2 10l3.5-4.5 2.5 3 3-4L18 17H6z"/>',
    clock: '<path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm1 9.6V7h-2v6.4l4.2 2.5 1-1.7z"/>',
    back: '<path d="M15.5 4L7 12l8.5 8 1.4-1.4L9.8 12l7.1-6.6z"/>',
    camera: '<path d="M9 4h6l1.5 2H20v14H4V6h3.5zM12 9a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z"/>',
    star: '<path d="M12 3l2.6 5.6L20 9.4l-4 4 1 6-5-2.9L7 19.4l1-6-4-4 5.4-.8z"/>',
    trash: '<path d="M6 7h12l-1 13H7zM9 4h6l1 2H8z"/>'
  };

  /* evenodd matters: several icons cut their detail out of an outer shape,
   * and the default nonzero rule would fill them in as solid blocks. */
  function icon(name, cls) {
    return '<svg class="i ' + (cls || '') + '" viewBox="0 0 24 24" fill-rule="evenodd" aria-hidden="true">' +
      (ICONS[name] || '') + '</svg>';
  }

  /* ------------------------------------------------------------------ */
  /* Mount                                                               */
  /* ------------------------------------------------------------------ */

  views.mount = function () {
    root = document.getElementById('app');
    root.innerHTML =
      '<header id="head" class="head"></header>' +
      '<main id="view" class="view" tabindex="-1"></main>' +
      '<nav id="tabs" class="tabs" aria-label="Sections"></nav>' +
      '<div id="sheet" class="sheet-wrap" hidden></div>' +
      '<div id="toast" class="toast" role="status" aria-live="polite"></div>';

    headEl = document.getElementById('head');
    viewEl = document.getElementById('view');
    tabsEl = document.getElementById('tabs');
    toastEl = document.getElementById('toast');
    sheetEl = document.getElementById('sheet');

    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onChange);
    root.addEventListener('submit', e => e.preventDefault());
  };

  /* ------------------------------------------------------------------ */
  /* Render                                                              */
  /* ------------------------------------------------------------------ */

  views.render = function (state) {
    const focus = captureFocus();

    /* The storage figure is async; ask once, the answer re-renders. */
    if (state.route.name === 'settings' && state.storage === undefined) {
      state.storage = null;
      views.refreshStorage();
    }

    headEl.innerHTML = renderHead(state);
    viewEl.innerHTML = renderView(state);
    tabsEl.innerHTML = renderTabs(state);

    if (state.sheet) {
      sheetEl.hidden = false;
      sheetEl.innerHTML = renderSheet(state);
    } else {
      sheetEl.hidden = true;
      sheetEl.innerHTML = '';
    }

    toastEl.className = 'toast' + (state.toast ? ' on ' + state.toast.kind : '');
    toastEl.textContent = state.toast ? state.toast.msg : '';

    restoreFocus(focus);
  };

  function captureFocus() {
    const el = document.activeElement;
    if (!el || !el.id || !viewEl || !viewEl.contains(el)) return null;
    return {
      id: el.id,
      start: typeof el.selectionStart === 'number' ? el.selectionStart : null,
      end: typeof el.selectionEnd === 'number' ? el.selectionEnd : null
    };
  }

  function restoreFocus(f) {
    if (!f) return;
    const el = document.getElementById(f.id);
    if (!el) return;
    el.focus({ preventScroll: true });
    if (f.start != null && el.setSelectionRange) {
      try { el.setSelectionRange(f.start, f.end); } catch (_) { /* not a text input */ }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Chrome                                                              */
  /* ------------------------------------------------------------------ */

  function renderHead(state) {
    const app = App();
    const r = app.regionCode() ? Birdex.region(app.regionCode()) : null;
    const rank = Birdex.rankFor(app.points());
    const back = ['species', 'collection', 'photo', 'settings', 'sighting'].indexOf(state.route.name) !== -1;

    return (back
      ? '<button class="head-btn" data-act="back" aria-label="Back">' + icon('back') + '</button>'
      : '<div class="brand"><span class="brand-mark" aria-hidden="true"></span><span>Birdex</span></div>') +
      '<button class="chip region-chip" data-act="go" data-href="#/nearby">' +
        icon('pin') + '<span>' + esc(r ? r.name : 'Set location') + '</span>' +
        (state.manualRegion ? '<em class="chip-note">manual</em>' : '') +
      '</button>' +
      '<button class="chip rank-chip" data-act="go" data-href="#/history" title="' +
        esc(rank.rank.name + ' — ' + app.points() + ' dex points') + '">' +
        '<b>' + app.points() + '</b><span>pts</span></button>';
  }

  function renderTabs(state) {
    const active = {
      dex: 'dex', species: 'dex', nearby: 'nearby', log: 'log',
      collections: 'collections', collection: 'collections',
      history: 'history', sighting: 'history', settings: 'history', photo: 'collections'
    }[state.route.name] || 'dex';

    return TABS.map(t =>
      '<button class="tab' + (active === t.name ? ' on' : '') + (t.primary ? ' primary' : '') +
      '" data-act="go" data-href="' + t.href + '"' + (active === t.name ? ' aria-current="page"' : '') + '>' +
      icon(t.icon) + '<span>' + t.label + '</span></button>'
    ).join('');
  }

  function renderView(state) {
    switch (state.route.name) {
      case 'species': return viewSpecies(state);
      case 'nearby': return viewNearby(state);
      case 'log': return viewLog(state);
      case 'collections': return viewCollections(state);
      case 'collection': return viewCollection(state);
      case 'history': return viewHistory(state);
      case 'sighting': return viewSighting(state);
      case 'photo': return viewPhoto(state);
      case 'settings': return viewSettings(state);
      default: return viewDex(state);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Shared pieces                                                       */
  /* ------------------------------------------------------------------ */

  function tierChip(tier, extra) {
    return '<span class="tier" style="--tier:' + tier.color + '">' + esc(tier.name) + (extra || '') + '</span>';
  }

  /** Odds bar. Square-rooted so the rare end of the scale stays readable. */
  function oddsBar(rarity) {
    const w = rarity.pct > 0 ? Math.max(3, Math.min(100, Math.sqrt(rarity.pct / 70) * 100)) : 0;
    return '<div class="odds"><div class="odds-fill" style="width:' + w.toFixed(1) +
      '%;background:' + rarity.tier.color + '"></div></div>';
  }

  function pips(tier) {
    const idx = Birdex.tiers.indexOf(tier);
    const n = idx === -1 ? 6 : idx + 1;
    let out = '<span class="pips" aria-label="Difficulty ' + n + ' of 6">';
    for (let i = 0; i < 6; i++) {
      out += '<i class="' + (i < n ? 'on' : '') + '" style="--tier:' + tier.color + '"></i>';
    }
    return out + '</span>';
  }

  function speciesThumb(sp, opts) {
    opts = opts || {};
    const app = App();
    const seen = app.seen(sp.id);
    const photo = seen ? app.dexPhoto(sp.id) : null;
    if (photo) {
      return '<img class="thumb-img" src="' + Birdex.store.url(photo, 'thumb') + '" alt="' + esc(sp.n) + '" loading="lazy">';
    }
    /* Locked silhouettes are the point of a dex grid, but lists that already
     * spell out the name gain nothing from hiding the picture. */
    return Birdex.art.portrait(sp, { locked: !seen && !opts.reveal });
  }

  function speciesCard(sp, state, rarity) {
    const app = App();
    const seen = app.seen(sp.id);
    const rec = app.record(sp.id);
    return '<button class="card' + (seen ? ' caught' : '') + '" data-act="go" data-href="#/species/' + sp.id + '">' +
      '<div class="card-art">' + speciesThumb(sp) +
        (seen ? '<span class="card-badge" title="In your dex">' + icon('star') + '</span>' : '') +
        (rec && rec.count > 1 ? '<span class="card-count">×' + rec.count + '</span>' : '') +
      '</div>' +
      '<div class="card-name">' + esc(seen ? sp.n : '???') + '</div>' +
      '<div class="card-sub">' + (seen ? esc(sp.fam) : '#' + pad(sp.num)) + '</div>' +
      (rarity ? '<div class="card-tier">' + tierChip(rarity.tier) + '</div>' : '') +
      '</button>';
  }

  function pad(n) { return String(n).padStart(3, '0'); }

  function empty(title, body, action) {
    return '<div class="empty"><h3>' + esc(title) + '</h3><p>' + body + '</p>' + (action || '') + '</div>';
  }

  /* ------------------------------------------------------------------ */
  /* Dex                                                                 */
  /* ------------------------------------------------------------------ */

  const DEX_FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'caught', label: 'In dex' },
    { key: 'missing', label: 'Missing' },
    { key: 'here', label: 'Here now' }
  ];

  function viewDex(state) {
    const app = App();
    const code = app.regionCode();
    const q = state.dexQuery.trim().toLowerCase();
    const stats = app.stats();

    let list = Birdex.all();
    if (q) list = list.filter(sp => sp.searchKey.indexOf(q) !== -1);

    if (state.dexFilter === 'caught') list = list.filter(sp => app.seen(sp.id));
    else if (state.dexFilter === 'missing') list = list.filter(sp => !app.seen(sp.id));
    else if (state.dexFilter === 'here' && code) {
      list = list.filter(sp => sp.abund[code] != null && Birdex.inSeason(sp, code, state.month));
    }

    const rarityOf = sp => code ? Birdex.rarity(sp, code, state.month) : null;

    if (state.dexFilter === 'here' && code) {
      list = list.slice().sort((a, b) => rarityOf(b).pct - rarityOf(a).pct || a.n.localeCompare(b.n));
    }

    return '<section class="pane">' +
      '<div class="dex-head">' +
        '<h1>Dex <em>' + stats.species + ' / ' + Birdex.count() + '</em></h1>' +
        '<div class="progress"><div style="width:' + (stats.species / Birdex.count() * 100).toFixed(1) + '%"></div></div>' +
        '<p class="muted small">' + stats.pctComplete + '% complete · ' + stats.points + ' dex points · ' +
          esc(Birdex.rankFor(stats.points).rank.name) + '</p>' +
      '</div>' +
      '<div class="toolbar">' +
        '<input id="dexSearch" class="search" type="search" placeholder="Search ' + Birdex.count() + ' birds, families, latin names" ' +
          'value="' + esc(state.dexQuery) + '" data-on="dex-search" autocomplete="off">' +
      '</div>' +
      '<div class="chips scroll-x">' +
        DEX_FILTERS.map(f => '<button class="chip' + (state.dexFilter === f.key ? ' on' : '') +
          '" data-act="dex-filter" data-value="' + f.key + '">' + f.label + '</button>').join('') +
      '</div>' +
      (state.dexFilter === 'here' && !code
        ? '<p class="notice">Set a location to see what is around you. <button class="link" data-act="go" data-href="#/nearby">Set location</button></p>'
        : '') +
      (list.length
        ? '<div class="grid">' + list.map(sp => speciesCard(sp, state, rarityOf(sp))).join('') + '</div>'
        : empty('Nothing matches', 'Try a different search or filter.')) +
      '</section>';
  }

  /* ------------------------------------------------------------------ */
  /* Species detail                                                      */
  /* ------------------------------------------------------------------ */

  function viewSpecies(state) {
    const app = App();
    const sp = Birdex.get(state.route.params.id);
    if (!sp) return empty('Unknown bird', 'That dex entry does not exist.');

    const code = app.regionCode();
    const rarity = Birdex.rarity(sp, code, state.month);
    const seen = app.seen(sp.id);
    const rec = app.record(sp.id);
    const photos = app.photosFor(sp.id);
    const hero = app.dexPhoto(sp.id);
    const isNew = state.route.params.new === '1';

    /* Where it is easiest to find — useful context when it is scarce here. */
    const best = Object.keys(sp.abund)
      .map(c => ({ code: c, level: sp.abund[c], region: Birdex.region(c) }))
      .sort((a, b) => b.level - a.level)
      .slice(0, 3);

    return '<section class="pane detail">' +
      (isNew ? '<div class="newbanner">New dex entry! <b>+' + sp.points + '</b> points</div>' : '') +
      '<div class="hero' + (hero ? ' has-photo' : '') + '">' +
        (hero
          ? '<img src="' + Birdex.store.url(hero, 'full') + '" alt="Your photo of ' + esc(sp.n) + '">'
          : Birdex.art.portrait(sp, { locked: !seen, className: 'hero-art' })) +
        '<span class="hero-num">#' + pad(sp.num) + '</span>' +
      '</div>' +

      '<div class="title-row">' +
        '<div><h1>' + esc(sp.n) + '</h1><p class="sci">' + esc(sp.sci) + '</p></div>' +
        tierChip(sp.globalTier, ' · ' + sp.points + ' pts') +
      '</div>' +
      '<p class="muted small">' + esc(sp.fam) + ' · ' + esc(sp.size) + '</p>' +

      '<div class="actions">' +
        '<button class="btn primary" data-act="log-species" data-id="' + sp.id + '">' + icon('camera') + ' Log a sighting</button>' +
        (photos.length ? '<button class="btn" data-act="sheet-dexphoto" data-id="' + sp.id + '">Set dex photo</button>' : '') +
      '</div>' +

      /* --- how hard is it, here, now --- */
      '<div class="panel">' +
        '<h2>How rare is it here?</h2>' +
        (code
          ? '<div class="rarity-row">' + tierChip(rarity.tier) + pips(rarity.tier) + '</div>' +
            oddsBar(rarity) +
            '<p class="odds-line"><b>' + esc(rarity.label) + '</b>' +
              (rarity.present ? ' · roughly <b>' + fmtPct(rarity.pct) + '</b> of outings' : '') + '</p>' +
            '<p class="muted">' + esc(rarity.detail) + '</p>' +
            '<p class="muted small">In ' + esc(Birdex.region(code).name) + ' · ' +
              esc(rarity.season.name) + ' · ' + monthName(state.month) +
              (rarity.present && !rarity.inSeason ? ' · out of season' : '') + '</p>'
          : '<p class="muted">Set your location and this becomes a real answer for where you are standing.</p>' +
            '<button class="btn" data-act="go" data-href="#/nearby">Set location</button>') +
        (best.length
          ? '<p class="muted small best-line">Best odds: ' +
            best.map(b => esc(b.region.name) + ' (' + esc(Birdex.abundance[b.level].label.toLowerCase()) + ')').join(' · ') +
            '</p>'
          : '') +
      '</div>' +

      /* --- your records --- */
      '<div class="panel">' +
        '<h2>Your records</h2>' +
        (seen
          ? '<p class="stat-line"><b>' + rec.count + '</b> sighting' + (rec.count > 1 ? 's' : '') +
              ' · first ' + Birdex.fmtDate(rec.first) + ' · latest ' + Birdex.fmtDate(rec.last) + '</p>' +
            (photos.length
              ? '<div class="strip">' + photos.map(p =>
                  '<button class="strip-item" data-act="go" data-href="#/photo/' + p.id + '">' +
                  '<img src="' + Birdex.store.url(p, 'thumb') + '" alt="Photo from ' + Birdex.fmtDate(p.ts) + '" loading="lazy">' +
                  '</button>').join('') + '</div>'
              : '<p class="muted">No photos of this one yet.</p>')
          : '<p class="muted">Not in your dex yet. Photograph one and it unlocks here.</p>') +
      '</div>' +

      /* --- field guide --- */
      '<div class="panel guide">' +
        '<h2>Field notes</h2>' +
        fact('At a glance', sp.look) +
        fact('Where they live', sp.habitat) +
        fact('Range', sp.range) +
        fact('Food', sp.food) +
        fact('Nest', sp.nest) +
        fact('Voice', sp.voice) +
        fact('Worth knowing', sp.fact) +
      '</div>' +

      '<div class="panel">' +
        '<h2>Recorded in</h2>' +
        '<div class="regionlist">' +
          Object.keys(sp.abund).sort((a, b) => sp.abund[b] - sp.abund[a]).map(c => {
            const reg = Birdex.region(c);
            const lv = sp.abund[c];
            return '<div class="regionrow' + (c === code ? ' here' : '') + '">' +
              '<span>' + esc(reg.name) + (c === code ? ' <em>· you are here</em>' : '') + '</span>' +
              '<span class="lv" style="--lv:' + (lv / 5 * 100) + '%">' + esc(Birdex.abundance[lv].label) + '</span>' +
              '</div>';
          }).join('') +
        '</div>' +
      '</div>' +
      '</section>';
  }

  function fact(label, text) {
    if (!text) return '';
    return '<div class="fact"><h3>' + esc(label) + '</h3><p>' + esc(text) + '</p></div>';
  }

  function fmtPct(p) {
    if (p >= 10) return Math.round(p) + '%';
    if (p >= 1) return p.toFixed(1) + '%';
    return p.toFixed(2) + '%';
  }

  function monthName(m) {
    return ['January', 'February', 'March', 'April', 'May', 'June', 'July',
      'August', 'September', 'October', 'November', 'December'][m - 1];
  }

  /* ------------------------------------------------------------------ */
  /* Nearby                                                              */
  /* ------------------------------------------------------------------ */

  const NEARBY_FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'need', label: 'Still need' },
    { key: 'have', label: 'In dex' },
    { key: 'season', label: 'In season' },
    { key: 'rare', label: 'Rare here' }
  ];

  function viewNearby(state) {
    const app = App();
    const code = app.regionCode();
    const region = code ? Birdex.region(code) : null;

    let rows = code ? Birdex.speciesForRegion(code, state.month) : [];
    const total = rows.length;
    const found = rows.filter(r => app.seen(r.sp.id)).length;

    if (state.nearbyFilter === 'need') rows = rows.filter(r => !app.seen(r.sp.id));
    else if (state.nearbyFilter === 'have') rows = rows.filter(r => app.seen(r.sp.id));
    else if (state.nearbyFilter === 'season') rows = rows.filter(r => r.rarity.inSeason);
    else if (state.nearbyFilter === 'rare') rows = rows.filter(r => r.rarity.tier.pts >= 90);

    return '<section class="pane">' +
      '<h1>Nearby</h1>' +

      '<div class="panel loc">' +
        (region
          ? '<h2 class="loc-name">' + esc(region.name) + '</h2><p class="muted">' + esc(region.blurb) + '</p>'
          : '<h2 class="loc-name">Where are you?</h2><p class="muted">Birdex works out which birds are around you, and how hard each one is to find, from your region and the month.</p>') +

        (state.geo
          ? '<p class="muted small">' + state.geo.lat.toFixed(3) + ', ' + state.geo.lng.toFixed(3) +
            (state.geo.acc ? ' · ±' + Math.round(state.geo.acc) + ' m' : '') +
            (state.regionExact ? '' : ' · nearest region') +
            ' · ' + Birdex.fmtDate(state.geo.ts) + '</p>'
          : '') +
        (state.geoError ? '<p class="notice">' + esc(state.geoError) + '</p>' : '') +

        '<div class="actions">' +
          '<button class="btn primary" data-act="locate">' +
            (state.geoStatus === 'locating' ? 'Locating…' : 'Use my location') + '</button>' +
        '</div>' +
        '<label class="field"><span>Or pick a region</span>' +
          '<select id="regionPick" data-on="region-pick">' +
            '<option value="">Use my location</option>' +
            Birdex.regions.map(r => '<option value="' + r.code + '"' +
              (state.manualRegion === r.code ? ' selected' : '') + '>' + esc(r.name) + '</option>').join('') +
          '</select></label>' +
      '</div>' +

      (region
        ? '<div class="panel tight">' +
            '<p class="stat-line"><b>' + total + '</b> species recorded here · you have <b>' + found + '</b>' +
            ' · ' + monthName(state.month) + '</p>' +
          '</div>' +
          '<div class="chips scroll-x">' +
            NEARBY_FILTERS.map(f => '<button class="chip' + (state.nearbyFilter === f.key ? ' on' : '') +
              '" data-act="nearby-filter" data-value="' + f.key + '">' + f.label + '</button>').join('') +
          '</div>' +
          (rows.length
            ? '<ul class="rows">' + rows.map(r => nearbyRow(r, app)).join('') + '</ul>'
            : empty('Nothing here', 'No species match that filter in this region.'))
        : '') +
      '</section>';
  }

  function nearbyRow(r, app) {
    const sp = r.sp, seen = app.seen(sp.id);
    return '<li><button class="row" data-act="go" data-href="#/species/' + sp.id + '">' +
      '<span class="row-art">' + speciesThumb(sp, { reveal: true }) + '</span>' +
      '<span class="row-main">' +
        '<span class="row-name">' + esc(sp.n) + (seen ? ' <i class="dot" title="In your dex"></i>' : '') + '</span>' +
        '<span class="row-sub">' + esc(sp.fam) + ' · ' + esc(r.rarity.label) + '</span>' +
        oddsBar(r.rarity) +
      '</span>' +
      '<span class="row-tier">' + tierChip(r.rarity.tier) + '<em>' + fmtPct(r.rarity.pct) + '</em></span>' +
      '</button></li>';
  }

  /* ------------------------------------------------------------------ */
  /* Log a sighting                                                      */
  /* ------------------------------------------------------------------ */

  function viewLog(state) {
    const app = App();
    const code = app.regionCode();
    const p = state.pending;
    const chosen = p.speciesId ? Birdex.get(p.speciesId) : null;
    const q = (p.query || '').trim().toLowerCase();

    let suggestions;
    if (q) {
      suggestions = Birdex.all().filter(sp => sp.searchKey.indexOf(q) !== -1).slice(0, 40)
        .map(sp => ({ sp, rarity: code ? Birdex.rarity(sp, code, state.month) : null }));
    } else {
      suggestions = Birdex.suggestions(code, state.month, 30);
    }

    const when = p.ts ? new Date(p.ts) : new Date();

    return '<section class="pane">' +
      '<h1>Log a sighting</h1>' +
      '<p class="muted">Photos stay on this device. Nothing is uploaded.</p>' +

      '<div class="panel">' +
        '<h2>1 · Photos</h2>' +
        '<div class="pending">' +
          p.photos.map((ph, i) =>
            '<div class="pending-item">' +
              '<img src="' + ph.url + '" alt="Photo ' + (i + 1) + '">' +
              '<button class="x" data-act="remove-pending" data-index="' + i + '" aria-label="Remove photo">×</button>' +
            '</div>').join('') +
          '<label class="pending-add">' + icon('camera') + '<span>Camera</span>' +
            '<input type="file" accept="image/*" capture="environment" multiple data-on="pick-photo"></label>' +
          '<label class="pending-add">' + icon('album') + '<span>Library</span>' +
            '<input type="file" accept="image/*" multiple data-on="pick-photo"></label>' +
        '</div>' +
        '<p class="muted small">A sighting can be logged without a photo, but a photo is what unlocks the dex art.</p>' +
      '</div>' +

      '<div class="panel">' +
        '<h2>2 · Which bird?</h2>' +
        (chosen
          ? '<div class="chosen">' +
              '<span class="chosen-art">' + Birdex.art.portrait(chosen, { reveal: true }) + '</span>' +
              '<span class="chosen-main"><b>' + esc(chosen.n) + '</b><em>' + esc(chosen.sci) + '</em>' +
                (code ? '<span class="muted small">' + esc(Birdex.rarity(chosen, code, state.month).label) +
                  ' in ' + esc(Birdex.region(code).name) + '</span>' : '') +
              '</span>' +
              '<button class="btn small" data-act="clear-species">Change</button>' +
            '</div>'
          : '<input id="logSearch" class="search" type="search" placeholder="Search by name, family or latin name" ' +
              'value="' + esc(p.query || '') + '" data-on="log-search" autocomplete="off">' +
            (code
              ? (q ? '' : '<p class="muted small">Ranked by what is likely where you are right now.</p>')
              : '<p class="muted small">Set a location and this list gets ranked by what is actually around you.</p>') +
            '<ul class="rows compact">' + suggestions.map(s =>
              '<li><button class="row" data-act="pick-species" data-id="' + s.sp.id + '">' +
                '<span class="row-art">' + Birdex.art.portrait(s.sp, { reveal: true }) + '</span>' +
                '<span class="row-main"><span class="row-name">' + esc(s.sp.n) + '</span>' +
                  '<span class="row-sub">' + esc(s.sp.fam) + (s.rarity ? ' · ' + esc(s.rarity.label) : '') + '</span></span>' +
                (s.rarity ? '<span class="row-tier">' + tierChip(s.rarity.tier) + '</span>' : '') +
              '</button></li>').join('') + '</ul>') +
      '</div>' +

      '<div class="panel">' +
        '<h2>3 · When and where</h2>' +
        '<label class="field"><span>Date and time</span>' +
          '<input id="logWhen" type="datetime-local" value="' + localInputValue(when) + '" data-on="when"></label>' +
        '<p class="muted small">' +
          (code
            ? 'Location: ' + esc(Birdex.region(code).name) + (state.manualRegion ? ' (picked by hand)' : '') +
              (state.geo ? ' · ' + state.geo.lat.toFixed(3) + ', ' + state.geo.lng.toFixed(3) : '')
            : 'No location set — the sighting will be saved without one.') +
        '</p>' +
        '<div class="actions"><button class="btn small" data-act="locate">' +
          (state.geoStatus === 'locating' ? 'Locating…' : 'Update location') + '</button></div>' +
        '<label class="field"><span>How many?</span>' +
          '<input id="logCount" type="number" min="1" max="9999" value="' + esc(p.count) + '" data-on="count"></label>' +
        '<label class="field"><span>Notes</span>' +
          '<textarea id="logNotes" rows="3" placeholder="Behaviour, habitat, who you were with…" data-on="notes">' +
            esc(p.notes) + '</textarea></label>' +
      '</div>' +

      '<div class="actions sticky">' +
        '<button class="btn primary big" data-act="save-sighting"' + (chosen ? '' : ' disabled') + '>' +
          (chosen ? 'Save sighting' : 'Pick a bird to save') + '</button>' +
      '</div>' +
      '</section>';
  }

  function localInputValue(d) {
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* ------------------------------------------------------------------ */
  /* Collections                                                         */
  /* ------------------------------------------------------------------ */

  function viewCollections(state) {
    const app = App();
    const cols = state.collections;

    return '<section class="pane">' +
      '<h1>Album</h1>' +
      '<p class="muted">Collections are hand-picked sets of your photos — a best-of, a trip, a patch.</p>' +
      '<div class="actions"><button class="btn primary" data-act="new-collection">New collection</button></div>' +
      (cols.length
        ? '<div class="grid two">' + cols.map(c => {
            const cover = c.cover ? app.photo(c.cover) : (c.photoIds.length ? app.photo(c.photoIds[0]) : null);
            return '<button class="card col-card" data-act="go" data-href="#/collection/' + c.id + '">' +
              '<div class="card-art">' +
                (cover
                  ? '<img class="thumb-img" src="' + Birdex.store.url(cover, 'thumb') + '" alt="" loading="lazy">'
                  : '<div class="col-empty">' + icon('album') + '</div>') +
              '</div>' +
              '<div class="card-name">' + esc(c.name) + '</div>' +
              '<div class="card-sub">' + c.photoIds.length + ' photo' + (c.photoIds.length === 1 ? '' : 's') + '</div>' +
              '</button>';
          }).join('') + '</div>'
        : empty('No collections yet', 'Make one, then add the shots you are proud of.')) +

      '<div class="panel">' +
        '<h2>All your photos <em class="muted">' + state.photos.length + '</em></h2>' +
        (state.photos.length
          ? '<div class="photogrid">' + state.photos.map(p =>
              '<button class="ph" data-act="go" data-href="#/photo/' + p.id + '">' +
                '<img src="' + Birdex.store.url(p, 'thumb') + '" alt="" loading="lazy">' +
                '<span>' + esc(shortName(p.speciesId)) + '</span>' +
              '</button>').join('') + '</div>'
          : '<p class="muted">Photos you attach to sightings show up here.</p>') +
      '</div>' +
      '</section>';
  }

  function shortName(speciesId) {
    const sp = Birdex.get(speciesId);
    return sp ? sp.n : 'Unknown';
  }

  function viewCollection(state) {
    const app = App();
    const c = state.collections.find(x => x.id === state.route.params.id);
    if (!c) return empty('Collection missing', 'It may have been deleted.');
    const photos = c.photoIds.map(id => app.photo(id)).filter(Boolean);

    return '<section class="pane">' +
      '<div class="title-row">' +
        '<h1>' + esc(c.name) + '</h1>' +
      '</div>' +
      '<label class="field"><span>Name</span>' +
        '<input id="colName" type="text" value="' + esc(c.name) + '" data-on="collection-name" data-id="' + c.id + '"></label>' +
      '<div class="actions">' +
        '<button class="btn primary" data-act="sheet-add-photos" data-id="' + c.id + '">Add photos</button>' +
        '<button class="btn danger" data-act="delete-collection" data-id="' + c.id + '">Delete collection</button>' +
      '</div>' +
      (photos.length
        ? '<div class="photogrid">' + photos.map(p =>
            '<div class="ph pick">' +
              '<button class="ph-open" data-act="go" data-href="#/photo/' + p.id + '">' +
                '<img src="' + Birdex.store.url(p, 'thumb') + '" alt="" loading="lazy"></button>' +
              '<span>' + esc(shortName(p.speciesId)) + '</span>' +
              '<button class="ph-x" data-act="toggle-collection" data-collection="' + c.id + '" data-photo="' + p.id +
                '" aria-label="Remove from collection">×</button>' +
              '<button class="ph-cover' + (c.cover === p.id ? ' on' : '') + '" data-act="set-cover" data-collection="' +
                c.id + '" data-photo="' + p.id + '" aria-label="Use as cover">' + icon('star') + '</button>' +
            '</div>').join('') + '</div>'
        : empty('Empty collection', 'Add photos from your sightings to fill it.')) +
      '</section>';
  }

  function viewPhoto(state) {
    const app = App();
    const p = app.photo(state.route.params.id);
    if (!p) return empty('Photo missing', 'It may have been deleted.');
    const sp = Birdex.get(p.speciesId);
    const sighting = state.sightings.find(s => s.id === p.sightingId);
    const isDex = state.dexPhotos[p.speciesId] === p.id;

    return '<section class="pane">' +
      '<div class="lightbox"><img src="' + Birdex.store.url(p, 'full') + '" alt="Photo of ' + esc(sp ? sp.n : '') + '"></div>' +
      '<div class="title-row"><div>' +
        '<h1>' + esc(sp ? sp.n : 'Unknown') + '</h1>' +
        '<p class="muted small">' + Birdex.fmtDate(p.ts) + ' · ' + Birdex.fmtTime(p.ts) +
          (sighting && sighting.region ? ' · ' + esc(Birdex.region(sighting.region).name) : '') + '</p>' +
      '</div></div>' +
      (sighting && sighting.notes ? '<p class="quote">' + esc(sighting.notes) + '</p>' : '') +
      '<div class="actions">' +
        (sp ? '<button class="btn" data-act="go" data-href="#/species/' + sp.id + '">Dex entry</button>' : '') +
        '<button class="btn" data-act="add-to-collection" data-photo="' + p.id + '">Add to collection</button>' +
        '<button class="btn' + (isDex ? ' on' : '') + '" data-act="set-dexphoto" data-species="' + p.speciesId +
          '" data-photo="' + p.id + '">' + (isDex ? 'Dex photo ✓' : 'Use as dex photo') + '</button>' +
        '<button class="btn danger" data-act="delete-photo" data-id="' + p.id + '">' + icon('trash') + ' Delete</button>' +
      '</div>' +
      '</section>';
  }

  /* ------------------------------------------------------------------ */
  /* History                                                             */
  /* ------------------------------------------------------------------ */

  function viewHistory(state) {
    const app = App();
    const s = app.stats();
    const rank = Birdex.rankFor(s.points);
    const badges = app.earnedBadges();

    /* Last 12 months of activity. */
    const now = new Date();
    const buckets = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({ key: d.getFullYear() + '-' + d.getMonth(), label: d.toLocaleDateString(undefined, { month: 'narrow' }), n: 0 });
    }
    const index = {};
    buckets.forEach((b, i) => { index[b.key] = i; });
    for (const sg of state.sightings) {
      const d = new Date(sg.ts);
      const k = d.getFullYear() + '-' + d.getMonth();
      if (index[k] != null) buckets[index[k]].n++;
    }
    const peak = Math.max(1, ...buckets.map(b => b.n));

    /* Timeline grouped by day. */
    const days = [];
    let cur = null;
    for (const sg of state.sightings) {
      const key = Birdex.fmtDayKey(sg.ts);
      if (!cur || cur.key !== key) { cur = { key, ts: sg.ts, items: [] }; days.push(cur); }
      cur.items.push(sg);
    }

    return '<section class="pane">' +
      '<h1>History</h1>' +

      '<div class="tiles">' +
        tile(s.species, 'species') + tile(s.sightings, 'sightings') +
        tile(s.photos, 'photos') + tile(s.points, 'dex points') +
      '</div>' +

      '<div class="panel">' +
        '<h2>' + esc(rank.rank.name) + '</h2>' +
        '<div class="progress"><div style="width:' + (rank.progress * 100).toFixed(1) + '%"></div></div>' +
        '<p class="muted small">' + (rank.next
          ? (rank.next.min - s.points) + ' points to ' + esc(rank.next.name)
          : 'Top rank reached.') + '</p>' +
      '</div>' +

      '<div class="panel">' +
        '<h2>Last 12 months</h2>' +
        '<div class="bars">' + buckets.map(b =>
          '<div class="bar"><em>' + (b.n || '') + '</em>' +
            '<i style="height:' + Math.max(3, b.n / peak * 100) + '%"' + (b.n ? ' class="on"' : '') + '></i>' +
            '<span>' + esc(b.label) + '</span></div>').join('') + '</div>' +
      '</div>' +

      '<div class="panel">' +
        '<h2>Badges <em class="muted">' + badges.filter(b => b.earned).length + ' / ' + badges.length + '</em></h2>' +
        '<div class="badges">' + badges.map(b =>
          '<div class="badge' + (b.earned ? ' on' : '') + '"><b>' + esc(b.badge.name) + '</b>' +
          '<span>' + esc(b.badge.desc) + '</span></div>').join('') + '</div>' +
      '</div>' +

      '<div class="panel">' +
        '<h2>Birding history</h2>' +
        (days.length
          ? days.map(d =>
              '<div class="day"><h3>' + Birdex.fmtDate(d.ts) + ' <em>' + d.items.length + '</em></h3>' +
              '<ul class="rows compact">' + d.items.map(sg => sightingRow(sg, app)).join('') + '</ul></div>').join('')
          : empty('No sightings yet', 'Your birding history builds itself as you log.',
              '<button class="btn primary" data-act="go" data-href="#/log">Log your first bird</button>')) +
      '</div>' +

      '<div class="actions"><button class="btn" data-act="go" data-href="#/settings">Settings and data</button></div>' +
      '</section>';
  }

  function tile(n, label) {
    return '<div class="tile"><b>' + n + '</b><span>' + esc(label) + '</span></div>';
  }

  function sightingRow(sg, app) {
    const sp = Birdex.get(sg.speciesId);
    const photo = sg.photoIds && sg.photoIds.length ? app.photo(sg.photoIds[0]) : null;
    return '<li><button class="row" data-act="go" data-href="#/sighting/' + sg.id + '">' +
      '<span class="row-art">' + (photo
        ? '<img class="thumb-img" src="' + Birdex.store.url(photo, 'thumb') + '" alt="" loading="lazy">'
        : (sp ? Birdex.art.portrait(sp, { reveal: true }) : '')) + '</span>' +
      '<span class="row-main">' +
        '<span class="row-name">' + esc(sp ? sp.n : 'Unknown') + (sg.count > 1 ? ' ×' + sg.count : '') + '</span>' +
        '<span class="row-sub">' + Birdex.fmtTime(sg.ts) +
          (sg.region ? ' · ' + esc(Birdex.region(sg.region).name) : '') +
          (sg.notes ? ' · ' + esc(sg.notes.slice(0, 40)) : '') + '</span>' +
      '</span>' +
      '</button></li>';
  }

  function viewSighting(state) {
    const app = App();
    const sg = state.sightings.find(x => x.id === state.route.params.id);
    if (!sg) return empty('Sighting missing', 'It may have been deleted.');
    const sp = Birdex.get(sg.speciesId);
    const photos = (sg.photoIds || []).map(id => app.photo(id)).filter(Boolean);
    const rarity = sg.region ? Birdex.rarity(sp, sg.region, new Date(sg.ts).getMonth() + 1) : null;

    return '<section class="pane">' +
      '<h1>' + esc(sp ? sp.n : 'Unknown') + '</h1>' +
      '<p class="muted">' + Birdex.fmtDate(sg.ts) + ' · ' + Birdex.fmtTime(sg.ts) +
        (sg.region ? ' · ' + esc(Birdex.region(sg.region).name) : ' · no location') + '</p>' +
      (photos.length
        ? '<div class="strip big">' + photos.map(p =>
            '<button class="strip-item" data-act="go" data-href="#/photo/' + p.id + '">' +
            '<img src="' + Birdex.store.url(p, 'thumb') + '" alt="" loading="lazy"></button>').join('') + '</div>'
        : '') +
      '<div class="panel">' +
        '<p class="stat-line"><b>' + sg.count + '</b> bird' + (sg.count > 1 ? 's' : '') +
          (rarity ? ' · ' + esc(rarity.label) + ' there that month' : '') + '</p>' +
        (sg.notes ? '<p class="quote">' + esc(sg.notes) + '</p>' : '<p class="muted">No notes.</p>') +
        (sg.lat != null ? '<p class="muted small">' + sg.lat.toFixed(4) + ', ' + sg.lng.toFixed(4) +
          (sg.acc ? ' · ±' + Math.round(sg.acc) + ' m' : '') + '</p>' : '') +
      '</div>' +
      '<div class="actions">' +
        (sp ? '<button class="btn" data-act="go" data-href="#/species/' + sp.id + '">Dex entry</button>' : '') +
        '<button class="btn danger" data-act="delete-sighting" data-id="' + sg.id + '">' + icon('trash') + ' Delete sighting</button>' +
      '</div>' +
      '</section>';
  }

  /* ------------------------------------------------------------------ */
  /* Settings                                                            */
  /* ------------------------------------------------------------------ */

  function viewSettings(state) {
    return '<section class="pane">' +
      '<h1>Settings and data</h1>' +

      '<div class="panel">' +
        '<h2>Storage</h2>' +
        '<p class="muted" id="storageLine">' + (state.storage
          ? fmtBytes(state.storage.usage) + ' used of about ' + fmtBytes(state.storage.quota) + ' available'
          : (state.storage === false ? 'This browser does not report a storage estimate.' : 'Checking…')) + '</p>' +
        '<p class="muted small">Photos are re-encoded to about 1600 px on import, so a few hundred birds fit comfortably.</p>' +
      '</div>' +

      '<div class="panel">' +
        '<h2>Offline copy</h2>' +
        (global.BIRDEX_OFFLINE
          ? '<p class="muted">You are running the offline copy. Everything — all ' + Birdex.count() +
              ' dex entries, the rarity model, your photos — is already on this device, and it works with no ' +
              'network at all. To move it to another machine, just copy the .html file across; your sightings ' +
              'stay behind on this one, so export a backup first if you want them too.</p>'
          : '<p class="muted">Download Birdex as a single self-contained file. Open it from your desktop and the ' +
              'whole app runs locally — no server, no install, no network.</p>' +
            '<div class="actions">' +
              '<a class="btn primary" href="birdex-offline.html" download="birdex-offline.html">Download Birdex</a>' +
            '</div>' +
            '<p class="muted small">Sightings saved in the downloaded copy are separate from the ones saved here: ' +
              'a browser keeps storage for local files apart from storage for websites.</p>') +
      '</div>' +

      '<div class="panel">' +
        '<h2>Backup</h2>' +
        '<p class="muted">Export your sightings, notes and collection lists as JSON. Photo files are not included — they stay in this browser only.</p>' +
        '<div class="actions"><button class="btn" data-act="export">Export JSON</button></div>' +
      '</div>' +

      '<div class="panel">' +
        '<h2>About the rarity data</h2>' +
        '<p class="muted">Birdex carries ' + Birdex.count() + ' species across ' + Birdex.regions.length +
        ' birding regions. Abundance is a hand-built 0–5 scale per region, adjusted for the season, in the tradition of a ' +
        'field guide\'s status bars. It is a guide to what is likely, not a substitute for local checklists.</p>' +
        '<p class="muted small">Coverage is deepest in North America, where each region carries 100+ species. The European ' +
        'regions hold the widespread residents and visitors rather than a complete list, so treat a thin regional list as a ' +
        'gap in the data, not an empty landscape.</p>' +
      '</div>' +

      '<div class="panel danger-zone">' +
        '<h2>Erase everything</h2>' +
        '<p class="muted">Deletes every sighting, photo and collection on this device. There is no undo.</p>' +
        '<div class="actions"><button class="btn danger" data-act="wipe">Erase all data</button></div>' +
      '</div>' +
      '</section>';
  }

  function fmtBytes(n) {
    if (!n && n !== 0) return 'unknown';
    if (n > 1e9) return (n / 1e9).toFixed(1) + ' GB';
    if (n > 1e6) return (n / 1e6).toFixed(1) + ' MB';
    if (n > 1e3) return (n / 1e3).toFixed(0) + ' kB';
    return n + ' B';
  }

  /* ------------------------------------------------------------------ */
  /* Bottom sheet                                                        */
  /* ------------------------------------------------------------------ */

  function renderSheet(state) {
    const app = App();
    const sheet = state.sheet;
    let inner = '';

    if (sheet.type === 'collections') {
      inner = '<h2>Add to collection</h2>' +
        (state.collections.length
          ? '<ul class="sheet-list">' + state.collections.map(c => {
              const inIt = c.photoIds.indexOf(sheet.photoId) !== -1;
              return '<li><button class="sheet-row' + (inIt ? ' on' : '') + '" data-act="toggle-collection" data-collection="' +
                c.id + '" data-photo="' + sheet.photoId + '">' +
                '<span>' + esc(c.name) + '</span><em>' + (inIt ? 'Added ✓' : 'Add') + '</em></button></li>';
            }).join('') + '</ul>'
          : '<p class="muted">You have no collections yet.</p>') +
        '<div class="actions"><button class="btn" data-act="new-collection" data-photo="' + sheet.photoId + '">New collection</button></div>';
    }

    if (sheet.type === 'dexphoto') {
      const photos = app.photosFor(sheet.speciesId);
      inner = '<h2>Choose the dex photo</h2>' +
        '<div class="photogrid">' + photos.map(p =>
          '<button class="ph" data-act="set-dexphoto" data-species="' + sheet.speciesId + '" data-photo="' + p.id + '">' +
            '<img src="' + Birdex.store.url(p, 'thumb') + '" alt="" loading="lazy">' +
            '<span>' + Birdex.fmtDate(p.ts) + '</span></button>').join('') + '</div>';
    }

    if (sheet.type === 'addphotos') {
      const c = state.collections.find(x => x.id === sheet.collectionId);
      inner = '<h2>Add photos to ' + esc(c ? c.name : '') + '</h2>' +
        (state.photos.length
          ? '<div class="photogrid">' + state.photos.map(p => {
              const inIt = c && c.photoIds.indexOf(p.id) !== -1;
              return '<button class="ph' + (inIt ? ' on' : '') + '" data-act="toggle-collection" data-collection="' +
                sheet.collectionId + '" data-photo="' + p.id + '">' +
                '<img src="' + Birdex.store.url(p, 'thumb') + '" alt="" loading="lazy">' +
                '<span>' + esc(shortName(p.speciesId)) + (inIt ? ' ✓' : '') + '</span></button>';
            }).join('') + '</div>'
          : '<p class="muted">No photos yet.</p>');
    }

    return '<div class="sheet-back" data-act="close-sheet"></div>' +
      '<div class="sheet" role="dialog" aria-modal="true">' + inner +
      '<button class="btn wide" data-act="close-sheet">Done</button></div>';
  }

  /* ------------------------------------------------------------------ */
  /* Events                                                              */
  /* ------------------------------------------------------------------ */

  function onClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const app = App();
    const state = app.state;
    const d = el.dataset;

    switch (d.act) {
      case 'go': app.go(d.href); break;
      case 'back': app.back(); break;

      case 'dex-filter': state.dexFilter = d.value; app.render(); break;
      case 'nearby-filter': state.nearbyFilter = d.value; app.render(); break;

      case 'locate': app.locate({ fresh: true, precise: true }); break;

      case 'pick-species':
        state.pending.speciesId = d.id;
        state.pending.query = '';
        app.render();
        break;
      case 'clear-species':
        state.pending.speciesId = null;
        app.render();
        break;
      case 'log-species':
        state.pending.speciesId = d.id;
        app.go('#/log');
        break;
      case 'remove-pending': app.removePendingPhoto(parseInt(d.index, 10)); break;
      case 'save-sighting': app.saveSighting(); break;

      case 'delete-sighting':
        if (confirm('Delete this sighting and its photos?')) {
          app.deleteSighting(d.id).then(() => app.go('#/history'));
        }
        break;
      case 'delete-photo':
        if (confirm('Delete this photo?')) app.deletePhoto(d.id).then(() => app.back());
        break;

      case 'set-dexphoto':
        app.setDexPhoto(d.species, d.photo).then(() => { state.sheet = null; app.render(); });
        break;
      case 'sheet-dexphoto':
        state.sheet = { type: 'dexphoto', speciesId: d.id };
        app.render();
        break;
      case 'add-to-collection':
        state.sheet = { type: 'collections', photoId: d.photo };
        app.render();
        break;
      case 'sheet-add-photos':
        state.sheet = { type: 'addphotos', collectionId: d.id };
        app.render();
        break;
      case 'close-sheet':
        state.sheet = null;
        app.render();
        break;

      case 'new-collection': {
        const name = prompt('Name this collection', 'Favourites');
        if (name) {
          app.createCollection(name).then(c => {
            if (d.photo) return app.toggleInCollection(c.id, d.photo);
            state.sheet = null;
            app.go('#/collection/' + c.id);
          });
        }
        break;
      }
      case 'toggle-collection': app.toggleInCollection(d.collection, d.photo); break;
      case 'set-cover': app.updateCollection(d.collection, { cover: d.photo }); break;
      case 'delete-collection':
        if (confirm('Delete this collection? Your photos are kept.')) app.deleteCollection(d.id);
        break;

      case 'export':
        Birdex.store.exportJSON().then(json => {
          const blob = new Blob([json], { type: 'application/json' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'birdex-backup-' + Birdex.fmtDayKey(Date.now()) + '.json';
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        });
        break;
      case 'wipe':
        if (confirm('Erase every sighting, photo and collection on this device?')) {
          Birdex.store.wipe().then(() => location.reload());
        }
        break;
    }
  }

  function onInput(e) {
    const el = e.target.closest('[data-on]');
    if (!el) return;
    const app = App();
    const state = app.state;

    switch (el.dataset.on) {
      case 'dex-search': state.dexQuery = el.value; app.render(); break;
      case 'log-search': state.pending.query = el.value; app.render(); break;
      case 'notes': state.pending.notes = el.value; break;
      case 'count': state.pending.count = el.value; break;
      case 'when': {
        const t = new Date(el.value).getTime();
        if (!isNaN(t)) state.pending.ts = t;
        break;
      }
      case 'collection-name': app.updateCollection(el.dataset.id, { name: el.value }); break;
    }
  }

  function onChange(e) {
    const el = e.target.closest('[data-on]');
    if (!el) return;
    const app = App();
    if (el.dataset.on === 'pick-photo' && el.files && el.files.length) {
      app.addPendingPhotos(el.files).then(() => { el.value = ''; });
    }
    if (el.dataset.on === 'region-pick') app.setManualRegion(el.value);
  }

  /* Settings view needs an async storage estimate; fetch it on demand. */
  views.refreshStorage = function () {
    Birdex.store.estimate().then(est => {
      App().state.storage = est || false;   // false = asked, browser declined
      App().render();
    });
  };

})(window);
