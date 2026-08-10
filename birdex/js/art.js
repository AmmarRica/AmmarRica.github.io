/* =========================================================================
 * Dex art.
 *
 * A dex needs a picture for every entry, including the ones you have never
 * photographed. Shipping 130 bird photos is not an option in a static app,
 * so each species carries a body plan (`shape`) and a four-colour palette,
 * and the portrait is assembled from parts: body, wing, neck, head, bill,
 * tail, legs. Same drawing code for every bird, different proportions.
 *
 * Everything is drawn facing right in a 120x100 box.
 * ====================================================================== */
(function (global) {
  'use strict';

  const Birdex = global.Birdex = global.Birdex || {};
  const art = Birdex.art = {};

  /* Sensible perched songbird. Every shape below is a diff against this. */
  const BASE = {
    bx: 54, by: 56, brx: 23, bry: 16, brot: -14,
    nx: 20, ny: -20, hr: 12,
    crest: null,
    bill: { len: 10, dep: 5, curve: 0, type: 'cone' },
    tail: { len: 26, w: 9, ang: 170, fork: 0 },
    legs: { len: 15, w: 2.6, type: 'perch' },
    wing: { rx: 15, ry: 8, dx: -3, dy: 1, rot: -16 },
    eye: 2.3,
    water: false, fly: false, perch: true
  };

  /* Body plans. Only the differences from BASE are listed. */
  const SHAPES = {
    songbird: {},
    sparrow:  { brx: 22, bry: 15, bill: { len: 8, dep: 6, type: 'cone' }, tail: { len: 25, w: 8, ang: 172 } },
    finch:    { brx: 21, bry: 16, hr: 12.5, bill: { len: 8, dep: 7, type: 'cone' }, tail: { len: 21, w: 9, ang: 172, fork: 4 } },
    warbler:  { brx: 19, bry: 12, hr: 10, nx: 18, ny: -16, bill: { len: 8, dep: 3, type: 'needle' }, tail: { len: 20, w: 6, ang: 172 }, wing: { rx: 12, ry: 6, dx: -3, dy: 1, rot: -16 }, eye: 2 },
    wren:     { brx: 19, bry: 14, hr: 10.5, nx: 17, ny: -15, bill: { len: 9, dep: 3, curve: 2, type: 'needle' }, tail: { len: 20, w: 7, ang: 232 }, wing: { rx: 12, ry: 7, dx: -2, dy: 1, rot: -14 } },
    thrush:   { brx: 25, bry: 18, hr: 13, nx: 22, ny: -22, bill: { len: 11, dep: 4, type: 'dagger' }, tail: { len: 27, w: 10, ang: 172 } },
    flycatcher: { brx: 21, bry: 15, brot: -30, hr: 12.5, nx: 15, ny: -24, bill: { len: 10, dep: 5, type: 'broad' }, tail: { len: 26, w: 8, ang: 190 }, crest: { type: 'shag', size: 5 } },
    corvid:   { brx: 30, bry: 20, hr: 15, nx: 27, ny: -24, bill: { len: 17, dep: 7, type: 'dagger' }, tail: { len: 34, w: 13, ang: 172 }, wing: { rx: 20, ry: 10, dx: -4, dy: 1, rot: -16 }, legs: { len: 16, w: 3, type: 'perch' } },
    jay:      { brx: 26, bry: 17, hr: 13.5, nx: 24, ny: -23, bill: { len: 13, dep: 6, type: 'dagger' }, tail: { len: 36, w: 11, ang: 174 }, crest: { type: 'point', size: 11 }, wing: { rx: 17, ry: 9, dx: -4, dy: 1, rot: -16 } },
    oriole:   { brx: 21, bry: 14, hr: 11.5, nx: 19, ny: -19, bill: { len: 12, dep: 4, type: 'needle' }, tail: { len: 24, w: 9, ang: 172 } },
    blackbird:{ brx: 25, bry: 16, hr: 12.5, nx: 23, ny: -21, bill: { len: 13, dep: 5, type: 'dagger' }, tail: { len: 30, w: 10, ang: 172 } },
    pigeon:   { brx: 28, bry: 19, brot: -10, hr: 11, nx: 25, ny: -22,
      bill: { len: 8, dep: 4, type: 'cone' }, tail: { len: 28, w: 12, ang: 176 },
      wing: { rx: 19, ry: 11, dx: -3, dy: 1, rot: -12 }, legs: { len: 12, w: 3, type: 'perch' } },

    woodpecker: { bx: 46, by: 54, brx: 15, bry: 26, brot: 0, nx: 12, ny: -28, hr: 12,
      bill: { len: 13, dep: 5, type: 'chisel' }, tail: { len: 24, w: 10, ang: 100 },
      wing: { rx: 10, ry: 18, dx: -2, dy: 2, rot: 4 }, legs: { len: 9, w: 2.6, type: 'cling' } },

    hummingbird: { bx: 56, by: 52, brx: 17, bry: 11, brot: -18, nx: 15, ny: -12, hr: 9,
      bill: { len: 22, dep: 2.4, type: 'needle' }, tail: { len: 16, w: 8, ang: 176, fork: 3 },
      wing: { rx: 20, ry: 5, dx: -4, dy: -6, rot: -44 }, legs: { len: 0, w: 0, type: 'none' }, eye: 1.9 },

    swallow: { fly: true, bx: 56, by: 50, brx: 20, bry: 10, brot: -8, nx: 18, ny: -8, hr: 9.5,
      bill: { len: 5, dep: 3, type: 'broad' }, tail: { len: 26, w: 10, ang: 176, fork: 12 },
      wingspan: { len: 42, w: 9, up: -26, sweep: 26 }, legs: { len: 0, w: 0, type: 'none' }, eye: 2 },
    swift: { fly: true, bx: 56, by: 50, brx: 21, bry: 8.5, brot: -6, nx: 18, ny: -6, hr: 8.5,
      bill: { len: 4, dep: 2.5, type: 'broad' }, tail: { len: 15, w: 8, ang: 176, fork: 4 },
      wingspan: { len: 46, w: 11, up: -14, sweep: 30 }, legs: { len: 0, w: 0, type: 'none' }, eye: 1.9 },
    vulture: { fly: true, bx: 56, by: 54, brx: 20, bry: 11, brot: -4, nx: 19, ny: -9, hr: 9,
      bill: { len: 9, dep: 5, type: 'hook' }, tail: { len: 18, w: 16, ang: 178 },
      wingspan: { len: 54, w: 19, up: -22, sweep: 4 }, legs: { len: 0, w: 0, type: 'none' } },
    tern: { fly: true, bx: 56, by: 52, brx: 20, bry: 10, brot: -6, nx: 18, ny: -9, hr: 9,
      bill: { len: 14, dep: 3.5, type: 'dagger' }, tail: { len: 22, w: 9, ang: 176, fork: 9 },
      wingspan: { len: 48, w: 8, up: -22, sweep: 20 }, legs: { len: 0, w: 0, type: 'none' } },

    raptor: { brx: 26, bry: 20, brot: -16, hr: 14, nx: 22, ny: -24,
      bill: { len: 9, dep: 7, type: 'hook' }, tail: { len: 30, w: 13, ang: 178 },
      wing: { rx: 18, ry: 12, dx: -4, dy: 1, rot: -14 }, legs: { len: 14, w: 3.6, type: 'perch' }, eye: 2.6 },
    eagle: { brx: 31, bry: 24, brot: -14, hr: 16, nx: 26, ny: -27,
      bill: { len: 13, dep: 9, type: 'hook' }, tail: { len: 30, w: 16, ang: 178 },
      wing: { rx: 22, ry: 14, dx: -4, dy: 1, rot: -14 }, legs: { len: 14, w: 4.2, type: 'perch' }, eye: 2.8 },
    falcon: { brx: 24, bry: 17, brot: -22, hr: 13, nx: 19, ny: -24,
      bill: { len: 8, dep: 6, type: 'hook' }, tail: { len: 28, w: 10, ang: 184 },
      wing: { rx: 17, ry: 9, dx: -4, dy: 0, rot: -22 }, legs: { len: 13, w: 3, type: 'perch' }, eye: 2.5 },
    owl: { bx: 54, by: 60, brx: 24, bry: 22, brot: 0, nx: 6, ny: -28, hr: 18,
      bill: { len: 6, dep: 5, type: 'hook' }, tail: { len: 16, w: 13, ang: 200 },
      wing: { rx: 16, ry: 16, dx: -3, dy: 2, rot: 0 }, legs: { len: 10, w: 4, type: 'perch' }, eye: 3.4, owlEyes: true },

    duck: { bx: 54, by: 56, brx: 28, bry: 15, brot: -6, nx: 24, ny: -18, hr: 12,
      bill: { len: 15, dep: 7, type: 'spoon' }, tail: { len: 18, w: 9, ang: 186 },
      wing: { rx: 18, ry: 8, dx: -2, dy: 0, rot: -8 }, legs: { len: 0, w: 0, type: 'none' }, water: true },
    goose: { bx: 52, by: 60, brx: 30, bry: 16, brot: -5, nx: 26, ny: -30, hr: 11,
      neck: { w: 9 }, bill: { len: 12, dep: 6, type: 'spoon' }, tail: { len: 16, w: 9, ang: 188 },
      wing: { rx: 19, ry: 9, dx: -2, dy: 0, rot: -8 }, legs: { len: 0, w: 0, type: 'none' }, water: true },
    swan: { bx: 50, by: 64, brx: 31, bry: 17, brot: -4, nx: 30, ny: -40, hr: 10,
      neck: { w: 8, curve: 14 }, bill: { len: 12, dep: 6, type: 'spoon' }, tail: { len: 14, w: 9, ang: 188 },
      wing: { rx: 20, ry: 10, dx: -2, dy: -1, rot: -8 }, legs: { len: 0, w: 0, type: 'none' }, water: true },
    grebe: { bx: 54, by: 60, brx: 25, bry: 13, brot: -6, nx: 22, ny: -20, hr: 11,
      neck: { w: 8 }, bill: { len: 12, dep: 4, type: 'dagger' }, tail: { len: 8, w: 7, ang: 190 },
      wing: { rx: 15, ry: 7, dx: -2, dy: 0, rot: -8 }, legs: { len: 0, w: 0, type: 'none' }, water: true },
    rail: { bx: 54, by: 58, brx: 25, bry: 15, brot: -8, nx: 22, ny: -22, hr: 11,
      neck: { w: 8 }, bill: { len: 11, dep: 5, type: 'cone' }, tail: { len: 12, w: 8, ang: 196 },
      wing: { rx: 16, ry: 8, dx: -2, dy: 0, rot: -8 }, legs: { len: 0, w: 0, type: 'none' }, water: true },
    cormorant: { bx: 52, by: 62, brx: 28, bry: 14, brot: -6, nx: 27, ny: -34, hr: 10,
      neck: { w: 8 }, bill: { len: 15, dep: 5, type: 'hook' }, tail: { len: 22, w: 8, ang: 192 },
      wing: { rx: 18, ry: 8, dx: -2, dy: 0, rot: -8 }, legs: { len: 0, w: 0, type: 'none' }, water: true },
    pelican: { bx: 50, by: 60, brx: 32, bry: 18, brot: -5, nx: 28, ny: -30, hr: 12,
      neck: { w: 11 }, bill: { len: 30, dep: 12, type: 'pouch' }, tail: { len: 16, w: 10, ang: 190 },
      wing: { rx: 22, ry: 11, dx: -2, dy: 0, rot: -8 }, legs: { len: 0, w: 0, type: 'none' }, water: true },
    alcid: { bx: 54, by: 58, brx: 21, bry: 17, brot: -14, nx: 18, ny: -20, hr: 12,
      bill: { len: 12, dep: 12, type: 'wedge' }, tail: { len: 12, w: 8, ang: 190 },
      wing: { rx: 13, ry: 8, dx: -3, dy: 1, rot: -10 }, legs: { len: 8, w: 3, type: 'perch' } },

    heron: { bx: 56, by: 46, brx: 24, bry: 14, brot: -6, nx: 22, ny: -30, hr: 10,
      neck: { w: 7, kink: true }, bill: { len: 22, dep: 4.5, type: 'dagger' }, tail: { len: 16, w: 9, ang: 190 },
      wing: { rx: 18, ry: 10, dx: -2, dy: 0, rot: -8 }, legs: { len: 40, w: 2.6, type: 'wade' } },
    crane: { bx: 54, by: 44, brx: 26, bry: 15, brot: -4, nx: 24, ny: -32, hr: 9.5,
      neck: { w: 7 }, bill: { len: 18, dep: 4, type: 'dagger' }, tail: { len: 18, w: 12, ang: 194 },
      wing: { rx: 19, ry: 11, dx: -3, dy: 0, rot: -8 }, legs: { len: 42, w: 2.8, type: 'wade' } },
    stork: { bx: 54, by: 46, brx: 26, bry: 16, brot: -5, nx: 24, ny: -30, hr: 10,
      neck: { w: 8 }, bill: { len: 24, dep: 6, type: 'dagger' }, tail: { len: 16, w: 10, ang: 192 },
      wing: { rx: 19, ry: 11, dx: -3, dy: 0, rot: -8 }, legs: { len: 40, w: 3, type: 'wade' } },
    spoonbill: { bx: 54, by: 46, brx: 25, bry: 15, brot: -5, nx: 23, ny: -29, hr: 10,
      neck: { w: 8 }, bill: { len: 26, dep: 5, type: 'spatula' }, tail: { len: 16, w: 9, ang: 192 },
      wing: { rx: 18, ry: 10, dx: -3, dy: 0, rot: -8 }, legs: { len: 38, w: 2.8, type: 'wade' } },
    shorebird: { bx: 54, by: 50, brx: 22, bry: 13, brot: -8, nx: 19, ny: -20, hr: 9.5,
      neck: { w: 6 }, bill: { len: 20, dep: 3, type: 'needle' }, tail: { len: 14, w: 8, ang: 190 },
      wing: { rx: 16, ry: 8, dx: -2, dy: 0, rot: -8 }, legs: { len: 26, w: 2.2, type: 'wade' } },
    plover: { bx: 54, by: 52, brx: 22, bry: 15, brot: -10, nx: 18, ny: -20, hr: 11,
      bill: { len: 9, dep: 4, type: 'dagger' }, tail: { len: 14, w: 8, ang: 190 },
      wing: { rx: 16, ry: 9, dx: -2, dy: 0, rot: -8 }, legs: { len: 20, w: 2.4, type: 'wade' } },
    gull: { bx: 54, by: 54, brx: 27, bry: 15, brot: -8, nx: 24, ny: -24, hr: 11.5,
      bill: { len: 14, dep: 5, type: 'gull' }, tail: { len: 18, w: 10, ang: 190 },
      wing: { rx: 19, ry: 9, dx: -3, dy: 0, rot: -10 }, legs: { len: 14, w: 2.6, type: 'wade' } },
    kingfisher: { bx: 54, by: 58, brx: 20, bry: 15, brot: -16, nx: 17, ny: -21, hr: 13,
      bill: { len: 22, dep: 5, type: 'dagger' }, tail: { len: 14, w: 8, ang: 186 },
      wing: { rx: 13, ry: 8, dx: -3, dy: 1, rot: -12 }, legs: { len: 8, w: 2.4, type: 'perch' },
      crest: { type: 'shag', size: 5 } },
    gamebird: { bx: 52, by: 58, brx: 30, bry: 20, brot: -8, nx: 26, ny: -26, hr: 10,
      neck: { w: 8 }, bill: { len: 8, dep: 5, type: 'cone' }, tail: { len: 32, w: 18, ang: 196 },
      wing: { rx: 20, ry: 12, dx: -3, dy: 1, rot: -8 }, legs: { len: 18, w: 3.4, type: 'wade' } },
    quail: { bx: 54, by: 60, brx: 24, bry: 17, brot: -8, nx: 21, ny: -20, hr: 10.5,
      bill: { len: 7, dep: 5, type: 'cone' }, tail: { len: 16, w: 10, ang: 194 },
      wing: { rx: 16, ry: 10, dx: -3, dy: 1, rot: -8 }, legs: { len: 12, w: 2.8, type: 'wade' },
      crest: { type: 'plume', size: 12 } },
    roadrunner: { bx: 50, by: 54, brx: 24, bry: 13, brot: -10, nx: 21, ny: -20, hr: 11,
      bill: { len: 16, dep: 5, type: 'dagger' }, tail: { len: 40, w: 11, ang: 196 },
      wing: { rx: 16, ry: 8, dx: -3, dy: 1, rot: -8 }, legs: { len: 20, w: 3, type: 'wade' },
      crest: { type: 'shag', size: 7 } },
    cuckoo: { brx: 24, bry: 13, brot: -12, hr: 11, nx: 21, ny: -18,
      bill: { len: 12, dep: 4, curve: 2, type: 'dagger' }, tail: { len: 36, w: 8, ang: 178 },
      wing: { rx: 17, ry: 7, dx: -3, dy: 0, rot: -14 } },
    trogon: { bx: 52, by: 50, brx: 21, bry: 17, brot: -6, nx: 17, ny: -22, hr: 12.5,
      bill: { len: 8, dep: 6, type: 'cone' }, tail: { len: 34, w: 11, ang: 196 },
      wing: { rx: 14, ry: 9, dx: -3, dy: 1, rot: -6 }, legs: { len: 8, w: 2.4, type: 'perch' } },
    beeeater: { brx: 21, bry: 12, brot: -14, hr: 11, nx: 18, ny: -18,
      bill: { len: 18, dep: 4, curve: 2, type: 'dagger' }, tail: { len: 26, w: 6, ang: 176 },
      wing: { rx: 16, ry: 7, dx: -3, dy: 0, rot: -16 } },
    hoopoe: { brx: 23, bry: 14, brot: -12, hr: 11, nx: 20, ny: -20,
      bill: { len: 20, dep: 3.4, curve: 3, type: 'needle' }, tail: { len: 24, w: 9, ang: 180 },
      wing: { rx: 16, ry: 8, dx: -3, dy: 0, rot: -14 }, crest: { type: 'fan', size: 13 } }
  };

  function plan(shape) {
    const s = SHAPES[shape] || {};
    const p = Object.assign({}, BASE, s);
    p.bill = Object.assign({}, BASE.bill, s.bill || {});
    p.tail = Object.assign({}, BASE.tail, s.tail || {});
    p.legs = Object.assign({}, BASE.legs, s.legs || {});
    p.wing = Object.assign({}, BASE.wing, s.wing || {});
    p.crest = s.crest || null;
    p.neck = s.neck || null;
    return p;
  }

  /* -------------------------------------------------------------- */
  /* Small geometry helpers                                          */
  /* -------------------------------------------------------------- */

  const rad = d => d * Math.PI / 180;
  const pt = (x, y) => x.toFixed(1) + ',' + y.toFixed(1);

  function poly(points, fill, extra) {
    return '<polygon points="' + points.map(p => pt(p[0], p[1])).join(' ') +
      '" fill="' + fill + '"' + (extra || '') + '/>';
  }

  function ellipse(cx, cy, rx, ry, rot, fill, extra) {
    return '<ellipse cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) +
      '" rx="' + rx.toFixed(1) + '" ry="' + ry.toFixed(1) + '"' +
      (rot ? ' transform="rotate(' + rot.toFixed(1) + ' ' + cx.toFixed(1) + ' ' + cy.toFixed(1) + ')"' : '') +
      ' fill="' + fill + '"' + (extra || '') + '/>';
  }

  /** Mix a hex colour towards white (t > 0) or black (t < 0). */
  function shade(hex, t) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const to = t > 0 ? 255 : 0, k = Math.abs(t);
    r = Math.round(r + (to - r) * k);
    g = Math.round(g + (to - g) * k);
    b = Math.round(b + (to - b) * k);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  art.shade = shade;

  /** Rough perceived luminance, for deciding what an eye should sit on. */
  function lum(hex) {
    const n = parseInt(hex.slice(1), 16);
    return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  }
  art.lum = lum;

  /* -------------------------------------------------------------- */
  /* Parts                                                           */
  /* -------------------------------------------------------------- */

  function billShape(hx, hy, hr, bill, color) {
    const x0 = hx + hr * 0.7;
    const d = bill.dep, L = bill.len, cv = bill.curve || 0;
    const t = bill.type;

    if (t === 'spoon') {                       // duck / goose: blunt and broad
      return '<path d="M' + pt(x0, hy - d / 2) + ' L' + pt(x0 + L - d / 2, hy - d / 2) +
        ' A' + (d / 2) + ',' + (d / 2) + ' 0 0 1 ' + pt(x0 + L - d / 2, hy + d / 2) +
        ' L' + pt(x0, hy + d / 2) + ' Z" fill="' + color + '"/>';
    }
    if (t === 'pouch') {                       // pelican: bill plus throat pouch
      return '<path d="M' + pt(x0, hy - d / 3) + ' L' + pt(x0 + L, hy + 2) +
        ' L' + pt(x0 + L * 0.55, hy + d) + ' Q' + pt(x0 + L * 0.2, hy + d * 0.9) + ' ' + pt(x0, hy + d / 3) +
        ' Z" fill="' + color + '"/>';
    }
    if (t === 'spatula') {                     // spoonbill
      return '<path d="M' + pt(x0, hy - d / 2) + ' L' + pt(x0 + L * 0.7, hy - d * 0.35) +
        ' L' + pt(x0 + L * 0.7, hy + d * 0.35) + ' L' + pt(x0, hy + d / 2) + ' Z" fill="' + color + '"/>' +
        ellipse(x0 + L * 0.85, hy, L * 0.2, d * 1.1, 0, color);
    }
    if (t === 'wedge') {                       // puffin: deep triangular plate
      return poly([[x0, hy - d / 2], [x0 + L, hy - d * 0.15], [x0 + L, hy + d * 0.25], [x0, hy + d / 2]], color);
    }
    if (t === 'hook') {
      return poly([[x0, hy - d / 2], [x0 + L, hy - d * 0.1], [x0 + L * 0.55, hy + d * 0.45], [x0, hy + d / 2]], color) +
        poly([[x0 + L * 0.75, hy - d * 0.3], [x0 + L + 1.5, hy + d * 0.2], [x0 + L * 0.6, hy + d * 0.3]], color);
    }
    if (t === 'gull') {                        // straight with a gonydeal bulge
      return poly([[x0, hy - d / 2], [x0 + L, hy - d * 0.15], [x0 + L, hy + d * 0.25],
        [x0 + L * 0.6, hy + d * 0.55], [x0, hy + d / 2]], color);
    }
    if (t === 'chisel') {
      return poly([[x0, hy - d / 2], [x0 + L, hy - d * 0.18], [x0 + L, hy + d * 0.18], [x0, hy + d / 2]], color);
    }
    if (t === 'broad') {
      return poly([[x0 - 1, hy - d / 2], [x0 + L, hy], [x0 - 1, hy + d / 2]], color);
    }
    if (cv) {                                  // decurved: bend the tip downwards
      return '<path d="M' + pt(x0, hy - d / 2) + ' Q' + pt(x0 + L * 0.6, hy - d * 0.1 + cv * 0.6) + ' ' +
        pt(x0 + L, hy + cv) + ' Q' + pt(x0 + L * 0.55, hy + d * 0.5 + cv * 0.4) + ' ' +
        pt(x0, hy + d / 2) + ' Z" fill="' + color + '"/>';
    }
    /* cone / dagger / needle all share one triangle, just proportioned differently */
    return poly([[x0, hy - d / 2], [x0 + L, hy], [x0, hy + d / 2]], color);
  }

  function crestShape(hx, hy, hr, crest, color) {
    const s = crest.size;
    if (crest.type === 'point') {
      return poly([[hx - hr * 0.5, hy - hr * 0.75], [hx - hr * 0.2, hy - hr - s], [hx + hr * 0.45, hy - hr * 0.7]], color);
    }
    if (crest.type === 'shag') {
      return poly([[hx - hr * 0.9, hy - hr * 0.4], [hx - hr - s, hy - hr * 0.9], [hx - hr * 0.3, hy - hr * 0.95]], color);
    }
    if (crest.type === 'plume') {              // quail: forward-curling teardrop
      return '<path d="M' + pt(hx + hr * 0.1, hy - hr * 0.9) + ' Q' + pt(hx + hr * 0.1, hy - hr - s) + ' ' +
        pt(hx + hr * 0.9, hy - hr - s * 0.75) + ' Q' + pt(hx + hr * 0.35, hy - hr - s * 0.35) + ' ' +
        pt(hx + hr * 0.55, hy - hr * 0.75) + ' Z" fill="' + color + '"/>';
    }
    if (crest.type === 'fan') {
      let d = 'M' + pt(hx - hr * 0.6, hy - hr * 0.6);
      for (let i = 0; i <= 5; i++) {
        const a = rad(-160 + i * 26);
        d += ' L' + pt(hx + (hr + s) * Math.cos(a) * 0.9, hy + (hr + s) * Math.sin(a));
      }
      d += ' L' + pt(hx + hr * 0.6, hy - hr * 0.6) + ' Z';
      return '<path d="' + d + '" fill="' + color + '"/>';
    }
    return '';
  }

  function tailShape(p, color) {
    const a = rad(p.tail.ang);
    const bx = p.bx + Math.cos(a) * p.brx * 0.75;
    const by = p.by + Math.sin(a) * p.bry * 0.75;
    const tx = p.bx + Math.cos(a) * (p.brx * 0.55 + p.tail.len);
    const ty = p.by + Math.sin(a) * (p.brx * 0.55 + p.tail.len);
    const nx = -Math.sin(a), ny = Math.cos(a);
    const w = p.tail.w / 2, f = p.tail.fork || 0;

    if (f > 0) {
      return poly([
        [bx + nx * w * 0.6, by + ny * w * 0.6],
        [tx + nx * w, ty + ny * w],
        [tx - Math.cos(a) * f, ty - Math.sin(a) * f],
        [tx - nx * w, ty - ny * w],
        [bx - nx * w * 0.6, by - ny * w * 0.6]
      ], color);
    }
    return poly([
      [bx + nx * w * 0.7, by + ny * w * 0.7],
      [tx + nx * w, ty + ny * w],
      [tx - nx * w, ty - ny * w],
      [bx - nx * w * 0.7, by - ny * w * 0.7]
    ], color);
  }

  function legShapes(p, color) {
    if (p.legs.type === 'none' || !p.legs.len) return '';
    /* Start inside the body so the legs emerge from it rather than hanging
     * off the bottom edge. */
    const y0 = p.by + p.bry * 0.45;
    const w = p.legs.w, L = p.legs.len;
    const line = (x1, y1, x2, y2, sw) =>
      '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) +
      '" y2="' + y2.toFixed(1) + '" stroke="' + color + '" stroke-width="' + sw +
      '" stroke-linecap="round"/>';

    if (p.legs.type === 'cling') {             // woodpecker: braced against a trunk
      return line(p.bx + 2, y0, p.bx - 7, y0 + L * 0.7, w) +
        line(p.bx - 7, y0 + L * 0.7, p.bx - 12, y0 + L * 0.55, w * 0.7);
    }

    const toe = Math.max(3, L * 0.28);
    let out = '';
    /* Two legs, slightly offset in depth: the far one thinner and paler-set. */
    [[-3.5, w * 0.85], [4.5, w]].forEach(([dx, sw]) => {
      const x = p.bx + dx + (p.legs.type === 'wade' ? 3 : 1);
      const foot = y0 + L;
      out += line(x, y0, x, foot, sw);
      /* Foot spans both ways, so it reads as a foot and not as a letter L. */
      out += line(x - toe * 0.55, foot, x + toe, foot, Math.max(1.5, sw * 0.65));
    });
    return out;
  }

  function neckShape(p, hx, hy, color) {
    const n = p.neck;
    if (!n) return '';
    const w = n.w / 2;
    const sx = p.bx + p.brx * 0.35, sy = p.by - p.bry * 0.35;
    if (n.kink) {                              // heron: folded S-neck
      return '<path d="M' + pt(sx, sy) + ' Q' + pt(sx - 4, (sy + hy) / 2) + ' ' + pt(hx - 2, hy + 2) +
        ' L' + pt(hx + w, hy + 4) + ' Q' + pt(sx + 8, (sy + hy) / 2) + ' ' + pt(sx + w * 2, sy + 3) +
        ' Z" fill="' + color + '"/>';
    }
    if (n.curve) {                             // swan: S-curve
      return '<path d="M' + pt(sx, sy) + ' Q' + pt(sx + n.curve + 6, (sy + hy) / 2) + ' ' + pt(hx - w, hy + 4) +
        ' L' + pt(hx + w, hy + 6) + ' Q' + pt(sx + n.curve - 4, (sy + hy) / 2 + 6) + ' ' + pt(sx + w * 2.2, sy + 4) +
        ' Z" fill="' + color + '"/>';
    }
    return poly([[sx - w, sy + 2], [hx - w * 0.9, hy + 2], [hx + w * 0.9, hy + 4], [sx + w * 1.6, sy + 5]], color);
  }

  function flyingWings(p, back, under) {
    const w = p.wingspan, y = p.by + w.up;
    let out = '';
    /* Far wing first so the near one overlaps it. */
    out += poly([[p.bx - 4, p.by - 4], [p.bx - w.len * 0.75, y - w.sweep * 0.5],
      [p.bx - w.len * 0.62, y - w.sweep * 0.5 + w.w], [p.bx - 2, p.by + 3]], shade(back, -0.18));
    out += poly([[p.bx + 2, p.by - 5], [p.bx + w.len * 0.55, y - w.sweep], [p.bx + w.len * 0.42, y - w.sweep + w.w],
      [p.bx + 4, p.by + 2]], back);
    return out;
  }

  /* -------------------------------------------------------------- */
  /* The portrait                                                    */
  /* -------------------------------------------------------------- */

  /**
   * Build the SVG innards for a species.
   * `mode`: 'colour' for a full portrait, 'locked' for an undiscovered
   * silhouette (one flat tone, no detail — the classic dex tease).
   */
  function body(sp, mode) {
    const p = plan(sp.shape);
    const locked = mode === 'locked';
    const c = sp.c || ['#7a828f', '#d8d5cc', '#8b929c', '#3a3f47'];

    const back = locked ? 'var(--dex-locked)' : c[0];
    const under = locked ? 'var(--dex-locked)' : c[1];
    const head = locked ? 'var(--dex-locked)' : c[2];
    const billC = locked ? 'var(--dex-locked)' : c[3];
    const legC = locked ? 'var(--dex-locked)' : shade(c[3], -0.15);
    /* An optional fifth colour paints the wing, for birds whose wing patch
     * is the field mark — a Red-winged Blackbird, an American Redstart. */
    const wingC = locked ? 'var(--dex-locked)' : (c[4] || shade(c[0], -0.22));

    const hx = p.bx + p.nx, hy = p.by + p.ny;
    let out = '';

    if (!p.fly) out += legShapes(p, legC);
    out += tailShape(p, back);
    if (p.fly) out += flyingWings(p, back, under);

    out += ellipse(p.bx, p.by, p.brx, p.bry, p.brot, back);
    /* Underparts: a smaller ellipse pushed forward and down. */
    out += ellipse(p.bx + p.brx * 0.22, p.by + p.bry * 0.34, p.brx * 0.66, p.bry * 0.58, p.brot, under);
    if (!p.fly) out += ellipse(p.bx + p.wing.dx, p.by + p.wing.dy, p.wing.rx, p.wing.ry, p.wing.rot, wingC);

    out += neckShape(p, hx, hy, head);
    if (p.crest) out += crestShape(hx, hy, p.hr, p.crest, head);
    out += ellipse(hx, hy, p.hr, p.hr * 0.94, 0, head);
    out += billShape(hx, hy, p.hr, p.bill, billC);

    /* Eye: dark on a pale head, pale on a dark one, so it always reads. */
    if (!locked) {
      const ex = hx + p.hr * 0.34, ey = hy - p.hr * 0.18;
      const dark = lum(head) < 0.45;
      if (p.owlEyes) {
        out += ellipse(ex, ey, p.eye + 1.6, p.eye + 1.6, 0, dark ? '#f2c94c' : '#e8b62a');
        out += ellipse(ex, ey, p.eye * 0.62, p.eye * 0.62, 0, '#1a1d21');
      } else {
        out += ellipse(ex, ey, p.eye + 0.9, p.eye + 0.9, 0, dark ? shade(head, 0.55) : shade(head, -0.55));
        out += ellipse(ex, ey, p.eye * 0.55, p.eye * 0.55, 0, dark ? '#1a1d21' : '#12151a');
      }
    }

    if (p.water) {
      out += '<rect x="6" y="' + (p.by + p.bry * 0.55).toFixed(1) +
        '" width="108" height="30" rx="6" fill="var(--dex-water)"/>';
    }
    return out;
  }

  /**
   * Full <svg> for a species portrait.
   * opts: { locked, size, className, decorative }
   */
  art.portrait = function (sp, opts) {
    opts = opts || {};
    const mode = opts.locked ? 'locked' : 'colour';
    const label = opts.locked ? 'Undiscovered species silhouette' : sp.n;
    return '<svg class="art ' + (opts.className || '') + '" viewBox="0 0 120 100" ' +
      'preserveAspectRatio="xMidYMid meet" role="img" aria-label="' + Birdex.escape(label) + '">' +
      body(sp, mode) +
      (opts.locked ? '<text class="art-q" x="60" y="30" text-anchor="middle">?</text>' : '') +
      '</svg>';
  };

  /** Shapes actually used by the dataset — handy when checking coverage. */
  art.shapes = Object.keys(SHAPES);

})(window);
