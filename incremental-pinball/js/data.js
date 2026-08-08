/* =========================================================================
 * TOWER OF CHIPS — content tables
 * Parts, balls, upgrades, trinkets, floors. Pure data + small behaviour
 * callbacks; nothing in here touches the DOM or the canvas.
 *
 * Behaviour callbacks receive `A` — the game API (see game.js `IP.api`) — so
 * content can score, spawn, buff and emit particles without importing
 * anything.
 * ====================================================================== */
(function (global) {
  'use strict';

  const IP = global.IP;
  const U = IP.util;

  /* =====================================================================
   * WORLD CONSTANTS
   * ================================================================== */
  const W = {
    WIDTH: 100,          // world units across the table
    FLOOR_H: 116,        // height of one tower floor
    WALL: 2.5,           // outer wall thickness
    LANE_X: 88,          // plunger lane divider
    MAX_FLOORS: 12,
    GRAVITY: 92,         // world units / s²
    DRAIN_Y: -6,         // below this the ball is gone
    GRID: 2,             // build-mode snap
  };

  /* =====================================================================
   * PALETTE — Balatro-ish: cream card stock, ink outlines, hot accents.
   * ================================================================== */
  const C = {
    ink: '#1c2026',
    ink2: '#0e1116',
    cream: '#f4ead6',
    cream2: '#ded2b8',
    red: '#fe5f55',
    redDark: '#c02b23',
    blue: '#0093ff',
    blueDark: '#0059a8',
    gold: '#ffb61e',
    goldDark: '#c07d00',
    green: '#41c98a',
    purple: '#9a6bff',
    pink: '#ff6fd8',
    teal: '#2fd5d0',
    orange: '#ff8b32',
    steel: '#b9c2cf',
    felt: '#25414a',
    feltHi: '#31555f',
  };

  /* =====================================================================
   * FLOORS — the tower. Higher floors multiply every chip scored on them.
   * ================================================================== */
  const FLOORS = [
    { name: 'THE FOUNDRY',   tint: '#2b4149', accent: C.orange, blurb: 'Where every ball begins.' },
    { name: 'BRASS DECK',    tint: '#3a3a2c', accent: C.gold,   blurb: 'Warm metal, warmer payouts.' },
    { name: 'NEON ARCADE',   tint: '#2c2547', accent: C.pink,   blurb: 'Loud, bright, expensive.' },
    { name: 'GLASS GARDEN',  tint: '#22412f', accent: C.green,  blurb: 'Fragile things bounce best.' },
    { name: 'CLOCKWORKS',    tint: '#40332a', accent: C.gold,   blurb: 'Tick. Tick. Jackpot.' },
    { name: 'AURORA HALL',   tint: '#20364f', accent: C.teal,   blurb: 'Cold light, hot streaks.' },
    { name: 'CIRCUIT VAULT', tint: '#1d3b3a', accent: C.blue,   blurb: 'Current flows upward.' },
    { name: 'OBSIDIAN SPIRE',tint: '#2a2230', accent: C.purple, blurb: 'The glass gets sharper.' },
    { name: 'CLOUD DECK',    tint: '#28414f', accent: C.cream,  blurb: 'Gravity gets lazy up here.' },
    { name: 'SOLAR CROWN',   tint: '#4a3520', accent: C.gold,   blurb: 'Everything glitters.' },
    { name: 'ASTRAL GATE',   tint: '#241f45', accent: C.purple, blurb: 'Rules bend. Chips do not.' },
    { name: 'THE APEX',      tint: '#3d1f27', accent: C.red,    blurb: 'Nothing above but score.' },
  ];

  /** Chip multiplier for landing a hit on floor k. Steep on purpose. */
  function floorMult(k) {
    return Math.max(1, Math.round(Math.pow(1.95, k)));
  }
  /** Coin cost to unlock floor k (floors 0-2 are free). */
  function floorCost(k) {
    if (k <= 2) return 0;
    return Math.round(520 * Math.pow(5.4, k - 3));
  }

  /* =====================================================================
   * PARTS
   * ---------------------------------------------------------------------
   * build(inst, out, ctx) pushes colliders. Collider shapes:
   *   {k:'seg',   a,b, t, e, kick, tag}
   *   {k:'circ',  c, r, e, kick, tag}
   *   {k:'arc',   c, r, a0, a1, t, e}
   *   {k:'sensor',c, r, tag}                     (no physical response)
   *   {k:'field', c, r, kind, power}             (force volume)
   * Every collider gets `.part` stamped on it by the table builder.
   * ================================================================== */

  /** Chip payout for a part at a given level. */
  const chipsFor = (base, lvl) => Math.round(base * (1 + 0.75 * (lvl - 1)) * (1 + 0.05 * (lvl - 1) * (lvl - 1)));

  const PARTS = [
    /* ---------------------------------------------------------- BOUNCE */
    {
      id: 'bumper', name: 'Pop Bumper', emoji: '⭕', cat: 'bounce', color: C.red,
      cost: 25, growth: 1.16, floor: 0, r: 5.2, rot: false, maxLevel: 20,
      desc: 'The bread and butter. Kicks hard, pays chips every hit.',
      chips: 8, kick: 62,
      build(inst, out) {
        out.push({ k: 'circ', c: { x: inst.x, y: inst.y }, r: 5.2, e: 0.62, kick: this.kick * (1 + 0.04 * (inst.lvl - 1)), tag: 'bumper' });
      },
      onHit(A, inst) {
        A.score(chipsFor(this.chips, inst.lvl), inst, { pop: true });
        A.addMult(0.09 + 0.03 * inst.lvl);
        A.burst(inst.x, inst.y, C.red, 10);
        A.sfx('pop');
      },
    },
    {
      id: 'sling', name: 'Slingshot', emoji: '📐', cat: 'bounce', color: C.orange,
      cost: 40, growth: 1.17, floor: 0, r: 9, rot: true, maxLevel: 20,
      desc: 'A angled kicker rail. Redirects the ball fast and hard.',
      chips: 12, kick: 78,
      build(inst, out) {
        const L = 9;
        const d = U.vrot({ x: L, y: 0 }, inst.a);
        out.push({
          k: 'seg', a: { x: inst.x - d.x, y: inst.y - d.y }, b: { x: inst.x + d.x, y: inst.y + d.y },
          t: 1.6, e: 0.5, kick: this.kick * (1 + 0.05 * (inst.lvl - 1)), tag: 'sling',
        });
      },
      onHit(A, inst) {
        A.score(chipsFor(this.chips, inst.lvl), inst);
        A.addMult(0.08 + 0.03 * inst.lvl);
        A.burst(inst.x, inst.y, C.orange, 8);
        A.sfx('sling');
      },
    },
    {
      id: 'tramp', name: 'Trampoline', emoji: '〰️', cat: 'bounce', color: C.green,
      cost: 70, growth: 1.18, floor: 0, r: 10, rot: true, maxLevel: 15,
      desc: 'Springy pad — near-perfect bounce. Great for gaining height.',
      chips: 6,
      build(inst, out) {
        const L = 10;
        const d = U.vrot({ x: L, y: 0 }, inst.a);
        out.push({
          k: 'seg', a: { x: inst.x - d.x, y: inst.y - d.y }, b: { x: inst.x + d.x, y: inst.y + d.y },
          t: 1.4, e: 1.02 + 0.03 * inst.lvl, kick: 8, tag: 'tramp',
        });
      },
      onHit(A, inst) { A.score(chipsFor(this.chips, inst.lvl), inst); A.burst(inst.x, inst.y, C.green, 5); A.sfx('boing'); },
    },
    {
      id: 'wall', name: 'Deflector', emoji: '▬', cat: 'flow', color: C.steel,
      cost: 12, growth: 1.09, floor: 0, r: 9, rot: true, maxLevel: 8,
      desc: 'A plain rotatable wall. Cheap way to steer balls where you want.',
      chips: 1,
      build(inst, out) {
        const L = 9 + inst.lvl * 0.8;
        const d = U.vrot({ x: L, y: 0 }, inst.a);
        out.push({
          k: 'seg', a: { x: inst.x - d.x, y: inst.y - d.y }, b: { x: inst.x + d.x, y: inst.y + d.y },
          t: 1.3, e: 0.45, kick: 0, tag: 'wall',
        });
      },
      onHit(A, inst) { A.score(1, inst, { silent: true }); },
    },

    /* ----------------------------------------------------------- SCORE */
    {
      id: 'target', name: 'Drop Target', emoji: '🎯', cat: 'score', color: C.gold,
      cost: 55, growth: 1.19, floor: 0, r: 5, rot: true, maxLevel: 20,
      desc: 'Drops when struck and pays big. Drop every target on a floor for a BANK bonus.',
      chips: 45, down: 6,
      build(inst, out) {
        if (inst.t_down > 0) return;             // dropped: no collider
        const d = U.vrot({ x: 5, y: 0 }, inst.a);
        out.push({
          k: 'seg', a: { x: inst.x - d.x, y: inst.y - d.y }, b: { x: inst.x + d.x, y: inst.y + d.y },
          t: 1.5, e: 0.35, kick: 12, tag: 'target',
        });
      },
      onHit(A, inst) {
        inst.t_down = this.down;
        A.score(chipsFor(this.chips, inst.lvl), inst, { pop: true });
        A.addMult(0.45 + 0.12 * inst.lvl);
        A.burst(inst.x, inst.y, C.gold, 14);
        A.sfx('target');
        A.checkTargetBank(inst.floor);
      },
      tick(A, inst, dt) { if (inst.t_down > 0) inst.t_down = Math.max(0, inst.t_down - dt); },
    },
    {
      id: 'spinner', name: 'Spinner', emoji: '🌀', cat: 'score', color: C.teal,
      cost: 90, growth: 1.2, floor: 0, r: 6, rot: true, maxLevel: 20,
      desc: 'Free-spinning gate. Pays per revolution — fast balls pay the most.',
      chips: 6,
      build(inst, out) {
        const d = U.vrot({ x: 6, y: 0 }, inst.a + Math.PI / 2);
        out.push({ k: 'sensor', c: { x: inst.x, y: inst.y }, r: 6, tag: 'spinner', seg: [d] });
      },
      onHit(A, inst, ball) {
        const spins = U.clamp(Math.round(U.vlen(ball.v) / 26), 1, 14);
        inst.spin = (inst.spin || 0) + spins * 0.9;
        A.score(chipsFor(this.chips, inst.lvl) * spins, inst);
        A.addMult(0.05 * spins);
        A.sfx('spin');
      },
      tick(A, inst, dt) { if (inst.spin > 0) inst.spin = Math.max(0, inst.spin - dt * 3); inst.rot = (inst.rot || 0) + (inst.spin || 0) * dt * 9; },
    },
    {
      id: 'rollover', name: 'Rollover Lane', emoji: '💡', cat: 'score', color: C.blue,
      cost: 48, growth: 1.16, floor: 0, r: 4, rot: false, maxLevel: 15,
      desc: 'Light it by rolling over. Light every lane on a floor for +1 permanent MULT this ball.',
      chips: 20,
      build(inst, out) { out.push({ k: 'sensor', c: { x: inst.x, y: inst.y }, r: 4, tag: 'rollover' }); },
      onHit(A, inst) {
        A.score(chipsFor(this.chips, inst.lvl), inst);
        if (!inst.lit) { inst.lit = true; A.checkLaneSet(inst.floor); }
        A.burst(inst.x, inst.y, C.blue, 6);
        A.sfx('blip');
      },
    },
    {
      id: 'jackpot', name: 'Jackpot Ring', emoji: '💎', cat: 'score', color: C.pink,
      cost: 260, growth: 1.24, floor: 1, r: 7, rot: false, maxLevel: 20,
      desc: 'Charges as you play. When lit, passing through pays the whole charge at once.',
      chips: 120,
      build(inst, out) { out.push({ k: 'sensor', c: { x: inst.x, y: inst.y }, r: 7, tag: 'jackpot' }); },
      onHit(A, inst) {
        if ((inst.charge || 0) < 1) { A.score(8, inst); return; }
        const pay = Math.round(chipsFor(this.chips, inst.lvl) * (1 + inst.charge));
        inst.charge = 0;
        A.score(pay, inst, { pop: true, label: 'JACKPOT' });
        A.addMult(1 + 0.2 * inst.lvl);
        A.burst(inst.x, inst.y, C.pink, 26);
        A.shake(9);
        A.sfx('jackpot');
      },
      tick(A, inst, dt) { inst.charge = Math.min(6, (inst.charge || 0) + dt * (0.16 + 0.03 * inst.lvl)); },
    },
    {
      id: 'multgate', name: 'Mult Gate', emoji: '✖️', cat: 'score', color: C.red,
      cost: 340, growth: 1.26, floor: 1, r: 6, rot: false, maxLevel: 12,
      desc: 'Pass through for a burst of raw MULT. Stacks with everything.',
      chips: 15,
      build(inst, out) { out.push({ k: 'sensor', c: { x: inst.x, y: inst.y }, r: 6, tag: 'multgate' }); },
      onHit(A, inst) {
        if ((inst.cd || 0) > 0) return;
        inst.cd = 1.2;
        A.score(chipsFor(this.chips, inst.lvl), inst);
        A.addMult(0.7 + 0.35 * inst.lvl, true);
        A.burst(inst.x, inst.y, C.red, 18);
        A.sfx('mult');
      },
      tick(A, inst, dt) { if (inst.cd > 0) inst.cd -= dt; },
    },
    {
      id: 'totem', name: 'Combo Totem', emoji: '🗿', cat: 'score', color: C.purple,
      cost: 300, growth: 1.22, floor: 2, r: 5, rot: false, maxLevel: 12,
      desc: 'Freezes MULT decay for a few seconds on every hit. Keeps hot streaks hot.',
      chips: 25,
      build(inst, out) { out.push({ k: 'circ', c: { x: inst.x, y: inst.y }, r: 5, e: 0.7, kick: 18, tag: 'totem' }); },
      onHit(A, inst) {
        A.score(chipsFor(this.chips, inst.lvl), inst);
        A.freezeMult(1.4 + 0.4 * inst.lvl);
        A.burst(inst.x, inst.y, C.purple, 10);
        A.sfx('totem');
      },
    },

    /* ------------------------------------------------------------ FLOW */
    {
      id: 'jet', name: 'Jet Pad', emoji: '💨', cat: 'flow', color: C.teal,
      cost: 120, growth: 1.2, floor: 0, r: 8, rot: true, maxLevel: 15,
      desc: 'Blows a constant gust. The main way to push balls up the tower.',
      chips: 3,
      build(inst, out) {
        out.push({ k: 'field', c: { x: inst.x, y: inst.y }, r: 14 + 1.2 * inst.lvl, kind: 'push', power: 210 + 52 * inst.lvl, ang: inst.a + Math.PI / 2, tag: 'jet' });
      },
      onHit(A, inst) { A.score(chipsFor(this.chips, inst.lvl), inst, { silent: true }); },
    },
    {
      id: 'magnet', name: 'Magnet', emoji: '🧲', cat: 'flow', color: C.blue,
      cost: 150, growth: 1.2, floor: 0, r: 9, rot: false, maxLevel: 15,
      desc: 'Draws balls in. Lodestone balls feel it three times as hard.',
      chips: 4,
      build(inst, out) {
        out.push({ k: 'field', c: { x: inst.x, y: inst.y }, r: 16 + 1.4 * inst.lvl, kind: 'attract', power: 90 + 26 * inst.lvl, tag: 'magnet' });
      },
      onHit(A, inst) { A.score(chipsFor(this.chips, inst.lvl), inst, { silent: true }); },
    },
    {
      id: 'antigrav', name: 'Gravity Well', emoji: '🌌', cat: 'flow', color: C.purple,
      cost: 420, growth: 1.24, floor: 2, r: 12, rot: false, maxLevel: 12,
      desc: 'Cancels most of gravity in a wide bubble. Balls hang and hover.',
      chips: 5,
      build(inst, out) {
        out.push({ k: 'field', c: { x: inst.x, y: inst.y }, r: 18 + 1.6 * inst.lvl, kind: 'lowgrav', power: U.clamp(0.42 + 0.045 * inst.lvl, 0, 0.96), tag: 'antigrav' });
      },
      onHit(A, inst) { A.score(chipsFor(this.chips, inst.lvl), inst, { silent: true }); },
    },
    {
      id: 'conveyor', name: 'Conveyor', emoji: '➡️', cat: 'flow', color: C.gold,
      cost: 190, growth: 1.2, floor: 1, r: 10, rot: true, maxLevel: 12,
      desc: 'A moving rail. Rolls balls along its length toward the arrow.',
      chips: 4,
      build(inst, out) {
        const d = U.vrot({ x: 10, y: 0 }, inst.a);
        out.push({
          k: 'seg', a: { x: inst.x - d.x, y: inst.y - d.y }, b: { x: inst.x + d.x, y: inst.y + d.y },
          t: 1.5, e: 0.2, kick: 2, tag: 'conveyor', belt: 34 + 8 * inst.lvl, beltDir: inst.a,
        });
      },
      onHit(A, inst) { A.score(chipsFor(this.chips, inst.lvl), inst, { silent: true }); },
    },
    {
      id: 'portal', name: 'Portal', emoji: '🌀', cat: 'flow', color: C.pink,
      cost: 500, growth: 1.28, floor: 2, r: 5, rot: false, maxLevel: 10,
      desc: 'Place two. A ball entering one exits the other, keeping its speed.',
      chips: 30,
      build(inst, out) { out.push({ k: 'sensor', c: { x: inst.x, y: inst.y }, r: 5, tag: 'portal' }); },
      onHit(A, inst, ball) {
        if (ball.portalCd > 0) return;
        const other = A.otherPortal(inst);
        if (!other) { A.score(6, inst); return; }
        ball.p.x = other.x; ball.p.y = other.y;
        ball.portalCd = 0.5;
        A.score(chipsFor(this.chips, inst.lvl), inst, { pop: true });
        A.burst(inst.x, inst.y, C.pink, 12); A.burst(other.x, other.y, C.pink, 12);
        A.sfx('portal');
      },
    },
    {
      id: 'ratchet', name: 'Ratchet Gate', emoji: '⤴️', cat: 'flow', color: C.green,
      cost: 900, growth: 1.35, floor: 1, r: 12, rot: false, maxLevel: 5,
      desc: 'Sits in a floor opening: balls pass up through it but never fall back down.',
      chips: 40, gate: true,
      build(inst, out) {
        if (!inst.armed) return;
        out.push({ k: 'seg', a: { x: inst.x - 12, y: inst.y }, b: { x: inst.x + 12, y: inst.y }, t: 1.1, e: 0.4, kick: 4, tag: 'ratchet', oneWayUp: true });
      },
      onHit(A, inst) { A.score(chipsFor(this.chips, inst.lvl), inst, { silent: true }); },
    },
    {
      id: 'saucer', name: 'Vault Saucer', emoji: '🕳️', cat: 'score', color: C.gold,
      cost: 650, growth: 1.26, floor: 1, r: 5, rot: false, maxLevel: 15,
      desc: 'Swallows the ball, pays a fat bonus, then spits it straight up.',
      chips: 260,
      build(inst, out) { out.push({ k: 'sensor', c: { x: inst.x, y: inst.y }, r: 5, tag: 'saucer' }); },
      onHit(A, inst, ball) {
        if (ball.held || ball.holdCd > 0) return;
        A.holdBall(ball, inst, 0.85, () => {
          A.score(chipsFor(this.chips, inst.lvl), inst, { pop: true, label: 'VAULT' });
          A.addMult(0.5 + 0.2 * inst.lvl);
          ball.v.x = U.rand(-14, 14);
          ball.v.y = 160 + 9 * inst.lvl;
          A.burst(inst.x, inst.y, C.gold, 22);
          A.shake(7);
          A.sfx('vault');
        });
      },
    },
    {
      id: 'cannon', name: 'Aim Cannon', emoji: '🎯', cat: 'control', color: C.red,
      cost: 1400, growth: 1.3, floor: 1, r: 6, rot: true, maxLevel: 15,
      desc: 'Catches the ball and hands YOU the aim. Drag to aim, release to fire.',
      chips: 90, manual: true,
      build(inst, out) { out.push({ k: 'sensor', c: { x: inst.x, y: inst.y }, r: 5.5, tag: 'cannon' }); },
      onHit(A, inst, ball) {
        if (ball.held || ball.holdCd > 0) return;
        A.loadCannon(inst, ball);
        A.score(chipsFor(this.chips, inst.lvl), inst, { pop: true });
        A.sfx('load');
      },
    },
    {
      id: 'mint', name: 'Chip Mint', emoji: '🪙', cat: 'idle', color: C.gold,
      cost: 380, growth: 1.22, floor: 0, r: 5, rot: false, maxLevel: 25,
      desc: 'Prints coins on its own, even while you are away. Hit it for an instant payout.',
      chips: 30,
      idle(inst) { return 0.22 * inst.lvl * Math.pow(1.12, inst.lvl - 1) * (1 + inst.floor * 0.6); },
      build(inst, out) { out.push({ k: 'circ', c: { x: inst.x, y: inst.y }, r: 5, e: 0.6, kick: 26, tag: 'mint' }); },
      onHit(A, inst) {
        A.score(chipsFor(this.chips, inst.lvl), inst);
        A.coins(Math.max(1, Math.round(this.idle(inst) * 9)));
        A.burst(inst.x, inst.y, C.gold, 12);
        A.sfx('coin');
      },
    },
    {
      id: 'battery', name: 'Chip Battery', emoji: '🔋', cat: 'idle', color: C.green,
      cost: 1200, growth: 1.26, floor: 2, r: 5, rot: false, maxLevel: 25,
      desc: 'Stores idle coins at a much better rate, but only banks while you play.',
      chips: 60,
      idle(inst) { return 0.9 * inst.lvl * Math.pow(1.15, inst.lvl - 1) * (1 + inst.floor * 0.9); },
      build(inst, out) { out.push({ k: 'circ', c: { x: inst.x, y: inst.y }, r: 5, e: 0.55, kick: 20, tag: 'battery' }); },
      onHit(A, inst) {
        A.score(chipsFor(this.chips, inst.lvl), inst, { pop: true });
        A.coins(Math.max(2, Math.round(this.idle(inst) * 14)));
        A.burst(inst.x, inst.y, C.green, 14);
        A.sfx('coin');
      },
    },
    {
      id: 'splitter', name: 'Ball Splitter', emoji: '🔱', cat: 'score', color: C.teal,
      cost: 2200, growth: 1.32, floor: 2, r: 6, rot: false, maxLevel: 10,
      desc: 'Charge it by hitting it. When full, the next ball through becomes two.',
      chips: 70, need: 6,
      build(inst, out) { out.push({ k: 'circ', c: { x: inst.x, y: inst.y }, r: 6, e: 0.7, kick: 34, tag: 'splitter' }); },
      onHit(A, inst, ball) {
        inst.hits = (inst.hits || 0) + 1;
        A.score(chipsFor(this.chips, inst.lvl), inst);
        const need = Math.max(2, this.need - Math.floor(inst.lvl / 2));
        if (inst.hits >= need) {
          inst.hits = 0;
          A.splitBall(ball);
          A.burst(inst.x, inst.y, C.teal, 24);
          A.shake(6);
          A.sfx('split');
        }
      },
    },
    {
      id: 'laser', name: 'Laser Gate', emoji: '⚡', cat: 'score', color: C.blue,
      cost: 780, growth: 1.24, floor: 1, r: 11, rot: true, maxLevel: 20,
      desc: 'Pays by ball speed. Rocket a fast ball across it for silly chips.',
      chips: 10,
      build(inst, out) {
        const d = U.vrot({ x: 11, y: 0 }, inst.a);
        out.push({ k: 'sensorSeg', a: { x: inst.x - d.x, y: inst.y - d.y }, b: { x: inst.x + d.x, y: inst.y + d.y }, tag: 'laser' });
      },
      onHit(A, inst, ball) {
        if ((inst.cd || 0) > 0) return;
        inst.cd = 0.35;
        const sp = U.vlen(ball.v);
        A.score(Math.round(chipsFor(this.chips, inst.lvl) * (1 + sp / 45)), inst, { pop: sp > 120 });
        A.addMult(sp > 140 ? 0.6 : 0.12);
        A.sfx('laser');
      },
      tick(A, inst, dt) { if (inst.cd > 0) inst.cd -= dt; },
    },
    {
      id: 'orbit', name: 'Orbit Loop', emoji: '⭕', cat: 'flow', color: C.cream,
      cost: 240, growth: 1.2, floor: 1, r: 13, rot: true, maxLevel: 10,
      desc: 'A curved rail that whips balls around and flings them upward.',
      chips: 18,
      build(inst, out) {
        out.push({ k: 'arc', c: { x: inst.x, y: inst.y }, r: 12, a0: inst.a - 1.5, a1: inst.a + 1.5, t: 1.4, e: 0.72, tag: 'orbit' });
      },
      onHit(A, inst) { A.score(chipsFor(this.chips, inst.lvl), inst); A.addMult(0.12); A.sfx('rail'); },
    },

    /* --------------------------------------------------------- CONTROL */
    {
      id: 'paddle', name: 'Paddle', emoji: '🏓', cat: 'control', color: C.cream,
      cost: 700, growth: 1.42, floor: 1, r: 12, rot: true, maxLevel: 15,
      desc: 'A flipper YOU control on any floor. Bind it to a panel key in CONTROLS.',
      chips: 4, manual: true, flipper: true,
      build() { /* flippers are dynamic — see table.js */ },
      onHit(A, inst) { A.score(chipsFor(this.chips, inst.lvl), inst, { silent: true }); },
    },
    {
      id: 'autopaddle', name: 'Auto Paddle', emoji: '🤖', cat: 'control', color: C.purple,
      cost: 2600, growth: 1.4, floor: 2, r: 12, rot: true, maxLevel: 15,
      desc: 'A paddle that flips itself whenever a ball drops into range. Set and forget.',
      chips: 6, flipper: true, auto: true,
      build() { /* dynamic */ },
      onHit(A, inst) { A.score(chipsFor(this.chips, inst.lvl), inst, { silent: true }); },
    },
    {
      id: 'kicker', name: 'Save Kicker', emoji: '⬆️', cat: 'control', color: C.green,
      cost: 1600, growth: 1.34, floor: 0, r: 7, rot: false, maxLevel: 12,
      desc: 'Sits low and boots any ball that falls onto it straight back up. Limited charges per ball.',
      chips: 35, charges: 3,
      build(inst, out) { out.push({ k: 'sensor', c: { x: inst.x, y: inst.y }, r: 7, tag: 'kicker' }); },
      onHit(A, inst, ball) {
        const max = this.charges + inst.lvl - 1;
        if ((inst.used || 0) >= max) return;
        if (ball.v.y > 20) return;
        inst.used = (inst.used || 0) + 1;
        ball.v.y = Math.max(ball.v.y, 150 + 8 * inst.lvl);
        ball.v.x *= 0.5;
        A.score(chipsFor(this.chips, inst.lvl), inst, { pop: true, label: 'SAVE' });
        A.burst(inst.x, inst.y, C.green, 16);
        A.sfx('save');
      },
    },
  ];

  const PART_BY_ID = {};
  PARTS.forEach((p) => { PART_BY_ID[p.id] = p; });

  /* =====================================================================
   * BALLS — every one plays differently.
   * ================================================================== */
  const BALLS = [
    {
      id: 'steel', name: 'Steel Ball', emoji: '⚪', color: '#cfd8e6', cost: 0,
      mass: 1, e: 1, r: 2.3, grav: 1, drag: 0.0, score: 1, coin: 1,
      desc: 'The standard. No tricks, no penalties.',
    },
    {
      id: 'rubber', name: 'Rubber Ball', emoji: '🔴', color: '#fe5f55', cost: 220,
      mass: 0.82, e: 1.2, r: 2.4, grav: 1, drag: 0, score: 1.1, coin: 1,
      desc: 'Bounces 20% harder off everything. Chaotic and quick to climb.',
    },
    {
      id: 'glass', name: 'Glass Marble', emoji: '🔵', color: '#8fd8ff', cost: 600,
      mass: 0.7, e: 1.06, r: 1.9, grav: 0.86, drag: 0, score: 1.4, coin: 1,
      desc: 'Small, light and worth 40% more chips. Slips through tight gaps.',
    },
    {
      id: 'lead', name: 'Lead Shot', emoji: '⚫', color: '#7c8496', cost: 900,
      mass: 2.3, e: 0.86, r: 2.8, grav: 1.18, drag: 0, score: 2, coin: 1.1,
      desc: 'Heavy. Doubles chips and smashes through drop targets, but hates climbing.',
    },
    {
      id: 'helium', name: 'Helium Bubble', emoji: '🫧', color: '#bff6ff', cost: 1400,
      mass: 0.45, e: 1.05, r: 2.6, grav: 0.5, drag: 0.22, score: 0.95, coin: 1,
      desc: 'Half gravity. The easiest way to reach the floors you just unlocked.',
    },
    {
      id: 'neon', name: 'Neon Orb', emoji: '🟣', color: '#ff6fd8', cost: 2600,
      mass: 0.9, e: 1.1, r: 2.2, grav: 0.92, drag: 0, score: 1.9, coin: 1.2,
      desc: 'Leaves a burning trail and scores 90% more. Trail hits count as chips.',
      trail: true,
    },
    {
      id: 'lodestone', name: 'Lodestone', emoji: '🧲', color: '#4aa3ff', cost: 4200,
      mass: 1.2, e: 0.98, r: 2.4, grav: 1, drag: 0, score: 1.5, coin: 1.3,
      desc: 'Magnets pull it three times as hard — build a magnet ladder and ride it up.',
      magnetic: 3,
    },
    {
      id: 'gilded', name: 'Gilded Ball', emoji: '🟡', color: '#ffc843', cost: 7000,
      mass: 1.1, e: 0.98, r: 2.4, grav: 1, drag: 0, score: 1.3, coin: 3.2,
      desc: 'Coins, coins, coins. Triples every coin the table pays out.',
    },
    {
      id: 'plasma', name: 'Plasma Sphere', emoji: '🟠', color: '#ff8b32', cost: 14000,
      mass: 0.95, e: 1.12, r: 2.5, grav: 0.95, drag: 0, score: 2.4, coin: 1.4,
      desc: 'Re-ignites dropped targets instantly and chains bumper hits for extra MULT.',
      plasma: true, trail: true,
    },
    {
      id: 'quantum', name: 'Quantum Pearl', emoji: '🟢', color: '#41c98a', cost: 30000,
      mass: 0.85, e: 1.08, r: 2.2, grav: 0.95, drag: 0, score: 2.2, coin: 1.5,
      desc: '12% chance on any bumper hit to split off a phantom copy of itself.',
      splitChance: 0.12,
    },
    {
      id: 'clover', name: 'Lucky Clover', emoji: '🍀', color: '#6fe06f', cost: 60000,
      mass: 1, e: 1.05, r: 2.4, grav: 1, drag: 0, score: 2, coin: 2.2,
      desc: '6% of all hits pay a 25× jackpot instead. Streaky, thrilling, profitable.',
      luck: 0.06,
    },
    {
      id: 'void', name: 'Void Sphere', emoji: '🌑', color: '#6a4fb8', cost: 140000,
      mass: 1.4, e: 1, r: 2.6, grav: 1.05, drag: 0, score: 3.2, coin: 1.8,
      desc: 'Drags every other ball toward it. Multiball turns into a scoring blender.',
      pullsBalls: 260,
    },
    {
      id: 'mercury', name: 'Mercury Drop', emoji: '💧', color: '#c9d6e8', cost: 320000,
      mass: 1.7, e: 1.14, r: 2.5, grav: 0.98, drag: -0.04, score: 3.6, coin: 2,
      desc: 'Frictionless: it keeps its speed forever, so laser gates pay through the roof.',
      slick: true, trail: true,
    },
    {
      id: 'prismatic', name: 'Prismatic Core', emoji: '💠', color: '#69f0ff', cost: 900000,
      mass: 1.1, e: 1.12, r: 2.5, grav: 1.02, drag: 0, score: 5, coin: 3,
      desc: 'Every stat at once. The ball you retire on.',
      trail: true, magnetic: 2, splitChance: 0.06,
    },
    {
      id: 'nova', name: 'Nova Core', emoji: '☄️', color: '#ff4d6d', cost: 4000000,
      mass: 1.25, e: 1.15, r: 2.6, grav: 1, drag: 0, score: 7, coin: 4,
      desc: 'Detonates on drain, paying 20× everything it scored. Prestige-tier.',
      trail: true, nova: 20, splitChance: 0.08, luck: 0.04,
    },
  ];
  const BALL_BY_ID = {};
  BALLS.forEach((b) => { BALL_BY_ID[b.id] = b; });

  /* =====================================================================
   * UPGRADES — permanent, coin-bought, never reset except on prestige.
   * ================================================================== */
  const UPGRADES = [
    { id: 'flipPower', name: 'Flipper Power',  emoji: '💪', cost: 60,   growth: 1.30, max: 30, group: 'table',
      desc: 'Flippers hit harder.', fmt: (l) => `+${(l * 8)}% launch speed` },
    { id: 'flipSpeed', name: 'Flipper Speed',  emoji: '⚡', cost: 90,   growth: 1.32, max: 20, group: 'table',
      desc: 'Flippers snap up faster.', fmt: (l) => `+${(l * 7)}% flip rate` },
    { id: 'flipSize',  name: 'Flipper Length', emoji: '📏', cost: 140,  growth: 1.38, max: 12, group: 'table',
      desc: 'Longer flippers, smaller drain gap.', fmt: (l) => `+${(l * 5)}% length` },
    { id: 'plunger',   name: 'Plunger Power',  emoji: '🚀', cost: 55,   growth: 1.28, max: 25, group: 'table',
      desc: 'Launch balls higher up the tower.', fmt: (l) => `+${(l * 6)}% launch` },
    { id: 'lowGrav',   name: 'Table Tilt',     emoji: '🪶', cost: 320,  growth: 1.44, max: 18, group: 'table',
      desc: 'Lift the table — everything falls slower.', fmt: (l) => `-${(l * 2.6).toFixed(1)}% gravity` },
    { id: 'nudge',     name: 'Nudge Charges',  emoji: '👊', cost: 260,  growth: 1.5,  max: 8,  group: 'table',
      desc: 'Bump the table mid-ball without tilting.', fmt: (l) => `${2 + l} nudges per ball` },

    { id: 'balls',     name: 'Balls Per Run',  emoji: '🎳', cost: 400,  growth: 1.85, max: 9,  group: 'run',
      desc: 'More balls before the run ends.', fmt: (l) => `${3 + l} balls` },
    { id: 'ballSave',  name: 'Ball Save',      emoji: '🛟', cost: 700,  growth: 1.9,  max: 6,  group: 'run',
      desc: 'Drains in the first seconds of a ball are refunded.', fmt: (l) => `${(l * 2.5).toFixed(1)}s of save` },
    { id: 'multiball', name: 'Multiball Odds', emoji: '🎱', cost: 1500, growth: 1.7,  max: 15, group: 'run',
      desc: 'Chance for a bonus ball whenever you clear a floor for the first time.', fmt: (l) => `${l * 6}% chance` },
    { id: 'skill',     name: 'Skill Shot',     emoji: '🎯', cost: 900,  growth: 1.6,  max: 20, group: 'run',
      desc: 'Launching straight into a floor gap pays a skill bonus.', fmt: (l) => `${U.fmt(200 * l)} chips` },
    { id: 'scaffold',  name: 'Scaffolding',    emoji: '🏗️', cost: 2000, growth: 1.66, max: 20, group: 'run',
      desc: 'Reaching a new personal-best floor pays a climb bonus.', fmt: (l) => `${U.fmt(500 * l)} chips per floor` },

    { id: 'chipGain',  name: 'Chip Gain',      emoji: '🔷', cost: 250,  growth: 1.42, max: 40, group: 'score',
      desc: 'Every chip payout is bigger.', fmt: (l) => `+${l * 12}% chips` },
    { id: 'multBase',  name: 'Base Mult',      emoji: '✖️', cost: 800,  growth: 1.62, max: 25, group: 'score',
      desc: 'Your MULT never falls below this.', fmt: (l) => `MULT floor ${(1 + l * 0.35).toFixed(2)}×` },
    { id: 'combo',     name: 'Combo Window',   emoji: '⏱️', cost: 600,  growth: 1.5,  max: 20, group: 'score',
      desc: 'MULT decays more slowly between hits.', fmt: (l) => `-${U.clamp(l * 4, 0, 78)}% decay` },
    { id: 'bumperV',   name: 'Bumper Voltage', emoji: '🔌', cost: 500,  growth: 1.46, max: 30, group: 'score',
      desc: 'Bumpers, slingshots and trampolines pay more.', fmt: (l) => `+${l * 15}% bounce chips` },
    { id: 'coinYield', name: 'Coin Yield',     emoji: '🪙', cost: 350,  growth: 1.48, max: 40, group: 'score',
      desc: 'Chips convert to coins at a better rate.', fmt: (l) => `+${l * 14}% coins` },

    { id: 'idleRate',  name: 'Idle Output',    emoji: '⚙️', cost: 450,  growth: 1.44, max: 40, group: 'idle',
      desc: 'Mints and batteries produce more.', fmt: (l) => `+${l * 16}% idle` },
    { id: 'offline',   name: 'Night Shift',    emoji: '🌙', cost: 1200, growth: 1.55, max: 12, group: 'idle',
      desc: 'How long the tower keeps earning while you are away.', fmt: (l) => `${2 + l * 2}h offline cap` },
    { id: 'autoPlay',  name: 'Autoplunger',    emoji: '🔁', cost: 3000, growth: 1.8,  max: 5,  group: 'idle',
      desc: 'Balls launch themselves, and the AI assists your flippers.', fmt: (l) => (l ? `assist level ${l}` : 'off') },

    { id: 'slots',     name: 'Build Slots',    emoji: '🧱', cost: 900,  growth: 1.55, max: 20, group: 'build',
      desc: 'More parts allowed on every floor.', fmt: (l) => `${10 + l * 2} parts per floor` },
    { id: 'trinkets',  name: 'Trinket Slots',  emoji: '🃏', cost: 2500, growth: 2.1,  max: 5,  group: 'build',
      desc: 'Hold more trinkets at once.', fmt: (l) => `${2 + l} trinket slots` },
    { id: 'refund',    name: 'Fair Trade',     emoji: '♻️', cost: 700,  growth: 1.5,  max: 10, group: 'build',
      desc: 'Selling a part refunds more of its price.', fmt: (l) => `${40 + l * 5}% refund` },
  ];
  const UP_BY_ID = {};
  UPGRADES.forEach((u) => { UP_BY_ID[u.id] = u; });

  const upgradeCost = (u, lvl) => Math.round(u.cost * Math.pow(u.growth, lvl));

  /* =====================================================================
   * TRINKETS — Balatro-style rule-benders. Limited slots, big swings.
   * Hooks: chipMult / multAdd / on(event)
   * ================================================================== */
  const TRINKETS = [
    { id: 'brass',    name: 'Brass Knuckle', emoji: '🥊', rarity: 0, cost: 900,
      desc: 'Bumpers pay +50% chips.', chipMult: (A, ev) => (ev.tag === 'bumper' ? 1.5 : 1) },
    { id: 'ladder',   name: "Climber's Rope", emoji: '🪢', rarity: 0, cost: 1100,
      desc: 'Every floor above the first adds +0.25 MULT while the ball is on it.',
      multAdd: (A) => 0.25 * A.highestActiveFloor() },
    { id: 'sparkplug',name: 'Spark Plug', emoji: '🔌', rarity: 0, cost: 1300,
      desc: 'First hit of every ball grants +3 MULT.', on: { ballStart: (A) => { A.flag('sparkplug', true); }, hit: (A) => { if (A.flag('sparkplug')) { A.flag('sparkplug', false); A.addMult(3, true); } } } },
    { id: 'metronome',name: 'Metronome', emoji: '🎼', rarity: 1, cost: 2400,
      desc: 'Every 10th hit in a row pays 5× chips.',
      on: { hit: (A) => { const n = (A.flag('metro') || 0) + 1; A.flag('metro', n % 10); if (n % 10 === 0) A.flag('metroBoost', 1); } },
      chipMult: (A) => { if (A.flag('metroBoost')) { A.flag('metroBoost', 0); return 5; } return 1; } },
    { id: 'hoarder',  name: 'Coin Hoarder', emoji: '💰', rarity: 1, cost: 2600,
      desc: 'Coins earned +35%, but MULT decays 20% faster.', coinMult: 1.35, decayMult: 1.2 },
    { id: 'glasscannon', name: 'Glass Cannon', emoji: '💥', rarity: 1, cost: 3200,
      desc: 'All chips ×2, but you get one fewer ball per run.', chipMult: () => 2, ballDelta: -1 },
    { id: 'plumbob',  name: 'Plumb Bob', emoji: '📐', rarity: 1, cost: 2900,
      desc: 'Gravity −12%. Everything floats a little longer.', gravMult: 0.88 },
    { id: 'ratchet',  name: 'Pawl & Ratchet', emoji: '⚙️', rarity: 2, cost: 5200,
      desc: 'MULT never drops below its highest value this ball.', ratchetMult: true },
    { id: 'chandelier', name: 'Chandelier', emoji: '🕯️', rarity: 2, cost: 6000,
      desc: 'Chips scored on floor 4+ are doubled.', chipMult: (A, ev) => (ev.floor >= 4 ? 2 : 1) },
    { id: 'gambler',  name: "Gambler's Chip", emoji: '🎲', rarity: 2, cost: 5600,
      desc: '25% of hits pay nothing; the rest pay 1.8×.',
      chipMult: () => (Math.random() < 0.25 ? 0 : 1.8) },
    { id: 'echo',     name: 'Echo Chamber', emoji: '📢', rarity: 2, cost: 7400,
      desc: 'Every hit re-triggers once for half chips.', echo: 0.5 },
    { id: 'lodestar', name: 'Lodestar', emoji: '⭐', rarity: 2, cost: 8200,
      desc: 'Magnets and jet pads are 60% stronger.', fieldMult: 1.6 },
    { id: 'blueprint', name: 'Blueprint', emoji: '📘', rarity: 2, cost: 9000,
      desc: 'Parts cost 18% less and refund fully.', costMult: 0.82, fullRefund: true },
    { id: 'furnace',  name: 'Furnace', emoji: '🔥', rarity: 3, cost: 16000,
      desc: '+0.06 MULT per second the ball stays alive.', multAdd: (A) => 0.06 * A.ballAge() },
    { id: 'crown',    name: 'Paper Crown', emoji: '👑', rarity: 3, cost: 21000,
      desc: 'Chips ×(1 + highest floor reached ÷ 4).', chipMult: (A) => 1 + A.bestFloor() / 4 },
    { id: 'mirror',   name: 'Cracked Mirror', emoji: '🪞', rarity: 3, cost: 26000,
      desc: 'Start every ball with a free copy of it.', extraBall: 1 },
    { id: 'anchor',   name: 'Iron Anchor', emoji: '⚓', rarity: 3, cost: 24000,
      desc: 'Ball mass +50%, chips +60%. Heavier hits, harder climbs.', massMult: 1.5, chipMult: () => 1.6 },
    { id: 'nova',     name: 'Nova Shard', emoji: '☄️', rarity: 3, cost: 34000,
      desc: 'Draining pays 8× the chips that ball scored.', novaBonus: 8 },
    { id: 'compass',  name: "Surveyor's Compass", emoji: '🧭', rarity: 3, cost: 30000,
      desc: 'Reaching a new floor instantly pays 5,000 chips × floor.',
      on: { newFloor: (A, f) => A.score(5000 * f, null, { pop: true, label: 'SURVEY', floor: f }) } },
    { id: 'obelisk',  name: 'Obelisk', emoji: '🗼', rarity: 4, cost: 90000,
      desc: 'MULT ×1.5 while the ball is above floor 5.', multMult: (A) => (A.highestActiveFloor() >= 5 ? 1.5 : 1) },
    { id: 'perpetual',name: 'Perpetual Motion', emoji: '♾️', rarity: 4, cost: 120000,
      desc: 'Balls lose no speed to friction, ever.', noDrag: true },
    { id: 'jester',   name: 'The Jester', emoji: '🃏', rarity: 4, cost: 160000,
      desc: 'Chips ×(1 + number of parts on the table ÷ 20).', chipMult: (A) => 1 + A.partCount() / 20 },
    { id: 'sunstone', name: 'Sunstone', emoji: '🌞', rarity: 4, cost: 240000,
      desc: 'Every trinket you own adds +0.5 MULT.', multAdd: (A) => 0.5 * A.trinketCount() },
    { id: 'infinity', name: 'Infinity Coil', emoji: '🌀', rarity: 5, cost: 900000,
      desc: 'Chips ×3 and MULT decay halved. The last trinket you will ever need.',
      chipMult: () => 3, decayMult: 0.5 },
  ];
  const TRINKET_BY_ID = {};
  TRINKETS.forEach((t) => { TRINKET_BY_ID[t.id] = t; });

  const RARITY = [
    { name: 'COMMON', color: C.blue },
    { name: 'UNCOMMON', color: C.green },
    { name: 'RARE', color: C.red },
    { name: 'EPIC', color: C.purple },
    { name: 'LEGENDARY', color: C.gold },
    { name: 'MYTHIC', color: C.pink },
  ];

  /* =====================================================================
   * ACHIEVEMENTS / MILESTONES — small dopamine hits, purely cosmetic.
   * ================================================================== */
  const MEDALS = [
    { id: 'first',   name: 'First Chip',      emoji: '🔷', desc: 'Score a single chip.',              test: (s) => s.stats.totalChips >= 1 },
    { id: 'k10',     name: 'Ten Thousand',    emoji: '💠', desc: 'Score 10,000 chips in one run.',    test: (s) => s.stats.bestRun >= 1e4 },
    { id: 'm1',      name: 'Millionaire',     emoji: '💎', desc: 'Score 1,000,000 chips in one run.', test: (s) => s.stats.bestRun >= 1e6 },
    { id: 'floor3',  name: 'Third Storey',    emoji: '🏢', desc: 'Reach floor 3.',                    test: (s) => s.stats.bestFloor >= 3 },
    { id: 'floor6',  name: 'Halfway Up',      emoji: '🏙️', desc: 'Reach floor 6.',                    test: (s) => s.stats.bestFloor >= 6 },
    { id: 'apex',    name: 'The Apex',        emoji: '🗻', desc: 'Reach floor 11.',                   test: (s) => s.stats.bestFloor >= 11 },
    { id: 'build10', name: 'Contractor',      emoji: '🔨', desc: 'Place 10 parts.',                   test: (s) => s.stats.placed >= 10 },
    { id: 'build50', name: 'Architect',       emoji: '🏛️', desc: 'Place 50 parts.',                   test: (s) => s.stats.placed >= 50 },
    { id: 'balls5',  name: 'Collector',       emoji: '🎱', desc: 'Own 5 ball types.',                 test: (s) => Object.keys(s.balls).length >= 5 },
    { id: 'mult25',  name: 'On A Heater',     emoji: '🔥', desc: 'Reach 25× MULT.',                   test: (s) => s.stats.bestMult >= 25 },
    { id: 'mult100', name: 'Unstoppable',     emoji: '🌋', desc: 'Reach 100× MULT.',                  test: (s) => s.stats.bestMult >= 100 },
    { id: 'trink3',  name: 'Card Sharp',      emoji: '🃏', desc: 'Own 3 trinkets.',                   test: (s) => s.trinkets.length >= 3 },
    { id: 'prestige',name: 'Reforged',        emoji: '♻️', desc: 'Prestige once.',                    test: (s) => s.gems > 0 || s.stats.prestiges > 0 },
    { id: 'paddle',  name: 'Hands On',        emoji: '🏓', desc: 'Install a paddle above floor 0.',   test: (s) => s.stats.paddles >= 1 },
    { id: 'idle1k',  name: 'Money Printer',   emoji: '🪙', desc: 'Reach 100 coins/sec idle.',         test: (s) => s.stats.bestIdle >= 100 },
  ];

  /* =====================================================================
   * PRESTIGE
   * ================================================================== */
  const prestigeGems = (lifetimeChips) => Math.floor(Math.pow(Math.max(0, lifetimeChips) / 1e6, 0.42));
  const gemBonus = (gems) => 1 + gems * 0.15;         // global chip + coin multiplier

  IP.data = {
    W, C, FLOORS, floorMult, floorCost,
    PARTS, PART_BY_ID, chipsFor,
    BALLS, BALL_BY_ID,
    UPGRADES, UP_BY_ID, upgradeCost,
    TRINKETS, TRINKET_BY_ID, RARITY,
    MEDALS, prestigeGems, gemBonus,
  };
})(window);
