/* =========================================================================
 * Birdex core — species registry, regions, seasons, rarity.
 *
 * Everything here is pure data + pure functions. No DOM, no storage.
 * The rest of the app asks this module two questions:
 *   "which birds live where I am?"  -> Birdex.speciesForRegion(code, month)
 *   "how hard is this one to find?" -> Birdex.rarity(species, code, month)
 * ====================================================================== */
(function (global) {
  'use strict';

  const Birdex = global.Birdex = global.Birdex || {};

  /* ---------------------------------------------------------------------
   * Regions
   *
   * A region is a coarse birding area: coarse enough that one abundance
   * number per species is honest, fine enough that the answer changes as
   * you travel. Boxes overlap on purpose (the Southeast bleeds into the
   * Mid-Atlantic); ties break on the nearest centroid, so a point inside
   * two boxes lands in the one whose middle it is closest to.
   * ------------------------------------------------------------------ */
  const REGIONS = [
    { code: 'PNW', name: 'Pacific Northwest',      blurb: 'Wet conifer forest, rocky coast and river valleys from northern California to southern Alaska.', box: [42, -140, 60, -116], c: [47.5, -122.5] },
    { code: 'CAL', name: 'California',             blurb: 'Oak savanna, chaparral, Central Valley wetlands and a long productive coastline.',               box: [32, -125, 42.2, -114], c: [37, -120] },
    { code: 'SW',  name: 'Desert Southwest',       blurb: 'Sonoran and Chihuahuan desert, sky-island canyons and dry washes.',                              box: [30.5, -116, 38, -102.5], c: [34, -110] },
    { code: 'RCK', name: 'Rockies & Great Basin',  blurb: 'Sagebrush flats, montane forest and alpine tundra along the spine of the continent.',            box: [36.5, -117, 49.5, -103.5], c: [43, -110] },
    { code: 'GPL', name: 'Great Plains',           blurb: 'Shortgrass and tallgrass prairie, shelterbelts, prairie potholes.',                              box: [35.5, -104.5, 49.5, -94.5], c: [42, -100] },
    { code: 'TEX', name: 'Texas & Gulf Coast',     blurb: 'Hill country, brush country, coastal marsh and the busiest migration funnel in the country.',    box: [25.5, -107, 36.6, -93], c: [31, -99] },
    { code: 'MDW', name: 'Midwest & Great Lakes',  blurb: 'Farm country, oak-hickory woodlots, marshes and big freshwater shorelines.',                     box: [36, -97.5, 49.5, -80], c: [42, -88] },
    { code: 'NE',  name: 'Northeast',              blurb: 'Mixed hardwood and hemlock forest, old fields, rocky Atlantic coast.',                           box: [38.8, -80.5, 47.6, -66], c: [43, -73] },
    { code: 'MAT', name: 'Mid-Atlantic',           blurb: 'Piedmont woods, tidal rivers and the barrier-island coast.',                                     box: [33.8, -84, 40.2, -74.5], c: [37.5, -78] },
    { code: 'SE',  name: 'Southeast',              blurb: 'Pine savanna, bottomland swamp, cypress sloughs and warm humid summers.',                        box: [28.5, -95, 36.8, -75], c: [33, -85] },
    { code: 'FL',  name: 'Florida',                blurb: 'Subtropical marsh, mangrove, scrub and beaches — the wading-bird capital.',                      box: [24.3, -88, 31.2, -79.5], c: [28, -82] },
    { code: 'CAN', name: 'Canada & the Boreal',    blurb: 'Spruce forest, muskeg and prairie pothole country; the continent\'s nursery.',                   box: [49, -141, 70, -52], c: [55, -100] },
    { code: 'AK',  name: 'Alaska',                 blurb: 'Tundra, taiga and seabird cliffs, with Asian strays turning up on the islands.',                 box: [54, -180, 72, -129], c: [63, -150] },
    { code: 'MEX', name: 'Mexico & Middle America',blurb: 'Thorn forest, cloud forest and tropical lowlands — where northern birds go for winter.',         box: [7, -118, 31, -83], c: [20, -100] },
    { code: 'UKI', name: 'Britain & Ireland',      blurb: 'Hedgerow farmland, oak woods, estuaries and seabird cliffs.',                                    box: [49.5, -11, 61, 2.2], c: [54, -2.5] },
    { code: 'WEU', name: 'Western Europe',         blurb: 'Lowland farmland, beech forest, canals and the North Sea coast.',                                box: [43, -10, 55, 15.5], c: [49, 5] },
    { code: 'NEU', name: 'Northern Europe',        blurb: 'Boreal forest, bog and skerry coast from Denmark to the Arctic.',                                box: [54, 3.5, 71, 32], c: [61, 17] },
    { code: 'SEU', name: 'Mediterranean',          blurb: 'Olive groves, garrigue, rice fields and dry rocky hills.',                                       box: [33, -10, 45.5, 30], c: [41, 12] },
    { code: 'EEU', name: 'Eastern Europe',         blurb: 'Steppe, river floodplain and vast unbroken forest.',                                             box: [44, 15, 60, 45], c: [52, 28] }
  ];

  const REGION_BY_CODE = {};
  REGIONS.forEach(r => { REGION_BY_CODE[r.code] = r; });

  /** Named bundles of regions, so a species' range reads like a sentence. */
  const GROUPS = {
    NA:  ['PNW', 'CAL', 'SW', 'RCK', 'GPL', 'TEX', 'MDW', 'NE', 'MAT', 'SE', 'FL', 'CAN', 'AK', 'MEX'],
    NAE: ['MDW', 'NE', 'MAT', 'SE', 'FL'],
    NAW: ['PNW', 'CAL', 'SW', 'RCK'],
    NAC: ['GPL', 'TEX'],
    NAN: ['CAN', 'AK'],
    EU:  ['UKI', 'WEU', 'NEU', 'SEU', 'EEU'],
    EUW: ['UKI', 'WEU'],
    HOL: ['PNW', 'CAL', 'SW', 'RCK', 'GPL', 'TEX', 'MDW', 'NE', 'MAT', 'SE', 'FL', 'CAN', 'AK', 'MEX',
          'UKI', 'WEU', 'NEU', 'SEU', 'EEU']
  };

  /* ---------------------------------------------------------------------
   * Abundance
   *
   * 0-5, the scale field guides have used forever. `pct` is roughly the
   * share of outings in decent habitat on which you'd run into one — it
   * drives the rarity tiers and the "how hard is this" meter.
   * ------------------------------------------------------------------ */
  const ABUNDANCE = [
    { level: 0, label: 'Vagrant',        pct: 0.3 },
    { level: 1, label: 'Scarce',         pct: 2 },
    { level: 2, label: 'Uncommon',       pct: 7 },
    { level: 3, label: 'Fairly common',  pct: 18 },
    { level: 4, label: 'Common',         pct: 40 },
    { level: 5, label: 'Abundant',       pct: 70 }
  ];

  /* Rarity tiers, worst-to-best odds. `pts` is what a first sighting is
   * worth — the whole point of a dex is that the hard ones count more. */
  const TIERS = [
    { key: 'common',    name: 'Common',    min: 32, pts: 10,  color: '#7fbf7a' },
    { key: 'frequent',  name: 'Frequent',  min: 14, pts: 20,  color: '#5aa9d6' },
    { key: 'uncommon',  name: 'Uncommon',  min: 5,  pts: 45,  color: '#b48ce0' },
    { key: 'scarce',    name: 'Scarce',    min: 1.5, pts: 90,  color: '#e0a24a' },
    { key: 'rare',      name: 'Rare',      min: 0.4, pts: 180, color: '#e8734a' },
    { key: 'legendary', name: 'Legendary', min: 0,  pts: 400, color: '#e0576f' }
  ];

  const OFF_RANGE = { key: 'offrange', name: 'Off-range', pts: 400, color: '#6b7280' };

  /* ---------------------------------------------------------------------
   * Seasons
   *
   * 'y' resident, 's' breeding season only, 'w' winter only, 'm' passage
   * migrant (spring and fall only). A species can override per region —
   * an American Robin is a summer bird in the boreal and a winter mob in
   * the Southeast.
   * ------------------------------------------------------------------ */
  const SEASONS = {
    y: { name: 'Year-round',  months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], note: 'Present all year.' },
    s: { name: 'Summer',      months: [4, 5, 6, 7, 8, 9],                      note: 'Here to breed, roughly April to September.' },
    w: { name: 'Winter',      months: [10, 11, 12, 1, 2, 3],                   note: 'A winter visitor, roughly October to March.' },
    m: { name: 'Migration',   months: [4, 5, 9, 10],                           note: 'Passes through in spring and fall.' }
  };

  /* ------------------------------------------------------------------ */
  /* Registry                                                            */
  /* ------------------------------------------------------------------ */

  const SPECIES = [];
  const BY_ID = {};

  /**
   * Expand a compact range spec into per-region abundance levels.
   * Broad keys are applied first so narrow ones overwrite them:
   * `{ NA: 3, FL: 5 }` means "fairly common continent-wide, swarming in
   * Florida", regardless of key order in the source.
   */
  function expandRange(spec) {
    const out = {};
    const keys = Object.keys(spec).sort((a, b) => size(b) - size(a));
    for (const key of keys) {
      const codes = GROUPS[key] || [key];
      for (const code of codes) {
        if (REGION_BY_CODE[code]) out[code] = spec[key];
      }
    }
    return out;

    function size(k) { return GROUPS[k] ? GROUPS[k].length : 1; }
  }

  /**
   * Register a batch of species. Called by the js/species-*.js files.
   * Note `abund` rather than `range`: the entries keep `range` for the prose
   * description of where the bird lives, which is what a reader wants.
   */
  Birdex.addSpecies = function (list) {
    for (const s of list) {
      s.abund = expandRange(s.r);
      s.seasonByRegion = s.sr || {};
      s.season = s.sn || 'y';
      s.num = SPECIES.length + 1;
      s.peak = Object.keys(s.abund).reduce((m, code) => Math.max(m, s.abund[code]), 0);
      s.globalTier = tierFor(ABUNDANCE[s.peak].pct);
      s.points = s.globalTier.pts;
      s.searchKey = (s.n + ' ' + s.sci + ' ' + s.fam).toLowerCase();
      SPECIES.push(s);
      BY_ID[s.id] = s;
    }
  };

  Birdex.all = function () { return SPECIES; };
  Birdex.get = function (id) { return BY_ID[id]; };
  Birdex.count = function () { return SPECIES.length; };
  Birdex.regions = REGIONS;
  Birdex.region = function (code) { return REGION_BY_CODE[code] || null; };
  Birdex.tiers = TIERS;
  Birdex.abundance = ABUNDANCE;
  Birdex.seasons = SEASONS;

  function tierFor(pct) {
    for (const t of TIERS) if (pct >= t.min) return t;
    return TIERS[TIERS.length - 1];
  }
  Birdex.tierFor = tierFor;

  /* ------------------------------------------------------------------ */
  /* Where am I?                                                         */
  /* ------------------------------------------------------------------ */

  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371, toRad = Math.PI / 180;
    const dLat = (lat2 - lat1) * toRad, dLon = (lon2 - lon1) * toRad;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  }
  Birdex.distanceKm = haversine;

  /**
   * Coordinates -> region. Inside a box wins; ties go to the nearest
   * centre. Outside every box we still accept the nearest region within
   * 1200 km (so the Yucatán or Sicily resolve sensibly) and mark the
   * result approximate. Beyond that we admit we have no data.
   */
  Birdex.regionAt = function (lat, lng) {
    const inside = REGIONS.filter(r =>
      lat >= r.box[0] && lat <= r.box[2] && lng >= r.box[1] && lng <= r.box[3]);
    if (inside.length) {
      inside.sort((a, b) => haversine(lat, lng, a.c[0], a.c[1]) - haversine(lat, lng, b.c[0], b.c[1]));
      return { region: inside[0], exact: true, km: Math.round(haversine(lat, lng, inside[0].c[0], inside[0].c[1])) };
    }
    let best = null, bestKm = Infinity;
    for (const r of REGIONS) {
      const km = haversine(lat, lng, r.c[0], r.c[1]);
      if (km < bestKm) { bestKm = km; best = r; }
    }
    if (bestKm <= 1200) return { region: best, exact: false, km: Math.round(bestKm) };
    return { region: null, exact: false, km: Math.round(bestKm), nearest: best };
  };

  /* ------------------------------------------------------------------ */
  /* How rare is it, here, now?                                          */
  /* ------------------------------------------------------------------ */

  /** The season code that applies to this species in this region. */
  Birdex.seasonIn = function (sp, code) {
    if (!code) return sp.season;
    if (sp.seasonByRegion[code]) return sp.seasonByRegion[code];
    for (const key in sp.seasonByRegion) {
      const codes = GROUPS[key];
      if (codes && codes.indexOf(code) !== -1) return sp.seasonByRegion[key];
    }
    return sp.season;
  };

  Birdex.inSeason = function (sp, code, month) {
    const s = SEASONS[Birdex.seasonIn(sp, code)] || SEASONS.y;
    return s.months.indexOf(month) !== -1;
  };

  /**
   * Odds of running into this bird in this region this month.
   *
   * Out of season is not the same as absent: a wintering warbler in July
   * is a genuine (if unlikely) find, so the odds fall through the floor
   * rather than to zero, and the tier jumps accordingly. That is what
   * makes an off-season sighting feel like a trophy in the dex.
   */
  Birdex.rarity = function (sp, code, month) {
    month = month || (new Date().getMonth() + 1);
    const level = code == null ? null : sp.abund[code];

    if (level == null) {
      return {
        present: false, offRange: true, level: null, pct: 0,
        tier: OFF_RANGE, label: 'Not recorded here',
        detail: 'No records for this region — a sighting here would be exceptional.',
        season: SEASONS[sp.season], inSeason: false
      };
    }

    const seasonCode = Birdex.seasonIn(sp, code);
    const season = SEASONS[seasonCode] || SEASONS.y;
    const on = season.months.indexOf(month) !== -1;
    const base = ABUNDANCE[level];
    const pct = on ? base.pct : Math.max(0.15, base.pct * 0.04);
    const tier = tierFor(pct);

    return {
      present: true, offRange: false, level, pct, tier, season, inSeason: on,
      label: on ? base.label : base.label + ' (out of season)',
      detail: on
        ? oddsSentence(pct)
        : season.note + ' Right now it would be well out of season here.'
    };
  };

  function oddsSentence(pct) {
    if (pct >= 60) return 'Hard to miss — expect one on most outings.';
    if (pct >= 32) return 'You should find one on a typical morning out.';
    if (pct >= 14) return 'Turns up regularly if you are looking for it.';
    if (pct >= 5)  return 'Worth a deliberate search; not on every trip.';
    if (pct >= 1.5) return 'A good find. Right habitat, right time, some luck.';
    if (pct >= 0.4) return 'A rare bird here. Most local birders would come look.';
    return 'Exceptional. This is the kind of record that gets written up.';
  }

  /**
   * Every species recorded in a region, best odds first.
   * `month` filters nothing — out-of-season birds still belong to the
   * region, they just sort to the bottom with a longer-odds tier.
   */
  Birdex.speciesForRegion = function (code, month) {
    return SPECIES
      .filter(sp => sp.abund[code] != null)
      .map(sp => ({ sp, rarity: Birdex.rarity(sp, code, month) }))
      .sort((a, b) => b.rarity.pct - a.rarity.pct || a.sp.n.localeCompare(b.sp.n));
  };

  /**
   * Ranked suggestions for "what did I just photograph?" near a place.
   * With no region we have nothing to rank on, so fall back to A-Z and
   * report no rarity rather than labelling every bird off-range.
   */
  Birdex.suggestions = function (code, month, limit) {
    if (code) return Birdex.speciesForRegion(code, month).slice(0, limit || 24);
    return SPECIES.slice()
      .sort((a, b) => a.n.localeCompare(b.n))
      .slice(0, limit || 24)
      .map(sp => ({ sp, rarity: null }));
  };

  /* ------------------------------------------------------------------ */
  /* Small shared helpers                                                */
  /* ------------------------------------------------------------------ */

  Birdex.escape = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  };

  Birdex.fmtDate = function (ts) {
    return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  Birdex.fmtTime = function (ts) {
    return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  };

  Birdex.fmtDayKey = function (ts) {
    const d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  /** Ranks: a birder's progress bar. Thresholds are dex points. */
  const RANKS = [
    { min: 0,     name: 'Fledgling' },
    { min: 150,   name: 'Backyard Watcher' },
    { min: 500,   name: 'Field Birder' },
    { min: 1200,  name: 'Trail Scout' },
    { min: 2500,  name: 'Patch Lister' },
    { min: 5000,  name: 'County Regular' },
    { min: 9000,  name: 'Ornithologist' },
    { min: 16000, name: 'Dex Master' }
  ];
  Birdex.ranks = RANKS;
  Birdex.rankFor = function (points) {
    let cur = RANKS[0], next = null;
    for (let i = 0; i < RANKS.length; i++) {
      if (points >= RANKS[i].min) { cur = RANKS[i]; next = RANKS[i + 1] || null; }
    }
    const span = next ? next.min - cur.min : 1;
    const into = next ? points - cur.min : 1;
    return { rank: cur, next, progress: next ? Math.min(1, into / span) : 1 };
  };

})(window);
