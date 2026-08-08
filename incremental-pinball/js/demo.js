/* =========================================================================
 * TOWER OF CHIPS — demo / self-test hook
 * Exposes the standard `window.__incpinball` interface used by
 * tests/ai-tester.mjs, plus an auto-builder so the demo actually shows the
 * incremental loop (earn → buy → place → score more).
 * ====================================================================== */
(function (global) {
  'use strict';

  const IP = global.IP;
  const U = IP.util;
  const D = IP.data;
  const G = IP.game;
  const g = G.g;

  let buildTimer = 0;

  /** The demo spends its coins so the tester sees the tower actually grow. */
  function autoBuild(dt) {
    buildTimer -= dt;
    if (buildTimer > 0) return;
    buildTimer = 1.6;

    // Prefer opening a new floor when it is comfortably affordable.
    const nextFloorCost = D.floorCost(g.state.floors);
    if (g.state.floors < D.W.MAX_FLOORS && g.state.coins > nextFloorCost * 2.2) { G.buyFloor(); return; }

    // Build like a player would: climbing gear first, then scorers, then
    // income — and always the priciest affordable option in that class.
    const WANT = ['jet', 'paddle', 'saucer', 'tramp', 'kicker', 'bumper', 'target', 'sling', 'jackpot', 'mint', 'spinner'];
    const candidates = D.PARTS
      .filter((p) => p.floor < g.state.floors)
      .map((p) => ({ p, c: IP.table.partCost(g.state, p), rank: WANT.indexOf(p.id) }))
      .filter((x) => x.rank >= 0 && g.state.coins > x.c * 2)
      .sort((a, b) => (b.c - a.c));
    if (!candidates.length) return;

    const cycle = WANT[(g.state.parts.length) % WANT.length];
    const preferred = candidates.find((x) => x.p.id === cycle) || candidates[0];
    const def = preferred.p;
    for (let attempt = 0; attempt < 16; attempt++) {
      const floor = U.randInt(Math.max(def.floor, 0), g.state.floors - 1);
      if (IP.table.partsOnFloor(g.state, floor).length >= IP.table.slotLimit(g.state)) continue;
      const base = floor * D.W.FLOOR_H;
      // Bias toward the column under the next floor's opening — that is where
      // a real player would stack their climbing gear.
      const gx = IP.table.gapX(floor + 1);
      const x = IP.table.snap(U.clamp(gx + U.rand(-26, 26), 8, 92));
      const y = IP.table.snap(base + U.rand(floor === 0 ? 52 : 14, D.W.FLOOR_H - 22));
      const a = def.id === 'jet' ? 0 : U.rand(-1, 1);
      const res = G.buyPart(def.id, x, y, floor, a);
      if (res.ok) return;
    }
  }

  G.on('tick', (dt) => { if (g.demo) autoBuild(dt); });

  const api = {
    /** Turn the built-in AI player on/off. */
    setDemo(v) {
      G.setDemo(v);
      if (v) {
        IP.ui.closeModal();
        IP.ui.setMenu(false);
        if (g.build.on) IP.ui.exitBuild();
        if (!g.run.active) G.startRun();
      }
      return true;
    },
    startDemo() { return api.setDemo(true); },
    stopDemo() { return api.setDemo(false); },

    /** Snapshot used by tests/ai-tester.mjs. `score` is monotonic on purpose. */
    state() {
      return {
        score: Math.floor(g.state.stats.totalChips),
        runScore: Math.floor(g.run.score),
        mode: 'floor-' + (g.balls.length ? G.floorOf(g.balls[0].p.y) : 0),
        coins: Math.floor(g.state.coins),
        floors: g.state.floors,
        parts: g.state.parts.length,
        balls: g.balls.length,
        ballsLeft: g.run.ballsLeft,
        mult: +g.mult.toFixed(2),
        bestFloor: g.state.stats.bestFloor,
        demo: g.demo,
      };
    },

    /* Handy console helpers while developing. */
    game: G,
    give(n) { g.state.coins += n || 1e6; },
    wipe() { G.wipe(); },
  };

  global.__incpinball = api;
})(window);
