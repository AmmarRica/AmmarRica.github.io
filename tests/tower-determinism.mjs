#!/usr/bin/env node
/*
 * Determinism: the same seed must replay to the same world state, and the
 * step loop must never touch Math.random.
 *
 * ⚠️ Two traps this test was rebuilt to avoid — see tests/TRAPS.md:
 *
 *  1. The Math.random stub THROWS rather than returning a constant. A
 *     constant lets a non-deterministic call site sail through while still
 *     being non-deterministic in the real game.
 *
 *  2. The scenario must actually REACH the random call sites. The first
 *     version used a Steel ball, which has no `luck` and no `splitChance`,
 *     so every proc short-circuited and both sabotage checks passed against
 *     a test that measured nothing. Hence the Nova ball, the luck perk, and
 *     the explicit "the stream was used" assertions below.
 *
 *  3. ONE setup function, used by every scenario. When separation had its
 *     own copy it drifted to a non-proccing ball and stopped catching a sim
 *     proc drawing from the cosmetic stream.
 */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';

const STEPS = 4000;
const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
const ctx = await b.newContext({ viewport: { width: 400, height: 880 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push('ERR ' + e.message));
await p.goto(pathToFileURL('/home/user/AmmarRica.github.io').href + '/incremental-pinball/index.html');
await p.waitForTimeout(700);
const ok = (l, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + l + (x ? '  ' + x : '')); if (!c) process.exitCode = 1; };

/** One scripted run. `burnFx` advances only the cosmetic stream. */
const run = (seed, opts = {}) => p.evaluate(({ seed, STEPS, burnFx, guard }) => {
  const G = window.IP.game, g = G.g;
  g.running = false;                       // stop rAF touching state
  g.demo = false;
  G.wipe();
  g.running = false;

  g.state.coins = 1e9;
  g.state.floors = 4;
  // A ball that procs: Nova carries both `luck` and `splitChance`, and the
  // luck perk raises the rate so both fire many times inside the window.
  g.state.balls.nova = 1; g.state.ballLevels.nova = 1; g.state.loadout = 'nova';
  g.state.perks.luck = 6;
  for (let i = 0; i < 8; i++) G.buyPart('bumper', 18 + i * 8, 58 + (i % 3) * 15, 0, 0);
  G.buyPart('roulette', 40, 96, 0, 0);
  G.buyPart('jet', 50, 62, 0, 0);
  G.buyTrinket('gambler');
  G.rebuild();

  // ⚠️ Pin the clock as well as the seed. g.time is part of the initial
  // state, and the page had been running rAF for different lengths of time
  // before each scenario — a harness bug that reads exactly like a sim bug.
  g.time = 0; g.lastSave = 0;
  window.IP.reseed(seed);
  G.startRun();
  window.IP.reseed(seed);                  // startRun reseeds; pin it again
  g.balls.forEach((bl) => { bl.lastHit = 0; });
  if (burnFx) for (let i = 0; i < 5000; i++) window.IP.rng.fx.next();
  g.awaitLaunch = false;
  g.balls.forEach((bl) => { bl.v.y = 250; bl.v.x = 11; });

  const real = Math.random;
  if (guard) Math.random = () => { throw new Error('Math.random() called inside step()'); };
  let err = null;
  let maxBalls = 0;
  try {
    for (let i = 0; i < STEPS; i += 50) { G.stepFor(50); maxBalls = Math.max(maxBalls, g.balls.length); }
  } catch (e) { err = e.message; }
  Math.random = real;
  return {
    hash: G.hashState(), err, score: Math.round(g.run.score), maxBalls,
    simDraws: window.IP.rng.sim.draws, fxDraws: window.IP.rng.fx.draws,
  };
}, { seed, STEPS, burnFx: !!opts.burnFx, guard: opts.guard !== false });

const a = await run(20260809);
ok('no Math.random() during ' + STEPS + ' steps', a.err === null, a.err || '');
ok('the run actually did something', a.score > 0, 'score=' + a.score);
// Without these three, "no Math.random" passes trivially on a scenario that
// never reaches a random call site — and so do the sabotage checks.
ok('the sim stream was actually used', a.simDraws > 50, 'draws=' + a.simDraws);
ok('the fx stream was actually used', a.fxDraws > 50, 'draws=' + a.fxDraws);
ok('proc-driven ball splitting fired', a.maxBalls > 1, 'peak balls=' + a.maxBalls);

const again = await run(20260809);
ok('same seed replays to the same state', a.hash === again.hash, a.hash + ' vs ' + again.hash);

const other = await run(999);
ok('a different seed diverges', a.hash !== other.hash, a.hash + ' vs ' + other.hash);

// Same setup, same seed, but 5000 cosmetic draws burned first. If any sim
// decision reads the fx stream, the hash moves.
const burned = await run(20260809, { burnFx: true });
ok('cosmetic stream cannot perturb the sim', a.hash === burned.hash, a.hash + ' vs ' + burned.hash);

console.log(errs.length ? 'PAGE ERRORS:\n' + [...new Set(errs)].join('\n') : 'no page errors');
await b.close();
