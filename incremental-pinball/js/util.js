/* =========================================================================
 * TOWER OF CHIPS — shared helpers
 * Everything hangs off one global (`IP`) so the files below can be plain
 * classic scripts: they load fine from file:// which is how tests/ai-tester
 * drives the game.
 * ====================================================================== */
(function (global) {
  'use strict';

  const IP = global.IP || (global.IP = {});

  /* ---------------------------------------------------------------- DOM */
  const $ = (id) => document.getElementById(id);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /** Tiny hyperscript. el('div.card', {onclick}, 'text', childNode, …) */
  function el(spec, attrs, ...kids) {
    const m = /^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i.exec(spec) || [];
    const node = document.createElement(m[1] || 'div');
    (m[2] || '').split(/(?=[.#])/).forEach((tok) => {
      if (!tok) return;
      if (tok[0] === '#') node.id = tok.slice(1);
      else node.classList.add(tok.slice(1));
    });
    if (attrs && attrs.nodeType) { kids.unshift(attrs); attrs = null; }
    if (typeof attrs === 'string') { kids.unshift(attrs); attrs = null; }
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      // Custom properties (--accent) need setProperty; Object.assign drops them.
      if (k === 'style' && typeof v === 'object') {
        for (const sk in v) {
          if (sk.startsWith('--')) node.style.setProperty(sk, v[sk]);
          else node.style[sk] = v[sk];
        }
      }
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (k === 'html') node.innerHTML = v;
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(3)) {
      if (kid == null || kid === false) continue;
      node.appendChild(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return node;
  }

  /* --------------------------------------------------------------- math */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
  const TAU = Math.PI * 2;

  /** Frame-rate independent exponential approach. `k` ≈ how snappy. */
  const approach = (cur, target, k, dt) => cur + (target - cur) * (1 - Math.exp(-k * dt));

  const norm = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
  const angLerp = (a, b, t) => a + norm(b - a) * t;

  const easeOutBack = (t) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2);
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  /* ----------------------------------------------------------- vector 2 */
  const v2 = (x, y) => ({ x: x || 0, y: y || 0 });
  const vadd = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
  const vsub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
  const vmul = (a, s) => ({ x: a.x * s, y: a.y * s });
  const vdot = (a, b) => a.x * b.x + a.y * b.y;
  const vcross = (a, b) => a.x * b.y - a.y * b.x;
  const vlen = (a) => Math.hypot(a.x, a.y);
  const vlen2 = (a) => a.x * a.x + a.y * a.y;
  const vdist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const vdist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  function vnorm(a) { const l = Math.hypot(a.x, a.y) || 1; return { x: a.x / l, y: a.y / l }; }
  const vperp = (a) => ({ x: -a.y, y: a.x });
  const vrot = (a, r) => { const c = Math.cos(r), s = Math.sin(r); return { x: a.x * c - a.y * s, y: a.x * s + a.y * c }; };

  /** Closest point on segment ab to p, plus the parametric t. */
  function closestOnSeg(p, a, b) {
    const abx = b.x - a.x, aby = b.y - a.y;
    const d2 = abx * abx + aby * aby;
    let t = d2 === 0 ? 0 : ((p.x - a.x) * abx + (p.y - a.y) * aby) / d2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return { x: a.x + abx * t, y: a.y + aby * t, t };
  }

  /* ---------------------------------------------------------------- rng */
  /** Deterministic small-state PRNG (mulberry32) — used for seeded shops. */
  function mkRng(seed) {
    let a = (seed >>> 0) || 1;
    const f = function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.int = (n) => Math.floor(f() * n);
    f.range = (lo, hi) => lo + f() * (hi - lo);
    f.pick = (arr) => arr[Math.floor(f() * arr.length)];
    f.chance = (p) => f() < p;
    return f;
  }
  const rnd = mkRng((Math.random() * 1e9) | 0);
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);
  const randInt = (lo, hi) => Math.floor(lo + Math.random() * (hi - lo + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const chance = (p) => Math.random() < p;

  /** Fisher–Yates using a supplied rng (defaults to Math.random). */
  function shuffle(arr, rng) {
    const r = rng || Math.random;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /* ------------------------------------------------------------ numbers */
  const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

  /** 12345 → "12.3K". Incremental games live and die on this function. */
  function fmt(n, digits) {
    if (n == null || !isFinite(n)) return '0';
    const neg = n < 0; n = Math.abs(n);
    if (n < 1000) {
      const d = digits != null ? digits : (n < 10 && n % 1 !== 0 ? 1 : 0);
      return (neg ? '-' : '') + (n % 1 === 0 ? n.toString() : n.toFixed(d));
    }
    let tier = Math.floor(Math.log10(n) / 3);
    if (tier >= SUFFIX.length) tier = SUFFIX.length - 1;
    const scaled = n / Math.pow(1000, tier);
    const d = digits != null ? digits : (scaled < 10 ? 2 : scaled < 100 ? 1 : 0);
    return (neg ? '-' : '') + scaled.toFixed(d).replace(/\.0+$/, '') + SUFFIX[tier];
  }

  /** Long form with thousands separators — used for the big score readout. */
  function fmtFull(n) {
    return Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h) return `${h}h ${m}m`;
    if (m) return `${m}m ${s}s`;
    return `${s}s`;
  }

  const ordinal = (n) => {
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  /* ------------------------------------------------------------ storage */
  function saveJSON(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); return true; }
    catch (e) { return false; }
  }
  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const v = JSON.parse(raw);
      return v == null ? fallback : v;
    } catch (e) { return fallback; }
  }
  function dropKey(key) { try { localStorage.removeItem(key); } catch (e) { /* private mode */ } }

  /* --------------------------------------------------------------- misc */
  let _uid = 1;
  const uid = (p) => (p || 'x') + (_uid++).toString(36) + Math.floor(Math.random() * 1296).toString(36);
  const now = () => (global.performance && performance.now ? performance.now() : Date.now());
  const nowSec = () => Date.now() / 1000;

  /** Shallow deep-ish clone good enough for plain save data. */
  const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));

  /** Colour helpers: hex → rgba string with alpha. */
  function rgba(hex, a) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  function shade(hex, amt) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    const f = (v) => clamp(Math.round(v + 255 * amt), 0, 255);
    return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }
  function mixHex(a, b, t) {
    const pa = parseInt(a.replace('#', ''), 16), pb = parseInt(b.replace('#', ''), 16);
    const r = Math.round(lerp((pa >> 16) & 255, (pb >> 16) & 255, t));
    const g = Math.round(lerp((pa >> 8) & 255, (pb >> 8) & 255, t));
    const bl = Math.round(lerp(pa & 255, pb & 255, t));
    return `rgb(${r},${g},${bl})`;
  }

  const isTouch = () => ('ontouchstart' in global) || (navigator.maxTouchPoints || 0) > 0;

  IP.util = {
    $, $$, el,
    clamp, lerp, invLerp, approach, norm, angLerp, TAU,
    easeOutBack, easeOutCubic, easeInOut,
    v2, vadd, vsub, vmul, vdot, vcross, vlen, vlen2, vdist, vdist2, vnorm, vperp, vrot, closestOnSeg,
    mkRng, rnd, rand, randInt, pick, chance, shuffle,
    fmt, fmtFull, fmtTime, ordinal,
    saveJSON, loadJSON, dropKey,
    uid, now, nowSec, clone, rgba, shade, mixHex, isTouch,
  };
})(window);
