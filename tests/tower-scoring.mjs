#!/usr/bin/env node
/*
 * The Tony Hawk rule, the one-flipper-per-floor rule, and the high-water mark.
 *
 * ⚠️ The decay assertions compare payouts from the SAME part rather than
 * checking a factor function in isolation — the factor was already right
 * while nothing called it would have passed a unit test of repeatFactor().
 */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';

const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
const p = await (await b.newContext({ viewport: { width: 420, height: 900 } })).newPage();
const errs = []; p.on('pageerror', (e) => errs.push('ERR ' + e.message));
await p.goto(pathToFileURL('/home/user/AmmarRica.github.io').href + '/incremental-pinball/index.html');
await p.waitForTimeout(800);
const ok = (l, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + l + (x ? '  ' + x : '')); if (!c) process.exitCode = 1; };

const setup = () => p.evaluate(() => {
  const G = window.IP.game, g = G.g;
  g.running = false; g.demo = false;
  G.wipe(); g.running = false;
  g.state.coins = 1e7;
  g.mult = 1; g.multBase = 1;
});

/* ---- repeats pay less, measured through real scoring ------------------ */
await setup();
const decay = await p.evaluate(() => {
  const G = window.IP.game, g = G.g;
  G.buyPart('bumper', 30, 60, 0, 0);
  const inst = g.state.parts[0];
  const pays = [];
  for (let i = 0; i < 12; i++) {
    const before = g.run.score;
    g.mult = 1;                            // hold everything else still
    G.A.score(1000, inst, { silent: true });
    pays.push(g.run.score - before);
  }
  return { pays, hits: inst._runHits };
});
ok('a part is counted as it scores', decay.hits === 12, 'hits=' + decay.hits);
ok('the first hit pays full', decay.pays[0] === 1000, String(decay.pays[0]));
ok('each repeat pays less than the last',
  decay.pays.every((v, i) => i === 0 || v < decay.pays[i - 1]), decay.pays.join(','));
ok('the tenth hit is worth well under half the first',
  decay.pays[9] < decay.pays[0] * 0.5, decay.pays[9] + ' vs ' + decay.pays[0]);
ok('a worn part still pays something', decay.pays[11] > 0, String(decay.pays[11]));

/* ---- and it is per part, not global ----------------------------------- */
const perPart = await p.evaluate(() => {
  const G = window.IP.game, g = G.g;
  G.buyPart('bumper', 60, 75, 0, 0);
  const fresh = g.state.parts[1];
  const before = g.run.score;
  g.mult = 1;
  G.A.score(1000, fresh, { silent: true });
  return g.run.score - before;
});
ok('a different part starts fresh', perPart === 1000, String(perPart));

/* ---- and it resets per run -------------------------------------------- */
const perRun = await p.evaluate(() => {
  const G = window.IP.game, g = G.g;
  G.startRun(); g.running = false;
  const inst = g.state.parts[0];
  const before = g.run.score;
  g.mult = 1;
  G.A.score(1000, inst, { silent: true });
  return { pay: g.run.score - before, hits: inst._runHits };
});
ok('a new run resets the decay', perRun.pay === 1000 && perRun.hits === 1, JSON.stringify(perRun));

/* ---- one flipper per floor -------------------------------------------- */
await setup();
const pads = await p.evaluate(() => {
  const G = window.IP.game, g = G.g, H = window.IP.data.W.FLOOR_H;
  g.state.floors = 3; g.state.coins = 1e7;
  const first = G.buyPart('paddle', 35, H + 40, 1, 0);
  const second = G.buyPart('paddle', 70, H + 55, 1, 0);
  const auto = G.buyPart('autopaddle', 70, 2 * H + 40, 2, 0);
  const alsoAuto = G.buyPart('paddle', 35, 2 * H + 55, 2, 0);
  const otherFloor = G.buyPart('paddle', 50, 2 * H + 40, 2, 0);
  // A non-flipper part on the same floor must still be allowed.
  const bumper = G.buyPart('bumper', 60, H + 70, 1, 0);
  return { first: first.ok, second: second.ok, err: second.err,
           auto: auto.ok, alsoAuto: alsoAuto.ok, autoErr: alsoAuto.err,
           otherFloor: otherFloor.ok, bumper: bumper.ok };
});
ok('the first flipper on a floor is allowed', pads.first === true);
ok('a second flipper on that floor is refused', pads.second === false, pads.err);
ok('the refusal says why', /one flipper per floor/i.test(pads.err || ''), pads.err);
ok('an auto paddle counts as the floor flipper', pads.auto === true && pads.alsoAuto === false, pads.autoErr);
ok('other parts on that floor are unaffected', pads.bumper === true);

/* ---- the high-water mark ---------------------------------------------- */
await setup();
const best = await p.evaluate(() => {
  const G = window.IP.game, g = G.g;
  g.state.stats.bestY = 0;
  g.paused = false;
  g.awaitLaunch = false;
  g.balls.forEach((bl) => { bl.v.y = 420; bl.v.x = 3; });
  G.stepFor(400);
  const peak = g.state.stats.bestY;
  const highestBallNow = Math.max(...g.balls.filter((x) => x.alive).map((x) => x.p.y), 0);
  G.stepFor(600);                              // let it fall back
  return { peak, after: g.state.stats.bestY, highestBallNow };
});
ok('the peak is recorded', best.peak > 0, 'y=' + best.peak.toFixed(1));
ok('the peak never goes down as the ball falls', best.after >= best.peak,
  best.peak.toFixed(1) + ' → ' + best.after.toFixed(1));
ok('the peak is at least as high as the ball got', best.peak >= best.highestBallNow - 0.01,
  best.peak.toFixed(1) + ' vs ' + best.highestBallNow.toFixed(1));

/* ---- and the line is drawn where the stat says ------------------------ */
const line = await p.evaluate(() => {
  const g = window.IP.game.g, r = g.renderer;
  g.state.stats.bestY = 0;
  g.paused = true; g.camY = 0; g.prevCamY = 0; g.alpha = 0;
  r.draw(g);
  const none = r.ctx.canvas.toDataURL();
  g.state.stats.bestY = 60;                    // on screen at camY 0
  r.draw(g);
  const drawn = r.ctx.canvas.toDataURL();
  return { changed: none !== drawn, y: r.sy(60), h: r.view.h };
});
ok('a best height puts something new on the canvas', line.changed === true);
ok('the line lands on screen at that height', line.y > 0 && line.y < line.h,
  'y=' + line.y.toFixed(0) + ' of ' + line.h);

/* ---- more tower to climb ---------------------------------------------- */
const floors = await p.evaluate(() => {
  const D = window.IP.data;
  const max = D.W.MAX_FLOORS;
  const names = new Set(), bad = [];
  for (let k = 0; k < max; k++) {
    const f = D.floorAt(k);
    if (!f || !f.name || !f.tint || !f.accent) bad.push(k);
    if (!isFinite(D.floorCost(k)) || !isFinite(D.floorMult(k))) bad.push('inf@' + k);
    names.add(f && f.name);
  }
  return { max, hand: D.FLOORS.length, unique: names.size, bad,
           topMult: D.floorMult(max - 1),
           // Cost has to stay within reach of income, or the upper floors are
           // decoration. Compare how much harder the top floor is than an
           // early one, relative to what that floor earns.
           reachRatio: (D.floorCost(max - 1) / D.floorMult(max - 1)) / (D.floorCost(5) / D.floorMult(5)) };
});
// ⚠️ No literal here. This assertion used to read `max === 20` and failed the
// next time the tower grew — see the constants section of TRAPS.md.
ok('the tower is deep', floors.max >= 20, String(floors.max) + ' floors');
ok('every floor is named and themed, generated ones included',
  floors.bad.length === 0 && floors.unique === floors.max,
  floors.unique + ' unique names, bad=' + JSON.stringify(floors.bad));
ok('the tower goes beyond the hand-authored floors', floors.max > floors.hand,
  floors.hand + ' authored of ' + floors.max);
ok('the top floor multiplier is worth climbing for', floors.topMult > 1e5, '×' + floors.topMult);
ok('the top floor stays within reach of its own income',
  floors.reachRatio < 1e11, 'x' + floors.reachRatio.toExponential(1) + ' harder than floor 5');

/* ---- flippers are an early purchase ----------------------------------- */
const gate = await p.evaluate(() => {
  const D = window.IP.data;
  const row = D.PART_ORDER.find((r) => r[0] === 'paddle');
  const def = D.PART_BY_ID.paddle;
  return { gate: row && row[1], cost: def.cost, count: D.PART_ORDER.filter((r) => r[0] === 'paddle').length };
});
ok('paddles unlock early', gate.gate <= 2000, 'at ' + gate.gate + ' lifetime chips');
ok('paddles are listed exactly once', gate.count === 1, 'entries=' + gate.count);
ok('a paddle is affordable when it unlocks', gate.cost <= 400, 'cost=' + gate.cost);

/* ---- the run-over screen lists what the run unlocked ------------------ */
await setup();
const runend = await p.evaluate(() => {
  const G = window.IP.game, g = G.g;
  g.demo = false; g.running = false;
  g.state.settings.autoRun = false;
  window.IP.ui.closeModal(true);
  G.startRun(); g.running = false;
  const fresh = g.run.unlocks.length;                 // a new run starts empty
  g.run.unlocks = ['part:jet', 'ball:nova', 'tab:upgrades'];
  G.endRun();
  const box = document.querySelector('#modal .modalbox');
  const rows = [...box.querySelectorAll('.unrow')].map((r) => r.textContent);
  window.IP.ui.closeModal(true);
  return { fresh, rows, count: (box.querySelector('.slots') || {}).textContent };
});
ok('a new run starts with no unlocks banked', runend.fresh === 0, 'had ' + runend.fresh);
ok('the run-over screen lists every unlock', runend.rows.length === 3, runend.rows.join(' | '));
ok('each row names the thing and its kind',
  /Jet Pad/.test(runend.rows[0]) && /PART/.test(runend.rows[0]), runend.rows[0]);
ok('menu unlocks are listed too', runend.rows.some((r) => /UPGRADES/.test(r)), runend.rows.join(' | '));
ok('the count matches the list', runend.count === '3', String(runend.count));

// A quiet run must not show an empty header.
const quiet = await p.evaluate(() => {
  const G = window.IP.game, g = G.g;
  window.IP.ui.closeModal(true);
  G.startRun(); g.running = false;
  g.run.unlocks = [];
  G.endRun();
  const box = document.querySelector('#modal .modalbox');
  const has = box.textContent.includes('UNLOCKED THIS RUN');
  window.IP.ui.closeModal(true);
  return has;
});
ok('a run that unlocked nothing shows no unlock section', quiet === false);

// ⚠️ Unlocks are recorded when detected, not when the toast fires — toasts
// drain one per tick, so a run ending on a burst would list only some.
const burst = await p.evaluate(() => {
  const G = window.IP.game, g = G.g;
  G.startRun(); g.running = false; g.paused = false; g.locked = false;
  g.state.known = [];
  g.state.stats.totalChips = 1e9;                     // opens a lot at once
  G.stepFor(400);
  return { n: g.run.unlocks.length, paused: g.paused, known: g.state.known.length };
});
// ⚠️ `> 1` is not enough here. Toasts drain one per 0.75s tick, so a version
// that records only what it announced still banks a handful over 400 steps
// and sails past a loose threshold. The property is ALL of them.
ok('every unlock in a burst is recorded, not just the announced ones',
  burst.n === burst.known && burst.n > 20,
  'recorded=' + burst.n + ' of ' + burst.known + ' detected');

console.log(errs.length ? 'PAGE ERRORS:\n' + [...new Set(errs)].join('\n') : 'no page errors');
await b.close();
