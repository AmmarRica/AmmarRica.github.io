/* =========================================================================
 * TOWER OF CHIPS — table construction
 * Turns the save state (unlocked floors + placed parts + upgrades) into the
 * geometry the physics engine consumes: colliders, force fields and
 * flippers. Also owns build-mode placement rules.
 * ====================================================================== */
(function (global) {
  'use strict';

  const IP = global.IP;
  const U = IP.util;
  const D = IP.data;
  const W = D.W;

  const PLAY_L = 3;
  const PLAY_R = 97;
  const LANE_X = 85;          // divider between playfield and plunger lane
  const LANE_TOP = 74;
  const GAP_HALF = 13;        // half-width of the opening between floors
  const DECK_DROP = 7;        // how far the deck falls from wall → opening
  const HOP_DROP = 15;        // how far the funnel rails hang below the deck

  /**
   * Horizontal centre of the opening leading from floor k-1 up to floor k.
   * The zig-zag moves in 25-unit steps rather than flipping wall to wall:
   * a ball entering a floor has to be walked sideways to the next opening,
   * and 25 units is a distance one well-aimed bumper can cover. 50 was not.
   */
  const GAP_PATTERN = [25, 50, 75, 50];
  function gapX(k) { return GAP_PATTERN[((k % 4) + 4) % 4]; }

  /** Absolute y of the deck between floor k-1 and floor k. */
  const deckY = (k) => k * W.FLOOR_H;

  /**
   * Height of the funnel rail hanging under deck k at world x — this is the
   * effective ceiling of floor k-1, so build placement has to respect it.
   */
  function railY(k, x) {
    const y = deckY(k), gx = gapX(k);
    if (x < gx - GAP_HALF) return U.lerp(y - HOP_DROP, y - 1, U.invLerp(PLAY_L, gx - GAP_HALF, x));
    if (x > gx + GAP_HALF) return U.lerp(y - 1, y - HOP_DROP, U.invLerp(gx + GAP_HALF, PLAY_R, x));
    return y - 1;             // inside the opening: clear all the way up
  }

  /** Lowest solid thing above (x, floor). */
  function ceilingAt(state, floor, x) {
    if (floor >= state.floors - 1) return deckY(state.floors) - 2;
    return railY(floor + 1, x);
  }

  /* ===================================================================
   * FLIPPER FACTORY
   * ================================================================ */
  function flipperFrom(opts, ups) {
    const lenScale = 1 + 0.05 * (ups.flipSize || 0);
    const power = (opts.power || 150) * (1 + 0.08 * (ups.flipPower || 0));
    const rate = (opts.rate || 15) * (1 + 0.07 * (ups.flipSpeed || 0));
    const side = opts.side === 'R' ? 'R' : 'L';
    const off = opts.a || 0;
    const rest = (side === 'L' ? -0.50 : Math.PI + 0.50) + (side === 'L' ? off : -off);
    const up = (side === 'L' ? 0.54 : Math.PI - 0.54) + (side === 'L' ? off : -off);
    const f = {
      id: opts.id,
      part: opts.part || null,
      pivot: { x: opts.x, y: opts.y },
      len: (opts.len || 18) * lenScale,
      thick: opts.thick || 1.7,
      e: opts.e || 0.42,
      side, power, rate,
      restAng: rest, upAng: up,
      ang: rest, angV: 0,
      panel: opts.panel != null ? opts.panel : (side === 'L' ? 0 : 1),
      auto: !!opts.auto,
      pressed: false,
      color: opts.color || D.C.cream,
    };
    f.tip = { x: f.pivot.x + Math.cos(f.ang) * f.len, y: f.pivot.y + Math.sin(f.ang) * f.len };
    return f;
  }

  /* ===================================================================
   * STATIC SHELL — the parts of the table you never buy.
   * ================================================================ */
  function buildShell(state, out, meta) {
    const floors = state.floors;
    const topY = deckY(floors);
    const seg = (ax, ay, bx, by, o) => out.push(Object.assign({
      k: 'seg', a: { x: ax, y: ay }, b: { x: bx, y: by }, t: 1.2, e: 0.42, tag: 'shell',
    }, o || {}));

    /* --- outer shell ------------------------------------------------ */
    seg(PLAY_L, -2, PLAY_L, topY, { t: 1.4 });                 // left wall
    seg(PLAY_R, -2, PLAY_R, topY, { t: 1.4 });                 // right wall
    seg(PLAY_L, topY, PLAY_R, topY, { t: 1.4, e: 0.3 });       // ceiling

    /* --- plunger lane ---------------------------------------------- */
    seg(LANE_X, 4, LANE_X, LANE_TOP, { t: 1.2 });              // lane divider
    seg(LANE_X, 4, PLAY_R, 4, { t: 1.4, e: 0.2, tag: 'lanefloor' });  // the ball rests here
    // Top-right deflector: a full plunge is thrown left into the playfield.
    seg(PLAY_R, LANE_TOP + 10, 74, LANE_TOP + 26, { t: 1.3, e: 0.58, tag: 'feed' });
    // One-way flap. It is deliberately slanted: a ball that lands on top rolls
    // off its left end into the playfield instead of parking there forever.
    out.push({ k: 'seg', a: { x: LANE_X, y: LANE_TOP }, b: { x: PLAY_R, y: LANE_TOP + 6 }, t: 1.0, e: 0.2, f: 0.004, oneWayUp: true, tag: 'lanegate' });
    meta.lane = { x: (LANE_X + PLAY_R) / 2, bottom: 6, top: LANE_TOP };

    /* --- floor-0 lower playfield ----------------------------------- */
    // Inlane guides funnelling toward the flippers.
    seg(PLAY_L, 64, 24, 30, { e: 0.4 });
    seg(LANE_X, 64, 76, 30, { e: 0.4 });
    // Built-in slingshot faces just above each flipper. Pure geometry — they
    // keep the ball in play but pay nothing, so at the start the flippers are
    // the only thing on the table earning anything at all.
    seg(19, 36, 28, 24, { e: 0.55, kick: 34, tag: 'shellSling' });
    seg(81, 36, 72, 24, { e: 0.55, kick: 34, tag: 'shellSling' });
    // Outlane drains at the very sides.
    seg(PLAY_L, 30, 12, 6, { e: 0.35 });
    seg(LANE_X, 30, 76, 6, { e: 0.35 });

    /* --- decks between floors --------------------------------------
     * Each deck is the floor above and the ceiling below at once:
     *  · the TOP slopes gently down into the opening, so a ball that runs
     *    out of steam rolls to the hole and drops instead of resting;
     *  · underneath hang two funnel rails that fan out to the walls, so a
     *    ball rising anywhere on the floor below gets nudged toward the
     *    opening rather than pinging straight back down.
     * ---------------------------------------------------------------- */
    meta.gaps = [];
    for (let k = 1; k < floors; k++) {
      const y = deckY(k), gx = gapX(k);
      const lx = gx - GAP_HALF, rx = gx + GAP_HALF;
      seg(PLAY_L, y + DECK_DROP, lx, y, { t: 1.5, e: 0.3, f: 0.004, tag: 'deck' });
      seg(rx, y, PLAY_R, y + DECK_DROP, { t: 1.5, e: 0.3, f: 0.004, tag: 'deck' });
      seg(PLAY_L, y - HOP_DROP, lx, y - 1, { t: 1.1, e: 0.5, tag: 'rail' });
      seg(rx, y - 1, PLAY_R, y - HOP_DROP, { t: 1.1, e: 0.5, tag: 'rail' });
      meta.gaps.push({ floor: k, x: gx, y });
    }
    meta.topY = topY;
  }

  /* ===================================================================
   * FULL BUILD
   * ================================================================ */
  function build(state) {
    const colliders = [];
    const fields = [];
    const flippers = [];
    const meta = { gaps: [], lane: null, topY: 0 };
    const ups = state.upgrades || {};

    buildShell(state, colliders, meta);

    /* --- main flippers --------------------------------------------- */
    // A wider stance leaves a real drain to defend: the tips now sit ~18
    // units apart instead of ~6, so a centred ball is lost unless you move it.
    flippers.push(flipperFrom({ id: 'mainL', x: 27, y: 24, side: 'L', panel: 0, len: 15, power: 205 }, ups));
    flippers.push(flipperFrom({ id: 'mainR', x: 73, y: 24, side: 'R', panel: 1, len: 15, power: 205 }, ups));

    /* --- placed parts ---------------------------------------------- */
    for (const inst of state.parts) {
      const def = D.PART_BY_ID[inst.id];
      if (!def) continue;
      if (inst.floor >= state.floors) continue;   // on a locked floor: dormant
      if (def.flipper) {
        const f = flipperFrom({
          id: inst.uid, part: inst, x: inst.x, y: inst.y, a: inst.a || 0,
          side: inst.side || 'L', panel: inst.panel != null ? inst.panel : (inst.side === 'R' ? 1 : 0),
          len: def.wheel ? 9 + inst.lvl * 0.5 : 10 + inst.lvl * 0.55,
          power: def.wheel ? 0 : 118 + inst.lvl * 9,
          auto: !!def.auto, color: def.color,
        }, ups);
        if (def.wheel) {
          // Batter wheels never rest — they just windmill.
          f.wheel = true;
          f.spinRate = (2.6 + inst.lvl * 0.22) * ((inst.a || 0) < 0 ? -1 : 1);
          f.e = 0.75;
          f.thick = 1.9;
        }
        flippers.push(f);
        continue;
      }
      const tmp = [];
      def.build(inst, tmp);
      inst._cols = tmp;             // so tick() can animate a live collider
      for (const c of tmp) {
        c.part = inst;
        if (c.k === 'field') fields.push(c); else colliders.push(c);
      }
    }

    const buckets = IP.physics.bucketize(colliders, W.FLOOR_H, state.floors + 1);
    return {
      colliders, fields, flippers, buckets, meta,
      floorH: W.FLOOR_H,
      gravity: W.GRAVITY,
      nudgeX: 0, nudgeY: 0,
      fieldMult: 1,
      totalH: meta.topY,
    };
  }

  /* ===================================================================
   * PLACEMENT RULES
   * ================================================================ */
  const slotLimit = (state) => 10 + 2 * (state.upgrades.slots || 0) + 2 * ((state.perks && state.perks.slots) || 0);

  function partsOnFloor(state, floor) {
    return state.parts.filter((p) => p.floor === floor);
  }

  /** Clamp a candidate position into the legal area of its floor. */
  function clampPos(x, y, floor, def, state) {
    const base = floor * W.FLOOR_H;
    const r = (def && def.r) || 5;
    const lo = base + (floor === 0 ? 42 : 6) + r;
    let xl = PLAY_L + 2 + r, xh = PLAY_R - 2 - r;
    // Floor 0 has the plunger lane eating the right edge below the lane top.
    if (floor === 0 && y < LANE_TOP + 6) xh = Math.min(xh, LANE_X - 2 - r);
    const cx = U.clamp(x, xl, xh);
    const st = state || (IP.game && IP.game.g.state);
    const ceil = st ? ceilingAt(st, floor, cx) : base + W.FLOOR_H - 10;
    const hi = Math.max(lo, ceil - 2 - r);
    return { x: cx, y: U.clamp(y, lo, hi) };
  }

  /** Snap to the build grid. */
  const snap = (v) => Math.round(v / W.GRID) * W.GRID;

  /**
   * Is this spot legal? Returns null when fine, else a human reason.
   */
  function placeError(state, def, x, y, floor, excludeUid) {
    const base = floor * W.FLOOR_H;
    const r = def.r || 5;
    if (floor >= state.floors) return 'Floor locked';
    if (y < base + (floor === 0 ? 42 : 6) + r) return 'Too low on this floor';
    if (x < PLAY_L + 2 + r || x > PLAY_R - 2 - r) return 'Outside the table';
    if (y > ceilingAt(state, floor, x) - 2 - r) return 'Too close to the deck above';
    if (floor === 0 && y < LANE_TOP + 6 && x > LANE_X - 2 - r) return 'Blocking the plunger lane';
    // Keep the throat of each opening clear of solid parts. Force fields and
    // gates are exempt: they cannot block a ball, and hanging a jet pad over
    // an opening is the whole technique for climbing a floor.
    if (!def.gate && !def.field) {
      for (const gp of state.gapCache || []) {
        if (Math.abs(gp.y - y) < r + 5 && Math.abs(gp.x - x) < GAP_HALF + r) return 'Blocking a floor opening';
      }
    }
    // One flipper per floor. Otherwise a floor becomes a wall of paddles and
    // the climb stops being about aim.
    if (def.pad) {
      for (const p of state.parts) {
        if (p.uid === excludeUid || p.floor !== floor) continue;
        const od = D.PART_BY_ID[p.id];
        if (od && od.pad) return 'Only one flipper per floor';
      }
    }
    for (const p of state.parts) {
      if (p.uid === excludeUid) continue;
      const od = D.PART_BY_ID[p.id];
      if (!od) continue;
      const minD = (r + (od.r || 5)) * 0.86;
      if ((p.x - x) ** 2 + (p.y - y) ** 2 < minD * minD) return 'Overlaps ' + od.name;
    }
    if (!excludeUid && partsOnFloor(state, floor).length >= slotLimit(state)) return 'No free build slots on this floor';
    return null;
  }

  /** Cost of the next copy of `def` given how many the player already owns. */
  function partCost(state, def) {
    const owned = state.parts.filter((p) => p.id === def.id).length;
    const disc = state.trinketFx && state.trinketFx.costMult ? state.trinketFx.costMult : 1;
    return Math.max(1, Math.round(def.cost * Math.pow(def.growth, owned) * disc));
  }

  /** Cost to raise a placed part from lvl → lvl+1. */
  function upgradeCost(state, inst) {
    const def = D.PART_BY_ID[inst.id];
    const disc = state.trinketFx && state.trinketFx.costMult ? state.trinketFx.costMult : 1;
    return Math.max(1, Math.round(def.cost * 0.85 * Math.pow(1.55, inst.lvl) * disc));
  }

  function refundValue(state, inst) {
    const def = D.PART_BY_ID[inst.id];
    if (state.trinketFx && state.trinketFx.fullRefund) return Math.round(def.cost * Math.pow(def.growth, Math.max(0, state.parts.filter((p) => p.id === inst.id).length - 1)));
    const pct = 0.40 + 0.05 * (state.upgrades.refund || 0);
    let paid = def.cost * Math.pow(def.growth, Math.max(0, state.parts.filter((p) => p.id === inst.id).length - 1));
    for (let l = 1; l < inst.lvl; l++) paid += def.cost * 0.85 * Math.pow(1.55, l);
    return Math.round(paid * pct);
  }

  /** Fresh runtime fields for a newly placed part. */
  function newInstance(defId, x, y, floor, a) {
    const def = D.PART_BY_ID[defId];
    return {
      uid: U.uid('p'), id: defId, x, y, floor, a: a || 0, lvl: 1,
      side: 'L', panel: 0, armed: true,
      t_down: 0, lit: false, charge: 0, hits: 0, used: 0, cd: 0, spin: 0, rot: 0,
      _created: Date.now(), _r: def ? def.r : 5,
    };
  }

  IP.table = {
    build, flipperFrom, railY, ceilingAt,
    PLAY_L, PLAY_R, LANE_X, LANE_TOP, GAP_HALF, gapX, deckY,
    slotLimit, partsOnFloor, clampPos, snap, placeError,
    partCost, upgradeCost, refundValue, newInstance,
  };
})(window);
