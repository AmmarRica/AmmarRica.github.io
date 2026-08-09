#!/usr/bin/env node
/*
 * Parallax: the depth layers must actually paint, must scroll at their own
 * rates, and must not cost the renderer its two hard guarantees — draw() is
 * idempotent, and drawing consumes no randomness.
 *
 * ⚠️ "The canvas changed when I turned depth on" is not evidence that the
 * layers work; it passes while three of the four render nothing. Hence the
 * per-layer counters in view.drawn, which distinguish "painted nothing" from
 * "painted behind something".
 */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';

const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
const ctx = await b.newContext({ viewport: { width: 420, height: 900 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push('ERR ' + e.message));
await p.goto(pathToFileURL('/home/user/AmmarRica.github.io').href + '/incremental-pinball/index.html');
await p.waitForTimeout(700);
const ok = (l, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + l + (x ? '  ' + x : '')); if (!c) process.exitCode = 1; };

/** Park the sim so nothing but the camera moves between draws. */
const setup = () => p.evaluate(() => {
  const g = window.IP.game.g;
  g.running = false;
  g.demo = false;
  g.paused = true;
  g.state.floors = 8;
  g.state.settings.depth = true;
  g.time = 0;
  window.IP.game.rebuild();
});
const at = (camY) => p.evaluate((camY) => {
  const g = window.IP.game.g;
  g.camY = camY; g.prevCamY = camY; g.alpha = 0;
  g.renderer.draw(g);
  return JSON.parse(JSON.stringify(g.renderer.view.drawn));
}, camY);

await setup();

/* ---- every layer actually paints ------------------------------------- */
const drawn = await at(260);
for (const k of ['far', 'mid', 'struct', 'fore']) {
  ok('layer "' + k + '" painted something', (drawn[k] || 0) > 0, 'pieces=' + (drawn[k] || 0));
}

/* ---- and stops when the setting is off ------------------------------- */
const off = await p.evaluate(() => {
  const g = window.IP.game.g;
  g.state.settings.depth = false;
  g.renderer.draw(g);
  const d = JSON.parse(JSON.stringify(g.renderer.view.drawn));
  g.state.settings.depth = true;
  return d;
});
ok('depth:false stops every layer', ['far', 'mid', 'struct', 'fore'].every((k) => off[k] === 0), JSON.stringify(off));

/* ---- layers scroll at different rates -------------------------------- */
// The whole effect is this number being different per layer. Measured
// through the renderer's own transform, so a layer drawn with sy() instead
// of dy() — i.e. glued to the world, no parallax at all — is caught.
const rates = await p.evaluate(() => {
  const r = window.IP.game.g.renderer, g = window.IP.game.g;
  const shift = (p) => {
    g.camY = 0; g.prevCamY = 0; g.alpha = 0; r.draw(g);
    const a = r.dy(500, p);
    g.camY = 100; g.prevCamY = 100; g.alpha = 0; r.draw(g);
    // Screen y grows downward, so climbing pushes a fixed world point *down*
    // the screen. The distance travelled is what matters, not its sign.
    return Math.abs(r.dy(500, p) - a) / r.view.scale;   // world units per 100 climbed
  };
  return {
    far: shift(r.DEPTH.far), mid: shift(r.DEPTH.mid),
    struct: shift(r.DEPTH.struct), fore: shift(r.DEPTH.fore),
    world: shift(1), depth: r.DEPTH,
  };
});
ok('depth 1 is exactly the world', Math.abs(rates.world - 100) < 0.01, rates.world.toFixed(2));
ok('far scrolls slowest', Math.abs(rates.far - 100 * rates.depth.far) < 0.01 && rates.far < rates.mid,
  rates.far.toFixed(1) + ' < ' + rates.mid.toFixed(1));
ok('layers are strictly ordered by depth',
  rates.far < rates.mid && rates.mid < rates.struct && rates.struct < rates.world && rates.world < rates.fore,
  [rates.far, rates.mid, rates.struct, rates.world, rates.fore].map((n) => n.toFixed(1)).join(' < '));
ok('the foreground overtakes the world', rates.fore > 100, rates.fore.toFixed(1));

/* ---- still idempotent, still no randomness ---------------------------- */
const purity = await p.evaluate(() => {
  const g = window.IP.game.g, r = g.renderer;
  g.camY = 300; g.prevCamY = 300; g.alpha = 0;
  const real = Math.random;
  Math.random = () => { throw new Error('Math.random() called while drawing'); };
  const sim0 = window.IP.rng.sim.draws, fx0 = window.IP.rng.fx.draws;
  let err = null, a = null, same = false;
  try {
    r.draw(g); a = r.ctx.canvas.toDataURL();
    for (let i = 0; i < 20; i++) r.draw(g);
    same = r.ctx.canvas.toDataURL() === a;
  } catch (e) { err = e.message; }
  Math.random = real;
  return { err, same, sim: window.IP.rng.sim.draws - sim0, fx: window.IP.rng.fx.draws - fx0 };
});
ok('drawing the layers calls no Math.random', purity.err === null, purity.err || '');
ok('drawing the layers draws from no rng stream', purity.sim === 0 && purity.fx === 0,
  'sim=' + purity.sim + ' fx=' + purity.fx);
ok('21 draws of the same state are one image', purity.same);

/* ---- content is stable across reloads --------------------------------- */
// Hashed from the lattice index, not stored and not seeded: the same height
// has to look the same on the next visit, or the tower rebuilds itself.
const first = await p.evaluate(() => {
  const g = window.IP.game.g;
  g.camY = 640; g.prevCamY = 640; g.alpha = 0;
  g.renderer.draw(g);
  return g.renderer.ctx.canvas.toDataURL();
});
await p.reload();
await p.waitForTimeout(700);
await setup();
const second = await p.evaluate(() => {
  const g = window.IP.game.g;
  g.camY = 640; g.prevCamY = 640; g.alpha = 0;
  g.renderer.draw(g);
  return g.renderer.ctx.canvas.toDataURL();
});
ok('the same height looks the same after a reload', first === second);

console.log(errs.length ? 'PAGE ERRORS:\n' + [...new Set(errs)].join('\n') : 'no page errors');
await b.close();
