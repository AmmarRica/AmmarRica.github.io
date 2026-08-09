/* =========================================================================
 * TOWER OF CHIPS — game core
 * Save state, the run loop, the scoring pipeline, balls, effects and the
 * `A` API that every part / trinket in data.js talks to.
 * ====================================================================== */
(function (global) {
  'use strict';

  const IP = global.IP;
  const U = IP.util;
  const D = IP.data;
  const W = D.W;

  const R = () => IP.rng;   // read live: IP.reseed() swaps the streams

  const SAVE_KEY = 'towerOfChips.v1';
  const SAVE_EVERY = 6;         // seconds

  /* ===================================================================
   * DEFAULT SAVE
   * ================================================================ */
  function freshState() {
    return {
      v: 1,
      coins: 0,
      gems: 0,
      floors: 3,
      parts: [],            // an empty table: everything on it is bought
      upgrades: {},
      balls: { steel: 1 },
      loadout: 'steel',
      trinkets: [],
      panels: [
        { key: 'a', label: 'PANEL 1' },
        { key: 'd', label: 'PANEL 2' },
        { key: 'w', label: 'PANEL 3' },
        { key: 's', label: 'PANEL 4' },
        { key: 'q', label: 'PANEL 5' },
        { key: 'e', label: 'PANEL 6' },
      ],
      seed: (Date.now() ^ 0x9e3779b9) >>> 0,
      medals: {},
      known: null,          // unlocks already announced (null = seed on first load)
      seen: {},             // unlocks the player has actually looked at
      missions: [],
      counters: {},
      perks: {},
      ballLevels: { steel: 1 },
      settings: { sound: true, shake: true, particles: true, depth: true, autoRun: true, assist: false },
      // Update enforcement. `seen`/`seenAt` are only ever written from a
      // check that actually reached the server — a failed check must never
      // start the clock, or a month offline would lock a game whose whole
      // selling point is that it plays offline.
      update: { seen: null, seenAt: 0, notesFor: null, ran: null },
      stats: {
        totalChips: 0, bestRun: 0, bestFloor: 0, bestMult: 1, runs: 0,
        placed: 0, prestiges: 0, bestIdle: 0, drains: 0, playTime: 0, launches: 0,
        bestCombo: 0, missionsDone: 0, paddles: 0,
      },
      lastSeen: Date.now(),
      tutorialSeen: false,
    };
  }

  /* ===================================================================
   * TINY SYNTH — no assets, no network.
   * ================================================================ */
  const Sfx = (function () {
    let ac = null, master = null, enabled = true;
    function ensure() {
      if (ac) return ac;
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0.16;
      master.connect(ac.destination);
      return ac;
    }
    const NOTES = {
      pop: [520, 'square', 0.06, 0.5], sling: [340, 'sawtooth', 0.07, 0.45],
      boing: [220, 'sine', 0.13, 0.6], target: [720, 'square', 0.09, 0.5],
      spin: [880, 'triangle', 0.04, 0.3], blip: [1040, 'square', 0.05, 0.35],
      jackpot: [660, 'sawtooth', 0.3, 0.6], mult: [420, 'square', 0.16, 0.55],
      totem: [300, 'triangle', 0.12, 0.5], coin: [1200, 'square', 0.07, 0.4],
      vault: [500, 'sawtooth', 0.22, 0.55], portal: [760, 'sine', 0.16, 0.45],
      split: [420, 'square', 0.2, 0.5], laser: [1400, 'sawtooth', 0.05, 0.3],
      rail: [600, 'triangle', 0.06, 0.3], save: [300, 'square', 0.2, 0.6],
      flip: [150, 'square', 0.04, 0.3], launch: [180, 'sawtooth', 0.24, 0.5],
      drain: [140, 'sine', 0.45, 0.5], buy: [880, 'square', 0.09, 0.4],
      place: [560, 'triangle', 0.07, 0.4], error: [120, 'square', 0.14, 0.4],
      levelup: [760, 'square', 0.25, 0.5], load: [400, 'triangle', 0.1, 0.4],
      tilt: [90, 'sawtooth', 0.5, 0.6], win: [880, 'square', 0.4, 0.5],
    };
    function play(name, detune) {
      if (!enabled) return;
      const c = ensure(); if (!c) return;
      if (c.state === 'suspended') c.resume();
      const cfg = NOTES[name] || NOTES.pop;
      const t = c.currentTime;
      const o = c.createOscillator(), gn = c.createGain();
      o.type = cfg[1];
      o.frequency.setValueAtTime(cfg[0] * (1 + (detune || 0)), t);
      o.frequency.exponentialRampToValueAtTime(Math.max(40, cfg[0] * cfg[3]), t + cfg[2]);
      gn.gain.setValueAtTime(0.0001, t);
      gn.gain.exponentialRampToValueAtTime(0.5, t + 0.006);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + cfg[2]);
      o.connect(gn); gn.connect(master);
      o.start(t); o.stop(t + cfg[2] + 0.02);
    }
    return { play, set enabled(v) { enabled = v; }, get enabled() { return enabled; }, resume() { const c = ensure(); if (c && c.state === 'suspended') c.resume(); } };
  })();

  /* ===================================================================
   * GAME
   * ================================================================ */
  const g = {
    state: freshState(),
    world: null,
    renderer: null,
    balls: [],
    particles: [],
    popups: [],
    floaters: [],
    time: 0,
    // Last removal, kept so it can be put back. Deliberately on `g` and not
    // on `g.state`: it is a session-scoped safety net, and everything hung
    // off state gets serialised.
    undo: null,
    running: false,
    paused: false,
    demo: false,
    awaitLaunch: true,
    plunger: { pull: 0, holding: false },
    // Set when a required update is overdue. The table stops; the menu does
    // not, so the save can still be exported.
    locked: false,
    build: { on: false, raze: false, floor: 0, sel: null, ghost: null, ghostErr: null, dragging: null },
    cannon: null,
    run: { active: false, score: 0, ballsLeft: 0, ballNo: 0, startedAt: 0, chipsThisBall: 0, floorsThisRun: 0 },
    mult: 1, multBase: 1, multPeak: 1, multFreeze: 0,
    camY: 0, camTarget: 0,
    shake: 0,
    flags: {},
    trinketFx: {},
    idleRate: 0,
    alpha: 0, prevCamY: 0, shakeX: 0, shakeY: 0,
    lastSave: 0,
    tilt: 0, nudgesLeft: 0,
    ballSaveT: 0,
    listeners: {},
  };

  /* --------------------------------------------------------------- */
  const on = (ev, fn) => ((g.listeners[ev] = g.listeners[ev] || []).push(fn), fn);
  const emit = (ev, a, b) => { (g.listeners[ev] || []).forEach((f) => f(a, b)); };

  /* ===================================================================
   * DERIVED STATS
   * ================================================================ */
  function up(id) { return g.state.upgrades[id] || 0; }

  function recomputeTrinkets() {
    const fx = {
      chipMults: [], multAdds: [], multMults: [], coinMult: 1, decayMult: 1,
      gravMult: 1, massMult: 1, fieldMult: 1, costMult: 1, fullRefund: false,
      echo: 0, ballDelta: 0, extraBall: 0, ratchetMult: false, noDrag: false,
      novaBonus: 0, hooks: {},
    };
    for (const id of g.state.trinkets) {
      const t = D.TRINKET_BY_ID[id];
      if (!t) continue;
      if (t.chipMult) fx.chipMults.push(t.chipMult);
      if (t.multAdd) fx.multAdds.push(t.multAdd);
      if (t.multMult) fx.multMults.push(t.multMult);
      if (t.coinMult) fx.coinMult *= t.coinMult;
      if (t.decayMult) fx.decayMult *= t.decayMult;
      if (t.gravMult) fx.gravMult *= t.gravMult;
      if (t.massMult) fx.massMult *= t.massMult;
      if (t.fieldMult) fx.fieldMult *= t.fieldMult;
      if (t.costMult) fx.costMult *= t.costMult;
      if (t.fullRefund) fx.fullRefund = true;
      if (t.echo) fx.echo = Math.max(fx.echo, t.echo);
      if (t.ballDelta) fx.ballDelta += t.ballDelta;
      if (t.extraBall) fx.extraBall += t.extraBall;
      if (t.ratchetMult) fx.ratchetMult = true;
      if (t.noDrag) fx.noDrag = true;
      if (t.novaBonus) fx.novaBonus = Math.max(fx.novaBonus, t.novaBonus);
      if (t.on) for (const k in t.on) (fx.hooks[k] = fx.hooks[k] || []).push(t.on[k]);
    }
    g.trinketFx = fx;
    g.state.trinketFx = fx;
    if (g.world) { g.world.fieldMult = fx.fieldMult; g.world.noDrag = fx.noDrag; }
    return fx;
  }

  function trinketHook(name, arg) {
    const hs = g.trinketFx.hooks && g.trinketFx.hooks[name];
    if (hs) for (const h of hs) h(A, arg);
  }

  const gemMul = () => D.gemBonus(g.state.gems);
  const ballDef = () => D.BALL_BY_ID[g.state.loadout] || D.BALL_BY_ID.steel;
  const perk = (id) => (g.state.perks && g.state.perks[id]) || 0;
  const ballLevel = (id) => (g.state.ballLevels && g.state.ballLevels[id || g.state.loadout]) || 1;
  const ballScoreMul = () => D.ballScore(ballDef(), ballLevel());
  const ballCoinMul = () => D.ballCoin(ballDef(), ballLevel());

  function ballsPerRun() {
    return Math.max(1, 3 + up('balls') + (g.trinketFx.ballDelta || 0));
  }

  function baseMult() {
    let m = 1 + 0.35 * up('multBase') + 0.5 * perk('mult');
    for (const f of g.trinketFx.multAdds || []) m += f(A);
    for (const f of g.trinketFx.multMults || []) m *= f(A);
    return Math.max(1, m);
  }

  function coinRate() {
    return 0.045 * (1 + 0.14 * up('coinYield')) * gemMul() * ballCoinMul()
      * (1 + 0.25 * perk('coins')) * (g.trinketFx.coinMult || 1);
  }

  function idlePerSec() {
    let sum = 0;
    for (const p of g.state.parts) {
      const def = D.PART_BY_ID[p.id];
      if (!def || !def.idle) continue;
      if (p.floor >= g.state.floors) continue;
      sum += def.idle(p);
    }
    return sum * (1 + 0.16 * up('idleRate')) * (1 + 0.4 * perk('idle')) * gemMul() * (g.trinketFx.coinMult || 1);
  }

  const slotsUsed = (floor) => g.state.parts.filter((p) => p.floor === floor).length;
  const slotBonus = () => 2 * perk('slots');

  /* ===================================================================
   * WORLD
   * ================================================================ */
  function rebuild() {
    g.state.gapCache = [];
    for (let k = 1; k < g.state.floors; k++) g.state.gapCache.push({ floor: k, x: IP.table.gapX(k), y: IP.table.deckY(k) });
    recountTypes();
    g.world = IP.table.build(g.state);
    g.world.gravity = W.GRAVITY * (1 - 0.026 * up('lowGrav')) * (g.trinketFx.gravMult || 1);
    g.world.fieldMult = g.trinketFx.fieldMult || 1;
    g.world.noDrag = !!g.trinketFx.noDrag;
    emit('rebuild');
  }

  /* ===================================================================
   * BALLS
   * ================================================================ */
  function makeBall(defId, x, y, vx, vy) {
    const def = D.BALL_BY_ID[defId] || D.BALL_BY_ID.steel;
    const mm = g.trinketFx.massMult || 1;
    return {
      uid: U.uid('b'), def,
      p: { x, y }, v: { x: vx || 0, y: vy || 0 },
      r: def.r, mass: def.mass * mm, massForce: def.mass * mm,
      e: def.e, grav: def.grav, drag: def.drag || 0,
      magnetic: def.magnetic || 1, pullsBalls: def.pullsBalls || 0,
      slick: !!def.slick, alive: true, age: 0,
      trail: [], held: null, holdTo: null, holdCd: 0, portalCd: 0,
      chips: 0, maxFloor: 0, phantom: false, hits: 0,
      lastHit: g.time, dryKicked: false, slowT: 0, searches: 0,
      pp: { x: x, y: y },          // previous position, for render interpolation
    };
  }

  function spawnBall(opts) {
    opts = opts || {};
    const lane = g.world.meta.lane;
    const b = makeBall(opts.type || g.state.loadout, opts.x != null ? opts.x : lane.x, opts.y != null ? opts.y : lane.bottom + 4, opts.vx, opts.vy);
    if (opts.phantom) { b.phantom = true; }
    g.balls.push(b);
    return b;
  }

  const floorOf = (y) => U.clamp(Math.floor(y / W.FLOOR_H), 0, W.MAX_FLOORS - 1);

  /* ===================================================================
   * SCORING PIPELINE  (chips × mult, Balatro-style)
   * ================================================================ */
  /** How many copies of a part type are installed (cached per rebuild). */
  function typeCount(id) {
    if (!g.typeCounts) return 0;
    return g.typeCounts[id] || 0;
  }
  function recountTypes() {
    const c = {};
    for (const p of g.state.parts) {
      if (p.floor >= g.state.floors) continue;
      c[p.id] = (c[p.id] || 0) + 1;
    }
    g.typeCounts = c;
  }

  function chipMultiplier(ev) {
    let m = (1 + 0.12 * up('chipGain')) * ballScoreMul() * gemMul() * (1 + 0.25 * perk('chips'));
    if (ev.tag === 'bumper' || ev.tag === 'sling' || ev.tag === 'tramp') m *= (1 + 0.15 * up('bumperV'));
    // Owning a round number of one part type doubles that whole type's output.
    if (ev.inst) m *= D.milestoneMult(typeCount(ev.inst.id));
    for (const f of g.trinketFx.chipMults || []) m *= f(A, ev);
    return m;
  }

  function score(chips, inst, opts) {
    opts = opts || {};
    const floor = opts.floor != null ? opts.floor : (inst ? inst.floor : (g.balls[0] ? floorOf(g.balls[0].p.y) : 0));
    const ev = { tag: opts.tag || (inst ? inst.id : 'misc'), floor, inst };
    let base = chips * D.floorMult(floor) * chipMultiplier(ev);
    if (opts.luckJackpot) base *= 25;
    const gained = Math.max(0, Math.round(base * g.mult));
    if (gained <= 0) return 0;

    // Combo = consecutive scoring hits inside the MULT window.
    if (!opts._echo) {
      g.combo = (g.sinceHit || 0) < comboWindow() ? (g.combo || 0) + 1 : 1;
      if (g.combo > g.state.stats.bestCombo) g.state.stats.bestCombo = g.combo;
    }
    g.sinceHit = 0;
    g.run.score += gained;
    if (g.run.score > g.state.stats.bestRun) g.state.stats.bestRun = g.run.score;
    g.run.chipsThisBall += gained;
    g.state.stats.totalChips += gained;
    const cn = gained * coinRate();
    g.state.coins += cn;
    count('coins', cn);
    if (g.activeBall) g.activeBall.chips += gained;

    if (inst) { inst._glow = 1; inst.earned = (inst.earned || 0) + gained; }
    if (!opts.silent) {
      const px = inst ? inst.x : (g.balls[0] ? g.balls[0].p.x : 50);
      const py = (inst ? inst.y : (g.balls[0] ? g.balls[0].p.y : 50)) + 6;
      popup(px, py, opts.label ? opts.label + ' ' + U.fmt(gained) : '+' + U.fmt(gained),
        opts.pop ? D.C.gold : D.C.blue, opts.pop ? 20 : 14);
    }
    // Echo Chamber re-trigger.
    if (g.trinketFx.echo && !opts._echo) {
      score(chips * g.trinketFx.echo, inst, Object.assign({}, opts, { _echo: true, silent: true }));
    }
    emit('score', gained);
    return gained;
  }

  function addMult(x, big) {
    if (!(x > 0)) return;
    g.mult += x;
    if (g.mult > g.multPeak) g.multPeak = g.mult;
    if (g.mult > g.state.stats.bestMult) g.state.stats.bestMult = g.mult;
    if (big) { popupScreen('+' + x.toFixed(1) + ' MULT', D.C.red); }
    emit('mult', g.mult);
  }

  function freezeMult(t) { g.multFreeze = Math.max(g.multFreeze, t); }

  /** Seconds of grace after a hit before MULT starts sliding back. */
  function comboWindow() {
    return (1.5 + 0.16 * up('combo')) / (g.trinketFx.decayMult || 1);
  }

  /**
   * MULT holds while you keep the combo alive and only bleeds once the ball
   * goes quiet — that is the whole rhythm of the game, so it is a window
   * rather than a constant drain.
   */
  function decayMult(dt) {
    const base = baseMult();
    g.sinceHit = (g.sinceHit || 0) + dt;
    if (g.multFreeze > 0) { g.multFreeze -= dt; return; }
    if (g.trinketFx.ratchetMult) { g.mult = Math.max(g.mult, g.multPeak); return; }
    if (g.sinceHit < comboWindow()) return;
    g.combo = 0;
    const rate = 1.15 * (g.trinketFx.decayMult || 1);
    if (g.mult > base) g.mult = Math.max(base, g.mult - (g.mult - base) * rate * dt - dt * 0.08);
    else g.mult = base;
  }

  /* ===================================================================
   * EFFECTS
   * ================================================================ */
  function burst(x, y, color, n) {
    if (!g.state.settings.particles) return;
    n = Math.min(n, 30);
    for (let i = 0; i < n; i++) {
      const a = R().fx.angle(), sp = R().fx.rand(12, 62);
      g.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: R().fx.rand(0.3, 0.75), max: 0.75, color, size: R().fx.rand(3, 7),
        rot: R().fx.rand(0, 6), vr: R().fx.rand(-8, 8),
      });
    }
    if (g.particles.length > 620) g.particles.splice(0, g.particles.length - 620);
  }

  function popup(x, y, text, color, size) {
    g.popups.push({ x, y, text, color: color || D.C.cream, size: size || 14, life: 0.85, max: 0.85, tilt: R().fx.rand(-0.16, 0.16) });
    if (g.popups.length > 60) g.popups.shift();
  }

  function popupScreen(text, color) { emit('flash', { text, color }); }

  function shake(n) { if (g.state.settings.shake) g.shake = Math.min(16, g.shake + n); }

  function sfx(name, d) { if (g.state.settings.sound) Sfx.play(name, d); }

  /* ===================================================================
   * PART EVENT PLUMBING
   * ================================================================ */
  const TRIGGER_CD = 0.18;

  function partHit(ball, col, info) {
    const inst = col.part;
    if (!inst) return;
    const def = D.PART_BY_ID[inst.id];
    if (!def) return;
    ball.hits++;
    const key = inst.uid;
    ball._cd = ball._cd || {};
    if (g.time - (ball._cd[key] || -9) < TRIGGER_CD) return;
    ball._cd[key] = g.time;
    ball.lastHit = g.time;
    ball.dryKicked = false;
    g.activeBall = ball;
    count('hits');
    if (inst.id === 'target' && inst.t_down <= 0) count('targets');
    trinketHook('hit', inst);
    const luck = (ball.def.luck || 0) + 0.015 * perk('luck');
    if (luck > 0 && R().sim.chance(luck)) {
      score(400, inst, { pop: true, label: 'LUCKY', luckJackpot: true });
      burst(inst.x, inst.y, D.C.green, 20);
      sfx('jackpot');
    }
    def.onHit(A, inst, ball, col, info);
    // Plasma re-lights drop targets it smashes; quantum sometimes splits.
    if (ball.def.plasma && inst.id === 'target') inst.t_down = 0;
    if (ball.def.splitChance && col.tag === 'bumper' && R().sim.chance(ball.def.splitChance) && g.balls.length < 9) {
      splitBall(ball);
    }
    checkFloorProgress(ball);
  }

  function sensorHit(ball, col) { partHit(ball, col, { speed: U.vlen(ball.v) }); }

  /**
   * Flipping pays. On an empty table this is the player's entire income, and
   * it never stops mattering because it rewards the one thing no purchase can
   * do for you: a clean, hard hit. Payout scales with impact speed.
   */
  function flipperHit(ball, f, info) {
    if (info.speed > 25) sfx('flip', R().audio.rand(-0.1, 0.1));
    if (f.part) {
      const def = D.PART_BY_ID[f.part.id];
      if (def) { f.part._glow = 1; def.onHit(A, f.part, ball, null, info); }
    }
    if (g.time - (f.lastPay || -9) > 0.25 && info.speed > 18) {
      f.lastPay = g.time;
      const solid = info.speed > 95;
      const floor = floorOf(f.pivot.y);
      score(Math.round(2 + info.speed * 0.06), null, {
        floor, tag: 'flipper', pop: solid, label: solid ? 'SMACK' : null,
      });
      addMult(solid ? 0.14 : 0.05);
      ball.lastHit = g.time;
      ball.dryKicked = false;
      if (solid) burst(ball.p.x, ball.p.y, D.C.gold, 6);
    }
    checkFloorProgress(ball);
  }

  /** Scoring for built-in table furniture (the shell slingshots). */
  function shellHit(ball, col, info) {
    if (g.time - (col.lastPay || -9) < 0.2) return;
    col.lastPay = g.time;
    score(col.pay, null, { floor: floorOf(ball.p.y), tag: 'shell' });
    addMult(0.04);
    ball.lastHit = g.time;
    ball.dryKicked = false;
    sfx('sling');
  }

  /* ===================================================================
   * FLOOR PROGRESS / BONUSES
   * ================================================================ */
  /**
   * Climbing is the game, so climbing pays on its own — every upward pass
   * through a floor opening scores, not just the first one of a run. Without
   * this a ball can circulate happily between two floors earning nothing,
   * which is exactly what an empty upper floor used to feel like.
   */
  function checkCrossing(ball) {
    const f = floorOf(ball.p.y);
    if (ball.band == null) { ball.band = f; return; }
    if (f === ball.band) return;
    const climbed = f > ball.band;
    ball.band = f;
    if (!climbed) return;
    ball.lastHit = g.time;
    ball.dryKicked = false;
    score(140, null, { pop: true, label: 'CLIMB', floor: f });
    addMult(0.45);
    count('climbs');
    burst(ball.p.x, ball.p.y, D.C.green, 12);
    sfx('rail');
  }

  function checkFloorProgress(ball) {
    checkCrossing(ball);
    const f = floorOf(ball.p.y);
    if (f <= ball.maxFloor) return;
    ball.maxFloor = f;
    if (f > g.run.floorsThisRun) {
      g.run.floorsThisRun = f;
      const sc = up('scaffold');
      if (sc > 0) score(500 * sc * f, null, { pop: true, label: 'CLIMB', floor: f });
      trinketHook('newFloor', f);
      // Multiball reward for opening up a new floor.
      const mb = up('multiball');
      if (mb > 0 && R().sim.chance(mb * 0.06) && g.balls.length < 8) {
        spawnBall({ x: ball.p.x, y: ball.p.y, vx: R().sim.rand(-30, 30), vy: 40, phantom: true });
        popupScreen('MULTIBALL!', D.C.teal);
        sfx('split');
      }
    }
    if (f > g.state.stats.bestFloor) {
      g.state.stats.bestFloor = f;
      popupScreen('FLOOR ' + f + ' — ' + (D.FLOORS[f] ? D.FLOORS[f].name : ''), D.C.gold);
      sfx('levelup');
      shake(6);
    }
  }

  function checkTargetBank(floor) {
    const ts = g.state.parts.filter((p) => p.id === 'target' && p.floor === floor);
    if (ts.length < 2 || ts.some((t) => t.t_down <= 0)) return;
    const pay = 900 * ts.length * (1 + floor);
    score(pay, ts[0], { pop: true, label: 'BANK' });
    addMult(1 + ts.length * 0.5, true);
    ts.forEach((t) => { t.t_down = 0; });
    count('banks');
    burst(ts[0].x, ts[0].y, D.C.gold, 28);
    shake(9);
    sfx('win');
  }

  function checkLaneSet(floor) {
    const ls = g.state.parts.filter((p) => p.id === 'rollover' && p.floor === floor);
    if (ls.length < 2 || ls.some((l) => !l.lit)) return;
    ls.forEach((l) => { l.lit = false; });
    addMult(1 + 0.4 * ls.length, true);
    score(400 * ls.length * (1 + floor), ls[0], { pop: true, label: 'LANES' });
    burst(ls[0].x, ls[0].y, D.C.blue, 20);
    sfx('win');
  }

  /* ===================================================================
   * SPECIAL BALL ACTIONS
   * ================================================================ */
  function holdBall(ball, inst, time, cb) {
    if (ball.held) return;
    ball.held = true;
    ball.holdTo = { x: inst.x, y: inst.y };
    ball.holdT = time;
    ball.holdCb = cb;
  }

  /**
   * Carry a ball upward on a platform. The travel is clamped so a lift can
   * never shove a ball through the deck above it.
   */
  function liftBall(ball, inst, dist, time, cb) {
    if (ball.held) return;
    const ceil = IP.table.ceilingAt(g.state, inst.floor, inst.x) - ball.r - 2;
    const top = Math.min(inst.y + dist, ceil);
    if (top <= inst.y + 4) { ball.holdCd = 0.5; return; }   // no headroom: skip
    ball.held = true;
    ball.holdTo = { x: inst.x, y: inst.y };
    ball.holdT = time;
    ball.lift = { x: inst.x, y0: inst.y, y1: top, t: 0, T: time };
    ball.holdCb = cb;
  }

  function grantBallSave(sec) {
    g.ballSaveT = Math.max(g.ballSaveT, sec);
    popupScreen('BALL SAVE ARMED', D.C.green);
  }

  function splitBall(src) {
    if (g.balls.length >= 10) return;
    const nb = spawnBall({
      type: src.def.id, x: src.p.x, y: src.p.y,
      vx: -src.v.x * 0.7 + R().sim.rand(-20, 20), vy: Math.abs(src.v.y) * 0.7 + 30, phantom: true,
    });
    nb.phantom = true;
    popupScreen('SPLIT!', D.C.teal);
    return nb;
  }

  function otherPortal(inst) {
    const ps = g.state.parts.filter((p) => p.id === 'portal' && p.uid !== inst.uid && p.floor < g.state.floors);
    if (!ps.length) return null;
    // Prefer the portal above — this game is about climbing.
    ps.sort((a, b) => b.y - a.y);
    return ps[0];
  }

  function loadCannon(inst, ball) {
    ball.held = true;
    ball.holdTo = { x: inst.x, y: inst.y };
    ball.holdT = 999;
    g.cannon = { inst, ball, ang: inst.a || Math.PI / 2, power: 1 };
    emit('cannon', g.cannon);
  }

  function fireCannon() {
    if (!g.cannon) return;
    const { inst, ball, ang, power } = g.cannon;
    const sp = (170 + inst.lvl * 10) * U.clamp(power, 0.3, 1);
    ball.held = false; ball.holdTo = null; ball.holdCd = 0.4;
    ball.v.x = Math.cos(ang) * sp;
    ball.v.y = Math.sin(ang) * sp;
    burst(inst.x, inst.y, D.C.red, 20);
    shake(7);
    sfx('launch');
    g.cannon = null;
    emit('cannon', null);
  }

  /* ===================================================================
   * DRAIN / RUN FLOW
   * ================================================================ */
  function drain(ball) {
    ball.alive = false;
    g.state.stats.drains++;
    burst(ball.p.x, 2, ball.def.color, 14);

    if (ball.def.nova || g.trinketFx.novaBonus) {
      const mult = Math.max(ball.def.nova || 0, g.trinketFx.novaBonus || 0);
      if (mult > 0 && ball.chips > 0) {
        const pay = Math.round(ball.chips * mult / Math.max(1, g.mult));
        score(pay, null, { pop: true, label: 'NOVA', floor: 0 });
        shake(12);
        sfx('jackpot');
      }
    }

    g.balls = g.balls.filter((b) => b.alive);
    if (g.balls.length > 0) return;             // multiball still running

    // Ball save window.
    if (g.ballSaveT > 0 && !g.demo) {
      g.ballSaveT = 0;
      popupScreen('BALL SAVED', D.C.green);
      sfx('save');
      startBall(true);
      return;
    }

    sfx('drain');
    g.run.ballNo++;
    g.run.ballsLeft--;
    if (g.run.ballsLeft <= 0) endRun();
    else startBall();
  }

  function startRun() {
    if (g.locked) return;
    // ⚠️ Reseed per run: the same save replays the same run, and a bug
    // report only needs the seed and the run number to reproduce.
    IP.reseed((g.state.seed ^ Math.imul(g.state.stats.runs + 1, 2654435761)) >>> 0);
    g.run.active = true;
    g.run.score = 0;
    g.run.ballsLeft = ballsPerRun();
    g.run.ballNo = 1;
    g.run.floorsThisRun = 0;
    g.run.startedAt = g.time;
    g.state.stats.runs++;
    g.balls = [];
    g.mult = baseMult(); g.multPeak = g.mult;
    resetPartRuntime();
    startBall();
    emit('run', g.run);
  }

  function startBall(saved) {
    g.balls = [];
    g.mult = baseMult(); g.multPeak = g.mult;
    g.multFreeze = 0;
    g.combo = 0; g.sinceHit = 99;
    g.run.chipsThisBall = 0;
    g.nudgesLeft = 2 + up('nudge');
    g.tilt = 0;
    g.ballSaveT = 2.5 * up('ballSave');
    g.awaitLaunch = true;
    g.plunger.pull = 0;
    resetPerBallRuntime();
    const b = spawnBall({});
    b.v.x = 0; b.v.y = 0;
    if (g.trinketFx.extraBall) {
      for (let i = 0; i < g.trinketFx.extraBall; i++) {
        const e = spawnBall({ y: g.world.meta.lane.bottom + 10 + i * 6 });
        e.phantom = true;
      }
    }
    trinketHook('ballStart');
    emit('ball', g.run);
    if (saved) g.ballSaveT = 0;
  }

  function endRun() {
    g.run.active = false;
    const sc = g.run.score;
    if (sc > g.state.stats.bestRun) g.state.stats.bestRun = sc;
    const bonus = Math.round(sc * coinRate() * 0.5);
    g.state.coins += bonus;
    emit('runEnd', { score: sc, bonus, best: g.state.stats.bestRun });
    save();
    if (g.state.settings.autoRun || g.demo) {
      setTimeout(() => { if (!g.run.active) startRun(); }, g.demo ? 300 : 1400);
    }
  }

  function resetPartRuntime() {
    for (const p of g.state.parts) {
      p.t_down = 0; p.lit = false; p.hits = 0; p.used = 0; p.rech = 0; p.cd = 0; p.charge = 0;
    }
  }
  function resetPerBallRuntime() {
    // Bumper pops and kicker charges both refill at the start of a ball.
    for (const p of g.state.parts) { p.used = 0; p.rech = 0; p.lit = false; p.t_down = 0; }
    g.flags = {};
  }

  /* ===================================================================
   * PLUNGER / NUDGE
   * ================================================================ */
  function plungerDown() { if (g.awaitLaunch) g.plunger.holding = true; }

  function plungerRelease() {
    if (g.locked) return;
    if (!g.awaitLaunch) return;
    g.plunger.holding = false;
    const pw = U.clamp(g.plunger.pull, 0.06, 1);
    const power = (108 + 124 * pw) * (1 + 0.06 * up('plunger'));
    const b = g.balls.find((x) => x.alive && x.p.y < 30 && x.p.x > IP.table.LANE_X);
    const targets = b ? [b] : g.balls.filter((x) => x.alive);
    for (const bb of targets) { bb.v.y = power; bb.v.x = R().sim.rand(-3, 3); }
    g.plunger.pull = 0;
    g.awaitLaunch = false;
    g.state.stats.launches++;
    count('launches');
    score(Math.round(5 + 12 * pw), null, { floor: 0, tag: 'launch', pop: pw > 0.9, label: pw > 0.9 ? 'FULL PLUNGE' : null });
    sfx('launch');
    shake(4);
    // Skill shot: a full-power plunge that flies straight into the first gap.
    if (up('skill') > 0 && pw > 0.86) {
      score(200 * up('skill'), null, { pop: true, label: 'SKILL', floor: 1 });
    }
  }

  function nudge(dir) {
    if (g.nudgesLeft <= 0 || g.tilt > 0.98) return;
    g.nudgesLeft--;
    g.world.nudgeX = dir * 220;
    g.world.nudgeY = 90;
    setTimeout(() => { if (g.world) { g.world.nudgeX = 0; g.world.nudgeY = 0; } }, 90);
    g.tilt = Math.min(1, g.tilt + 0.34);
    shake(6);
    sfx('flip');
    if (g.tilt >= 1) {
      popupScreen('TILT!', D.C.red);
      sfx('tilt');
      g.balls.forEach((b) => { b.v.x *= 0.1; b.v.y = -80; });
    }
  }

  /* ===================================================================
   * ECONOMY
   * ================================================================ */
  /* ===================================================================
   * UPDATE ENFORCEMENT
   *
   * A newer build becomes mandatory GRACE_DAYS after this install first saw
   * it. Two rules keep that from bricking a legitimate player:
   *
   *  1. The clock starts from a check that reached the server. Being offline
   *     is not evidence that an update exists, and an offline-capable game
   *     that locks you out for being offline is broken, not strict.
   *  2. A clock that has moved backwards resets rather than accumulating.
   *     Otherwise a device with a wrong date locks a player out on day one
   *     with no way to argue.
   * ================================================================ */
  const GRACE_DAYS = 30;
  const DAY_MS = 86400000;

  function updRec() {
    if (!g.state.update) g.state.update = { seen: null, seenAt: 0, notesFor: null, ran: null };
    return g.state.update;
  }

  /**
   * Record a version observed on the server. Only a strictly newer version
   * starts the clock — a rollback is not something to lock anyone out over.
   */
  function noteVersionSeen(v) {
    const u = updRec();
    if (!v) return u;
    if (U.cmpVer(v, IP.VERSION) <= 0) {           // we are current (or ahead)
      u.seen = null; u.seenAt = 0;
      save();
      return u;
    }
    if (!u.seen || U.cmpVer(v, u.seen) > 0) {     // a newer one than we knew
      u.seen = v;
      u.seenAt = Date.now();
      save();
    }
    return u;
  }

  /** Days left before the pending update becomes mandatory, or null. */
  function updateDeadline() {
    const u = updRec();
    if (!u.seen || U.cmpVer(u.seen, IP.VERSION) <= 0) return null;
    const now = Date.now();
    if (!u.seenAt || u.seenAt > now) {            // clock moved back — restart it
      u.seenAt = now;
      save();
    }
    const elapsed = (now - u.seenAt) / DAY_MS;
    return { version: u.seen, elapsed, daysLeft: Math.max(0, GRACE_DAYS - elapsed), overdue: elapsed >= GRACE_DAYS };
  }

  /** Re-evaluate the lock. Returns true if the game is locked. */
  function enforceUpdate() {
    const d = updateDeadline();
    const locked = !!(d && d.overdue);
    if (locked !== g.locked) {
      g.locked = locked;
      if (locked) { g.paused = true; save(); }
      emit('locked', locked);
    }
    return locked;
  }

  /** A part without its runtime cache — safe to store, clone or serialise. */
  function cleanPart(p) {
    const q = {};
    for (const k in p) if (k.charAt(0) !== '_') q[k] = p[k];
    return q;
  }

  function canAfford(n) { return g.state.coins >= n; }
  function pay(n) { if (g.state.coins < n) return false; g.state.coins -= n; return true; }
  function coins(n) { g.state.coins += n; }

  function buyPart(defId, x, y, floor, a) {
    const def = D.PART_BY_ID[defId];
    if (!def) return { ok: false, err: 'Unknown part' };
    if (floor < def.floor) return { ok: false, err: 'Unlocks on floor ' + def.floor };
    const cost = IP.table.partCost(g.state, def);
    if (!canAfford(cost)) return { ok: false, err: 'Not enough coins' };
    const err = IP.table.placeError(g.state, def, x, y, floor, null);
    if (err) return { ok: false, err };
    pay(cost);
    const inst = IP.table.newInstance(defId, x, y, floor, a);
    if (def.flipper) { inst.side = x < 50 ? 'L' : 'R'; inst.panel = x < 50 ? 0 : 1; }
    g.state.parts.push(inst);
    g.state.stats.placed++;
    if (def.flipper && floor > 0) g.state.stats.paddles = (g.state.stats.paddles || 0) + 1;
    rebuild(); save();
    sfx('place');
    return { ok: true, inst, cost };
  }

  /**
   * Remove a set of parts and bank the refund, keeping enough to put them
   * back. Refunds are summed as the parts leave one at a time, because
   * refundValue() prices a part off how many of its type you still own —
   * charging every copy the top-of-stack price would pay out more for a
   * batch than for the same parts sold individually.
   */
  function removeParts(list, label) {
    const ids = new Set(list.map((p) => p.uid));
    if (!ids.size) return 0;
    const gone = [];
    let refund = 0;
    for (let i = g.state.parts.length - 1; i >= 0; i--) {
      const p = g.state.parts[i];
      if (!ids.has(p.uid)) continue;
      refund += IP.table.refundValue(g.state, p);
      gone.push(cleanPart(p));
      g.state.parts.splice(i, 1);
    }
    if (!gone.length) return 0;
    coins(refund);
    g.undo = { parts: gone.reverse(), refund, label: label || gone.length + ' parts' };
    rebuild(); save();
    sfx('coin');
    return refund;
  }

  function sellPart(uid) {
    const p = g.state.parts.find((x) => x.uid === uid);
    if (!p) return false;
    const def = D.PART_BY_ID[p.id];
    return removeParts([p], (def && def.name) || 'part');
  }

  /** Clear a floor in one go, as one undoable step. */
  function sellFloor(floor) {
    const on = g.state.parts.filter((p) => p.floor === floor);
    return removeParts(on, on.length + ' parts from floor ' + floor);
  }

  /** What undoSell() would cost and whether it can run right now. */
  function undoInfo() {
    const u = g.undo;
    if (!u) return null;
    return {
      n: u.parts.length, refund: u.refund, label: u.label,
      afford: g.state.coins >= u.refund,
    };
  }

  /**
   * Put the last removal back, at the price it paid out.
   *
   * ⚠️ Charging the refund back is not politeness — parts refund less than
   * they cost, so a free undo makes sell → undo → sell a coin pump, and
   * sell → spend → undo hands out parts for nothing. The blocked case is
   * reported rather than silently ignored, or the button looks broken.
   */
  function undoSell() {
    const u = g.undo;
    if (!u) return { ok: false, err: 'Nothing to put back' };
    if (g.state.coins < u.refund) {
      return { ok: false, err: 'That refund is already spent — you need ' + U.fmt(u.refund) + ' coins back' };
    }
    // The space may have been built over in the meantime; restoring on top
    // of another part would put two colliders in the same place.
    for (const p of u.parts) {
      const def = D.PART_BY_ID[p.id];
      if (!def) continue;
      const err = IP.table.placeError(g.state, def, p.x, p.y, p.floor, p.uid);
      if (err) return { ok: false, err: 'Cannot put it back: ' + err.toLowerCase() };
    }
    pay(u.refund);
    for (const p of u.parts) g.state.parts.push(Object.assign({}, p));
    const n = u.parts.length;
    g.undo = null;
    rebuild(); save();
    sfx('place');
    return { ok: true, n };
  }

  function levelPart(uid) {
    const inst = g.state.parts.find((p) => p.uid === uid);
    if (!inst) return false;
    const def = D.PART_BY_ID[inst.id];
    if (inst.lvl >= def.maxLevel) return false;
    const cost = IP.table.upgradeCost(g.state, inst);
    if (!pay(cost)) return false;
    inst.lvl++;
    rebuild(); save();
    sfx('levelup');
    return true;
  }

  function movePart(uid, x, y, floor) {
    const inst = g.state.parts.find((p) => p.uid === uid);
    if (!inst) return 'Missing part';
    const def = D.PART_BY_ID[inst.id];
    const err = IP.table.placeError(g.state, def, x, y, floor, uid);
    if (err) return err;
    inst.x = x; inst.y = y; inst.floor = floor;
    rebuild(); save();
    return null;
  }

  function rotatePart(uid, delta) {
    const inst = g.state.parts.find((p) => p.uid === uid);
    if (!inst) return;
    inst.a = U.norm((inst.a || 0) + delta);
    rebuild(); save();
  }

  function buyUpgrade(id) {
    const u = D.UP_BY_ID[id];
    if (!u) return false;
    const lvl = up(id);
    if (lvl >= u.max) return false;
    const cost = D.upgradeCost(u, lvl);
    if (!pay(cost)) return false;
    g.state.upgrades[id] = lvl + 1;
    rebuild(); save();
    sfx('buy');
    return true;
  }

  function buyBall(id) {
    const b = D.BALL_BY_ID[id];
    if (!b || g.state.balls[id]) return false;
    if (!pay(b.cost)) return false;
    g.state.balls[id] = 1;
    save(); sfx('buy');
    return true;
  }

  function selectBall(id) {
    if (!g.state.balls[id]) return false;
    g.state.loadout = id;
    save();
    return true;
  }

  function trinketSlots() { return 2 + up('trinkets'); }

  function buyTrinket(id) {
    const t = D.TRINKET_BY_ID[id];
    if (!t || g.state.trinkets.includes(id)) return false;
    if (g.state.trinkets.length >= trinketSlots()) return false;
    if (!pay(t.cost)) return false;
    g.state.trinkets.push(id);
    recomputeTrinkets(); rebuild(); save();
    sfx('levelup');
    return true;
  }

  function sellTrinket(id) {
    const i = g.state.trinkets.indexOf(id);
    if (i < 0) return false;
    const t = D.TRINKET_BY_ID[id];
    g.state.trinkets.splice(i, 1);
    coins(Math.round(t.cost * 0.5));
    recomputeTrinkets(); rebuild(); save();
    return true;
  }

  function buyFloor() {
    const k = g.state.floors;
    if (k >= W.MAX_FLOORS) return false;
    const cost = D.floorCost(k);
    if (!pay(cost)) return false;
    g.state.floors++;
    rebuild(); save();
    sfx('win');
    popupScreen('FLOOR ' + k + ' OPEN', D.C.gold);
    return true;
  }

  function buyPerk(id) {
    const p = D.PERK_BY_ID[id];
    if (!p) return false;
    const lvl = perk(id);
    if (lvl >= p.max) return false;
    const cost = D.perkCost(p, lvl);
    if (g.state.gems < cost) return false;
    g.state.gems -= cost;
    g.state.perks[id] = lvl + 1;
    rebuild(); save();
    sfx('levelup');
    return true;
  }

  function polishBall(id) {
    id = id || g.state.loadout;
    const b = D.BALL_BY_ID[id];
    if (!b || !g.state.balls[id]) return false;
    const lvl = ballLevel(id);
    if (lvl >= D.BALL_MAX_LEVEL) return false;
    const cost = D.ballPolishCost(b, lvl);
    if (!pay(cost)) return false;
    g.state.ballLevels[id] = lvl + 1;
    save(); sfx('levelup');
    return true;
  }

  function prestige() {
    const earn = D.prestigeGems(g.state.stats.totalChips);
    if (earn <= 0) return false;
    const keep = {
      gems: g.state.gems + earn,
      medals: g.state.medals,
      settings: g.state.settings,
      panels: g.state.panels,
      perks: g.state.perks,
      counters: g.state.counters,
      stats: Object.assign({}, g.state.stats, { prestiges: g.state.stats.prestiges + 1, totalChips: 0 }),
    };
    // Perks decide what survives the melt-down.
    if (perk('keepBalls')) { keep.balls = g.state.balls; keep.ballLevels = g.state.ballLevels; }
    if (perk('keepTrinkets')) keep.trinkets = g.state.trinkets;
    const s = freshState();
    Object.assign(s, keep);
    s.floors = Math.min(W.MAX_FLOORS, 3 + perk('floors'));
    s.coins = 500 + earn * 250 + (perk('seed') ? 1000 * Math.pow(3, perk('seed')) : 0);
    g.state = s;
    g.undo = null;
    recomputeTrinkets(); rebuild(); save();
    startRun();
    sfx('win');
    emit('prestige', earn);
    return earn;
  }

  /* ===================================================================
   * MISSIONS
   * ================================================================ */
  function count(key, n) {
    g.state.counters[key] = (g.state.counters[key] || 0) + (n == null ? 1 : n);
  }

  /** Current value of whatever a mission is watching. */
  function missionValue(key) {
    const s = g.state;
    switch (key) {
      case 'runChips': return s.stats.bestRun;
      case 'floor': return s.stats.bestFloor;
      case 'mult': return s.stats.bestMult;
      case 'parts': return s.parts.length;
      case 'combo': return s.stats.bestCombo;
      default: return s.counters[key] || 0;
    }
  }

  function missionProgress(m) {
    const def = D.MISSION_BY_KEY[m.key];
    if (!def) return { have: 0, need: 1, done: false };
    const need = D.missionNeed(def, m.tier);
    const have = def.kind === 'max' ? missionValue(m.key) : missionValue(m.key) - (m.from || 0);
    return { have: Math.max(0, have), need, done: have >= need, def, pay: D.missionPay(def, m.tier) };
  }

  /** Roll a fresh mission, avoiding whatever is already on the board. */
  function rollMission(slot) {
    const taken = new Set(g.state.missions.filter((_, i) => i !== slot).map((m) => m && m.key));
    const pool = D.MISSION_POOL.filter((d) => !taken.has(d.key));
    const def = R().ui.pick(pool.length ? pool : D.MISSION_POOL);
    const seen = (g.state.counters['_tier_' + def.key] || 0);
    // Start the tier near where the player already is so it is neither
    // instantly complete nor hopeless.
    let tier = seen;
    for (let i = 0; i < 30; i++) {
      const need = D.missionNeed(def, tier);
      const have = def.kind === 'max' ? missionValue(def.key) : 0;
      if (have < need) break;
      tier++;
    }
    return { key: def.key, tier, from: def.kind === 'max' ? 0 : missionValue(def.key) };
  }

  function ensureMissions() {
    if (!Array.isArray(g.state.missions)) g.state.missions = [];
    while (g.state.missions.length < 3) g.state.missions.push(rollMission(g.state.missions.length));
    g.state.missions = g.state.missions.slice(0, 3);
  }

  function claimMission(i) {
    ensureMissions();
    const m = g.state.missions[i];
    if (!m) return false;
    const pr = missionProgress(m);
    if (!pr.done) return false;
    coins(pr.pay);
    g.state.counters['_tier_' + m.key] = m.tier + 1;
    g.state.stats.missionsDone++;
    g.state.missions[i] = rollMission(i);
    popupScreen('TASK DONE  +' + U.fmt(pr.pay), D.C.green);
    sfx('win');
    save();
    return pr.pay;
  }

  function rerollMission(i) {
    ensureMissions();
    const cost = 150 + 60 * (g.state.stats.missionsDone || 0);
    if (!pay(cost)) return false;
    g.state.missions[i] = rollMission(i);
    save();
    sfx('buy');
    return true;
  }

  /* ===================================================================
   * UNLOCK ANNOUNCEMENTS
   * Content reveals itself as lifetime chips grow; this notices the moment
   * something crosses the line and says so, one item at a time so a burst
   * of unlocks does not turn into a wall of toast.
   * ================================================================ */
  let unlockT = 0;
  const unlockQueue = [];

  function checkUnlocks(dt) {
    unlockT -= dt;
    if (unlockT > 0) return;
    unlockT = 0.75;

    const now = D.unlockedSet(g.state);
    // First load of an existing save: adopt the current state silently.
    if (!Array.isArray(g.state.known)) {
      g.state.known = now;
      for (const k of now) g.state.seen[k] = 1;
      return;
    }
    const known = new Set(g.state.known);
    for (const k of now) {
      if (known.has(k)) continue;
      g.state.known.push(k);
      unlockQueue.push(k);
    }
    if (!unlockQueue.length) return;
    const key = unlockQueue.shift();
    const info = D.unlockLabel(key);
    popupScreen(info.emoji + '  ' + info.what + ' UNLOCKED', D.C.gold);
    sfx('levelup');
    emit('unlock', { key, info });
  }

  const isSeen = (key) => !!(g.state.seen && g.state.seen[key]);
  function markSeen(keys) {
    let changed = false;
    for (const k of keys) if (!g.state.seen[k]) { g.state.seen[k] = 1; changed = true; }
    return changed;
  }

  /* ===================================================================
   * MEDALS
   * ================================================================ */
  function checkMedals() {
    for (const m of D.MEDALS) {
      if (g.state.medals[m.id]) continue;
      let ok = false;
      try { ok = m.test(g.state); } catch (e) { ok = false; }
      if (ok) {
        g.state.medals[m.id] = Date.now();
        popupScreen(m.emoji + ' ' + m.name, D.C.gold);
        sfx('win');
        emit('medal', m);
      }
    }
  }

  /* ===================================================================
   * SAVE / LOAD
   * ================================================================ */
  /**
   * ⚠️ A plain, self-contained snapshot. Parts carry underscore-prefixed
   * runtime fields — notably `_cols`, the live collider objects, which point
   * back at the part and make the state a CYCLE. `JSON.stringify` throws on
   * that, `saveJSON` swallows the throw and returns false, and the game
   * stops saving the moment a single part is placed. Everything that
   * serialises state must go through here.
   */
  function cleanState() {
    const src = g.state;
    const out = {};
    for (const k in src) {
      if (k === 'trinketFx' || k === 'gapCache') continue;   // derived, and holds functions
      out[k] = src[k];
    }
    out.parts = (src.parts || []).map(cleanPart);
    return out;
  }

  function save() {
    g.state.lastSeen = Date.now();
    return U.saveJSON(SAVE_KEY, cleanState());
  }

  function load() {
    const s = U.loadJSON(SAVE_KEY, null);
    if (!s || !s.v) return false;
    const base = freshState();
    g.state = Object.assign(base, s);
    g.undo = null;
    g.state.settings = Object.assign(base.settings, s.settings || {});
    g.state.stats = Object.assign(base.stats, s.stats || {});
    g.state.upgrades = s.upgrades || {};
    g.state.balls = s.balls || { steel: 1 };
    g.state.parts = (s.parts || []).filter((p) => D.PART_BY_ID[p.id]);
    g.state.trinkets = (s.trinkets || []).filter((t) => D.TRINKET_BY_ID[t]);
    g.state.panels = (s.panels && s.panels.length === 6) ? s.panels : base.panels;
    g.state.seed = (s.seed >>> 0) || ((Date.now() ^ 0x9e3779b9) >>> 0);
    g.state.perks = s.perks || {};
    g.state.known = Array.isArray(s.known) ? s.known : null;
    g.state.seen = s.seen || {};
    g.state.ballLevels = Object.assign({ steel: 1 }, s.ballLevels || {});
    g.state.counters = s.counters || {};
    return true;
  }

  function wipe() {
    U.dropKey(SAVE_KEY);
    g.state = freshState();
    g.undo = null;
    recomputeTrinkets(); rebuild();
    startRun();
  }

  /** Coins the tower minted while the tab was closed. */
  function collectOffline() {
    const cap = (2 + 2 * up('offline')) * 3600;
    const dt = U.clamp((Date.now() - (g.state.lastSeen || Date.now())) / 1000, 0, cap);
    if (dt < 60) return 0;
    const earned = idlePerSec() * dt * 0.55;      // offline runs at 55% rate
    if (earned < 1) return 0;
    g.state.coins += earned;
    return { earned, seconds: dt };
  }

  /* ===================================================================
   * MAIN LOOP
   * ================================================================ */
  /**
   * ⚠️ Fixed timestep. Everything that advances over time runs here at a
   * constant rate and the renderer interpolates between the last two states
   * with `g.alpha`. A variable dt (or worse, a per-draw decay) runs 2.4×
   * fast on a 144Hz display and crawls on a throttled tab.
   */
  const STEP = 1 / 120;
  const MAX_CATCHUP = 6;      // after a stall, drop time rather than spiral
  let lastT = 0;
  let acc = 0;

  function frame(t) {
    if (!g.running) return;
    requestAnimationFrame(frame);
    const raw = U.clamp((t - lastT) / 1000 || 0, 0, 0.25);
    lastT = t;

    if (!g.paused) {
      acc += raw;
      let n = 0;
      while (acc >= STEP && n < MAX_CATCHUP) { update(STEP); acc -= STEP; n++; }
      if (n === MAX_CATCHUP) acc = 0;
      g.alpha = acc / STEP;
    }
    if (g.renderer) g.renderer.draw(g);
  }

  function update(dt) {
    if (g.paused || g.locked) return;
    // Snapshot for render interpolation, before anything moves.
    g.prevCamY = g.camY;
    for (const b of g.balls) {
      if (!b.pp) b.pp = { x: b.p.x, y: b.p.y };
      else { b.pp.x = b.p.x; b.pp.y = b.p.y; }
    }
    if (g.world) for (const f of g.world.flippers) f.prevAng = f.ang;
    g.time += dt;
    g.state.stats.playTime += dt;

    // Idle coins tick even while you are in the menus.
    g.idleRate = idlePerSec();
    if (g.idleRate > g.state.stats.bestIdle) g.state.stats.bestIdle = g.idleRate;
    g.state.coins += g.idleRate * dt;

    if (g.demo) demoTick(dt);

    /* --- plunger --- */
    if (g.awaitLaunch) {
      if (g.plunger.holding) g.plunger.pull = U.clamp(g.plunger.pull + dt * 1.15, 0, 1);
      const b = g.balls.find((x) => x.alive);
      if (b && !g.plunger.holding && b.p.y > 40) g.awaitLaunch = false;
    }
    if (g.ballSaveT > 0) g.ballSaveT -= dt;
    if (g.tilt > 0) g.tilt = Math.max(0, g.tilt - dt * 0.12);

    /* --- part timers --- */
    for (const p of g.state.parts) {
      const def = D.PART_BY_ID[p.id];
      if (def && def.tick) def.tick(A, p, dt);
    }

    /* --- auto flippers + assist --- */
    autoFlippers(dt);

    /* --- physics --- */
    if (g.world && !g.build.on) {
      IP.physics.step(g.world, g.balls, dt, {
        onHit: partHit,
        onSensor: sensorHit,
        onFlipper: flipperHit,
        onShell: shellHit,
        onDrain: drain,
      });
    } else if (g.world) {
      // Build mode: keep flipper animation alive so it still looks live.
      for (const f of g.world.flippers) IP.physics.stepFlipper(f, dt);
    }

    /* --- held balls --- */
    for (const b of g.balls) {
      if (!b.held) continue;
      b.holdT -= dt;
      if (b.lift) {
        b.lift.t = Math.min(b.lift.T, b.lift.t + dt);
        b.holdTo.y = U.lerp(b.lift.y0, b.lift.y1, U.easeInOut(b.lift.t / b.lift.T));
        if (g.state.settings.particles && R().fx.chance(0.4)) burst(b.p.x, b.p.y - 4, D.C.teal, 1);
      }
      if (b.holdT <= 0) {
        const cb = b.holdCb;
        b.holdCb = null; b.held = false; b.holdTo = null; b.lift = null; b.holdCd = 0.5;
        if (cb) cb();
      }
    }

    /* --- floor crossings pay on their own --- */
    for (const b of g.balls) if (b.alive && !b.held) checkFloorProgress(b);

    /* --- ball search: nothing may ever get stuck forever --- */
    ballSearch(dt);

    /* --- trails --- */
    for (const b of g.balls) {
      if (!b.def.trail) continue;
      b.trail.push({ x: b.p.x, y: b.p.y });
      if (b.trail.length > 14) b.trail.shift();
    }

    decayMult(dt);

    /* --- effects --- */
    for (let i = g.particles.length - 1; i >= 0; i--) {
      const p = g.particles[i];
      p.life -= dt;
      if (p.life <= 0) { g.particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy -= 90 * dt; p.vx *= 0.98; p.rot += p.vr * dt;
    }
    for (let i = g.popups.length - 1; i >= 0; i--) {
      g.popups[i].life -= dt;
      if (g.popups[i].life <= 0) g.popups.splice(i, 1);
    }
    g.shake = Math.max(0, g.shake - dt * 34);
    // ⚠️ These used to decay once per DRAW. Part glow and field heat are
    // simulation state, so they tick here at a fixed rate; the shake offset
    // is chosen here too so two draws of one frame are identical.
    g.shakeX = g.shake ? R().fx.rand(-g.shake, g.shake) : 0;
    g.shakeY = g.shake ? R().fx.rand(-g.shake, g.shake) : 0;
    for (const p of g.state.parts) if (p._glow > 0) p._glow = Math.max(0, p._glow - dt * 3.3);
    if (g.world) for (const f of g.world.fields) if (f.hot > 0) f.hot = Math.max(0, f.hot - dt * 3.6);

    /* --- camera --- */
    updateCamera(dt);

    checkUnlocks(dt);

    /* --- housekeeping --- */
    if (g.time - g.lastSave > SAVE_EVERY) { g.lastSave = g.time; checkMedals(); save(); }
    emit('tick', dt);
  }

  /**
   * Real tables have a ball-search relay for exactly this reason: geometry
   * plus a part somebody dropped in an awkward spot can always cradle a ball.
   * Three escalating shoves, then we give the ball back to the drain.
   */
  const DRY_KICK = 12;      // seconds without scoring before we shove the ball
  const DRY_DRAIN = 26;     // …and before we give up on it

  function ballSearch(dt) {
    if (g.awaitLaunch) return;
    for (const b of g.balls) {
      if (!b.alive || b.held) continue;

      /* A ball can find a quiet orbit between two decks and circle there
       * forever, scoring nothing. It is still moving, so the slow-ball check
       * below never fires — this is the separate "it is alive but the run has
       * stopped happening" case. Shove it, then drain it. */
      const dry = g.time - (b.lastHit || 0);
      if (dry > DRY_DRAIN) {
        popupScreen('BALL LOST', D.C.red);
        drain(b);
        continue;
      }
      if (dry > DRY_KICK && !b.dryKicked) {
        b.dryKicked = true;
        b.v.x = R().sim.rand(-90, 90);
        b.v.y = 150;
        shake(5);
        popup(b.p.x, b.p.y + 6, 'SHAKE', D.C.cream, 11);
        sfx('flip');
      }
      // A ball that found its way back into the shooter lane gets re-fired.
      if (b.p.x > IP.table.LANE_X && b.p.y < IP.table.LANE_TOP && Math.abs(b.v.y) < 40) {
        b.v.y = 210 * (1 + 0.06 * up('plunger'));
        b.v.x = R().sim.rand(-3, 3);
        sfx('launch');
        continue;
      }
      const slow = Math.hypot(b.v.x, b.v.y) < 14;
      b.slowT = slow ? (b.slowT || 0) + dt : 0;
      if (b.slowT < 2.4) continue;
      b.slowT = 0;
      b.searches = (b.searches || 0) + 1;
      if (b.searches > 3) { drain(b); continue; }
      b.v.x += R().sim.rand(-70, 70);
      b.v.y += R().sim.rand(60, 130);
      shake(5);
      popup(b.p.x, b.p.y + 6, 'BALL SEARCH', D.C.cream, 11);
      sfx('flip');
    }
  }

  function updateCamera(dt) {
    const r = g.renderer;
    if (!r) return;
    const viewH = r.view.viewH || 200;
    let target;
    if (g.build.on) {
      target = g.build.floor * W.FLOOR_H + W.FLOOR_H / 2 - viewH / 2;
    } else {
      let hi = null;
      for (const b of g.balls) if (b.alive && (!hi || b.p.y > hi.p.y)) hi = b;
      target = hi ? hi.p.y - viewH * 0.42 : 0;
    }
    const maxY = Math.max(0, (g.world ? g.world.totalH : W.FLOOR_H * 3) - viewH);
    g.camTarget = U.clamp(target, -4, maxY);
    g.camY = U.approach(g.camY, g.camTarget, g.build.on ? 9 : 6.5, dt);
    r.view.camY = g.camY;
    r.view.shake = g.shake;
  }

  /* --- auto flippers + optional AI assist ------------------------- */
  function autoFlippers(dt) {
    const assistLvl = up('autoPlay');
    for (const f of g.world.flippers) {
      if (f.wheel) continue;
      const isAuto = f.auto;
      const assisted = !isAuto && (g.demo || (g.state.settings.assist && assistLvl > 0));
      if (!isAuto && !assisted) continue;
      let want = false;
      for (const b of g.balls) {
        if (!b.alive || b.held) continue;
        // Look a couple of frames ahead so the swing meets the ball, not trails it.
        const px = b.p.x + b.v.x * 0.055, py = b.p.y + b.v.y * 0.055;
        const dx = px - f.pivot.x, dy = py - f.pivot.y;
        const dist = Math.hypot(dx, dy);
        const inX = f.side === 'L' ? dx > -5 : dx < 5;
        if (!inX || b.v.y > 25) continue;
        // Fire when the ball is out near the tip: that is where the power is.
        if (dist < f.len + b.r + 3 && dist > f.len * 0.42 && dy > -7 && dy < 12) { want = true; break; }
      }
      f.autoPress = want;
      if (isAuto || assisted) f.pressed = want || f.humanPress || false;
    }
  }

  /* ===================================================================
   * DEMO AI — also what tests/ai-tester.mjs drives.
   * ================================================================ */
  let demoT = 0;
  function demoTick(dt) {
    demoT += dt;
    if (!g.run.active) { startRun(); return; }
    if (g.awaitLaunch) {
      if (!g.plunger.holding && g.plunger.pull === 0) plungerDown();
      if (g.plunger.pull > 0.85) plungerRelease();
      return;
    }
    if (g.cannon) {
      g.cannon.ang = Math.PI / 2 + Math.sin(demoT * 2) * 0.4;
      if (demoT % 1 < dt * 2) fireCannon();
    }
    if (g.balls.length === 0 && !g.run.active) startRun();
  }

  /* ===================================================================
   * SAVE FILES
   * ---------------------------------------------------------------------
   * ⚠️ `.json`, not an invented extension: an invented one buys a file
   * picker filter and costs every editor, viewer and diff tool. The price
   * is that the picker will hand us ANY json, so the magic field below is
   * checked before anything is indexed into. The content type is in the
   * filename too, since that is all that distinguishes it in a downloads
   * folder.
   * ================================================================ */
  const FILE_MAGIC = 'tower-of-chips-save';
  const FILE_V = 1;

  function exportSave() {
    save();
    return {
      format: FILE_MAGIC,
      v: FILE_V,
      app: IP.VERSION,
      exported: new Date().toISOString(),
      state: cleanState(),
    };
  }

  function suggestedFileName() {
    const d = new Date().toISOString().slice(0, 10);
    return `${FILE_MAGIC}-f${g.state.floors}-${d}.json`;
  }

  const isNum = (v) => typeof v === 'number' && isFinite(v);
  const asInt = (v, lo, hi, dflt) => (isNum(v) ? U.clamp(Math.round(v), lo, hi) : dflt);

  /**
   * Validate then apply. Throws with a message a human can act on.
   * ⚠️ Parts are rebuilt through `newInstance` — the same constructor the
   * game uses — rather than trusting the literal in the file. Two
   * implementations of a part would drift the moment one gained a field.
   */
  function importSave(obj) {
    if (!obj || typeof obj !== 'object') throw new Error('That file is not readable.');
    if (obj.format !== FILE_MAGIC) {
      throw new Error('That is a .json file, but not a Tower of Chips save.');
    }
    if (!isNum(obj.v)) throw new Error('That save has no version and cannot be trusted.');
    if (obj.v > FILE_V) {
      throw new Error(`That save was written by a newer version of the game (format v${obj.v}, this build reads v${FILE_V}). Update the game first.`);
    }
    const src = obj.state;
    if (!src || typeof src !== 'object') throw new Error('That save has no game state in it.');

    const base = freshState();
    const out = Object.assign(base, src);
    out.settings = Object.assign(freshState().settings, src.settings || {});
    out.stats = Object.assign(freshState().stats, src.stats || {});
    out.floors = asInt(src.floors, 1, W.MAX_FLOORS, 3);
    out.coins = isNum(src.coins) ? Math.max(0, src.coins) : 0;
    out.gems = asInt(src.gems, 0, 1e9, 0);
    out.upgrades = (src.upgrades && typeof src.upgrades === 'object') ? src.upgrades : {};
    out.perks = (src.perks && typeof src.perks === 'object') ? src.perks : {};
    out.balls = (src.balls && typeof src.balls === 'object') ? src.balls : { steel: 1 };
    out.ballLevels = Object.assign({ steel: 1 }, src.ballLevels || {});
    out.trinkets = Array.isArray(src.trinkets) ? src.trinkets.filter((t) => D.TRINKET_BY_ID[t]) : [];
    out.panels = (Array.isArray(src.panels) && src.panels.length === 6) ? src.panels : base.panels;
    out.seen = (src.seen && typeof src.seen === 'object') ? src.seen : {};
    out.known = Array.isArray(src.known) ? src.known : null;
    out.medals = (src.medals && typeof src.medals === 'object') ? src.medals : {};
    out.counters = (src.counters && typeof src.counters === 'object') ? src.counters : {};
    out.missions = Array.isArray(src.missions) ? src.missions.filter((m) => m && D.MISSION_BY_KEY[m.key]) : [];

    // ⚠️ Validate the shape of every row before indexing into it. A short or
    // malformed row fails later as a blank screen, which reads as a
    // rendering bug rather than a file error.
    out.parts = [];
    if (Array.isArray(src.parts)) {
      for (const raw of src.parts) {
        if (!raw || typeof raw !== 'object') continue;
        const def = D.PART_BY_ID[raw.id];
        if (!def) continue;
        if (!isNum(raw.x) || !isNum(raw.y)) continue;
        const floor = asInt(raw.floor, 0, W.MAX_FLOORS - 1, 0);
        const inst = IP.table.newInstance(raw.id, raw.x, raw.y, floor, isNum(raw.a) ? raw.a : 0);
        inst.lvl = asInt(raw.lvl, 1, def.maxLevel || 1, 1);
        inst.side = raw.side === 'R' ? 'R' : 'L';
        inst.panel = asInt(raw.panel, 0, 5, 0);
        inst.armed = raw.armed !== false;
        inst.earned = isNum(raw.earned) ? raw.earned : 0;
        out.parts.push(inst);
      }
    }

    g.state = out;
    g.undo = null;
    ensureMissions();
    recomputeTrinkets();
    rebuild();
    save();
    startRun();
    return { parts: out.parts.length, floors: out.floors };
  }

  /* ===================================================================
   * DETERMINISM SUPPORT
   * The sim must replay identically from a seed on the same engine. These
   * two functions are what the determinism test drives; they are also handy
   * for reproducing a bug report.
   * ================================================================ */

  /** Run `n` fixed steps with no rendering and no rAF. */
  function stepFor(n, opts) {
    const quiet = !opts || opts.save !== true;
    const wasSave = g.lastSave;
    for (let i = 0; i < n; i++) {
      update(STEP);
      // Saving stamps Date.now(), which is not sim state; keep it out.
      if (quiet) g.lastSave = g.time;
    }
    if (quiet) g.lastSave = wasSave;
  }

  /** FNV-1a over everything that must replay identically. */
  function hashState() {
    const q = (v) => Math.round(v * 4096) / 4096;      // tame float noise
    const parts = [
      'T', q(g.time), 'S', Math.round(g.run.score), 'M', q(g.mult),
      'C', g.combo | 0, 'B', g.run.ballsLeft | 0, 'K', Math.round(g.state.coins),
      'X', Math.round(g.state.stats.totalChips), 'D', g.state.stats.drains | 0,
    ];
    for (const b of g.balls) {
      parts.push('b', q(b.p.x), q(b.p.y), q(b.v.x), q(b.v.y), b.alive ? 1 : 0, b.held ? 1 : 0);
    }
    for (const p of g.state.parts) {
      parts.push('p', p.id, p.used | 0, q(p.charge || 0), q(p.t_down || 0), p.lit ? 1 : 0, p.hits | 0);
    }
    for (const f of g.world.flippers) parts.push('f', q(f.ang));
    const str = parts.join('|');
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0');
  }

  /* ===================================================================
   * PUBLIC API handed to parts & trinkets
   * ================================================================ */
  const A = {
    score, addMult, freezeMult, burst, shake, sfx, coins, count,
    up,
    holdBall, liftBall, grantBallSave, splitBall, otherPortal, loadCannon, fireCannon,
    now: () => g.time,
    checkTargetBank, checkLaneSet,
    flag: (k, v) => (v === undefined ? g.flags[k] : (g.flags[k] = v)),
    highestActiveFloor: () => {
      let m = 0;
      for (const b of g.balls) if (b.alive) m = Math.max(m, floorOf(b.p.y));
      return m;
    },
    ballAge: () => (g.balls[0] ? g.balls[0].age : 0),
    bestFloor: () => g.state.stats.bestFloor,
    partCount: () => g.state.parts.length,
    trinketCount: () => g.state.trinkets.length,
    popup, popupScreen,
  };

  /* ===================================================================
   * BOOTSTRAP
   * ================================================================ */
  function init(canvas) {
    load();
    ensureMissions();
    recomputeTrinkets();
    rebuild();
    g.renderer = IP.render.makeRenderer(canvas);
    Sfx.enabled = !!g.state.settings.sound;
    g.running = true;
    lastT = U.now();
    requestAnimationFrame(frame);
    return g;
  }

  IP.game = {
    g, A, Sfx, SAVE_KEY,
    init, save, load, wipe, rebuild, recomputeTrinkets, collectOffline,
    startRun, startBall, endRun, spawnBall, makeBall,
    plungerDown, plungerRelease, nudge, fireCannon,
    buyPart, sellPart, sellFloor, removeParts, undoSell, undoInfo, levelPart, movePart, rotatePart,
    noteVersionSeen, updateDeadline, enforceUpdate, GRACE_DAYS,
    buyUpgrade, buyBall, selectBall, buyTrinket, sellTrinket, buyFloor, prestige,
    buyPerk, polishBall, perk, ballLevel, ballScoreMul, ballCoinMul,
    canAfford, pay, coins, up, idlePerSec, coinRate, baseMult, ballsPerRun,
    trinketSlots, slotsUsed, floorOf, checkMedals, typeCount,
    stepFor, hashState, STEP, cleanState,
    exportSave, importSave, suggestedFileName, FILE_MAGIC, FILE_V,
    isSeen, markSeen,
    count, missionProgress, ensureMissions, claimMission, rerollMission, comboWindow,
    on, emit, freshState,
    setDemo: (v) => { g.demo = !!v; if (v && !g.run.active) startRun(); },
  };
})(window);
