#!/usr/bin/env node
/*
 * Shareable layouts: export the design, import someone else's.
 *
 * ⚠️ The interesting half is the economy. A layout that placed a maxed-out
 * table for free would be a cheat with a share button on it, so importing
 * costs what the parts cost you today. Most of this file is about that, and
 * about the import being all-or-nothing — a half-applied layout would leave
 * the player's table destroyed and their coins gone.
 */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';

const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
const p = await (await b.newContext({ viewport: { width: 420, height: 900 } })).newPage();
const errs = []; p.on('pageerror', (e) => errs.push('ERR ' + e.message));
await p.goto(pathToFileURL('/home/user/AmmarRica.github.io').href + '/incremental-pinball/index.html');
await p.waitForTimeout(800);
const ok = (l, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + l + (x ? '  ' + x : '')); if (!c) process.exitCode = 1; };

/** A table with a few parts on it, out of a run so the table is editable. */
const build = (coins = 1e7) => p.evaluate((coins) => {
  const G = window.IP.game, g = G.g, H = window.IP.data.W.FLOOR_H;
  g.running = false; g.demo = false;
  G.wipe(); g.running = false;
  g.state.settings.autoRun = false; G.endRun();
  g.state.floors = 3; g.state.stats.totalChips = 1e9; g.state.coins = 1e7;
  G.buyPart('bumper', 30, 60, 0, 0);
  G.buyPart('bumper', 60, 75, 0, 0);
  G.buyPart('tramp', 45, 95, 0, 0);
  G.buyPart('paddle', 40, H + 40, 1, 0);
  g.state.parts[3].panel = 3;
  g.state.coins = coins;
  G.rebuild();
  return g.state.parts.length;
}, coins);

/* ---- the setup can build at all --------------------------------------- */
const n = await build();
ok('the setup placed a table to export', n === 4, 'parts=' + n);

/* ---- export is the design and nothing else ---------------------------- */
const exported = await p.evaluate(() => {
  const lay = window.IP.game.exportLayout();
  const txt = JSON.stringify(lay);
  return {
    keys: Object.keys(lay), parts: lay.parts.length, bytes: txt.length, txt,
    partKeys: [...new Set(lay.parts.flatMap((q) => Object.keys(q)))].sort(),
    // Nothing personal, and nothing that is this save's history.
    leaks: /coins|gems|totalChips|bestRun|upgrades|trinkets|earned|used|stats|seed/.test(txt),
    flipperHasPanel: lay.parts.some((q) => q.id === 'paddle' && q.panel === 3),
    bumperHasPanel: lay.parts.some((q) => q.id === 'bumper' && 'panel' in q),
  };
});
ok('a layout carries only the design', exported.leaks === false, exported.partKeys.join(','));
ok('every part is in it', exported.parts === 4, String(exported.parts));
ok('it is small enough to paste into a chat', exported.bytes < 1200, exported.bytes + ' bytes');
ok('a flipper keeps its panel binding', exported.flipperHasPanel === true);
ok('a bumper does not carry a panel it never uses', exported.bumperHasPanel === false, exported.partKeys.join(','));

/* ---- and rebuilds the same table -------------------------------------- */
const round = await p.evaluate((txt) => {
  const G = window.IP.game, g = G.g;
  const before = g.state.parts.map((q) => q.id + '@' + q.x + ',' + q.y + ',' + q.floor + ',L' + q.lvl).sort();
  g.state.coins = 1e7;
  const r = G.importLayout(JSON.parse(txt));
  const after = g.state.parts.map((q) => q.id + '@' + q.x + ',' + q.y + ',' + q.floor + ',L' + q.lvl).sort();
  return { r, same: JSON.stringify(before) === JSON.stringify(after), before, after };
}, exported.txt);
ok('importing its own layout rebuilds the same table', round.same === true,
  round.after.join(' | '));

/* ---- levels survive the trip ------------------------------------------ */
const levels = await p.evaluate(() => {
  const G = window.IP.game, g = G.g;
  g.state.coins = 1e9;
  g.state.parts[0].lvl = 5; g.state.parts[1].lvl = 3;
  const txt = JSON.stringify(G.exportLayout());
  G.importLayout(JSON.parse(txt));
  return g.state.parts.map((q) => q.lvl).sort((a, c) => c - a);
});
ok('part levels survive export and import', levels[0] === 5 && levels[1] === 3, levels.join(','));

/* ---- it costs what it would cost you ---------------------------------- */
// The whole point. Free layouts are a cheat with a share button on them.
const priced = await p.evaluate((txt) => {
  const G = window.IP.game, g = G.g;
  g.state.parts = []; G.rebuild();               // empty table, so no refund
  g.state.coins = 1e9;
  const before = g.state.coins;
  const plan = G.previewLayout(JSON.parse(txt));
  const r = G.importLayout(JSON.parse(txt));
  return { plan, spent: before - g.state.coins, placed: r.placed, ok: r.ok };
}, exported.txt);
ok('importing a layout is not free', priced.spent > 0, 'spent ' + priced.spent);
ok('the preview matches what it actually charged', priced.spent === priced.plan.cost,
  'preview ' + priced.plan.cost + ' vs charged ' + priced.spent);

/* ---- and is refused when you cannot pay ------------------------------- */
const broke = await p.evaluate((txt) => {
  const G = window.IP.game, g = G.g;
  const partsBefore = g.state.parts.length;
  g.state.coins = 1;
  const r = G.importLayout(JSON.parse(txt));
  return { r, coins: g.state.coins, parts: g.state.parts.length, partsBefore };
}, exported.txt);
ok('a layout you cannot afford is refused', broke.r.ok === false, broke.r.err);
ok('a refused import leaves the table alone',
  broke.parts === broke.partsBefore && broke.coins === 1,
  'parts=' + broke.parts + ' coins=' + broke.coins);

/* ---- locked content is skipped, not smuggled in ----------------------- */
const gated = await p.evaluate(() => {
  const G = window.IP.game, g = G.g, D = window.IP.data;
  g.state.coins = 1e9; g.state.stats.totalChips = 0;   // almost nothing unlocked
  g.state.floors = 2;
  const lay = {
    format: G.LAYOUT_MAGIC, v: 1, floors: 9,
    parts: [
      { id: 'bumper', x: 30, y: 60, floor: 0, lvl: 1 },
      { id: 'splitter', x: 50, y: 70, floor: 0, lvl: 1 },   // gated at 200M chips
      { id: 'bumper', x: 40, y: 60, floor: 7, lvl: 1 },     // floor not built
      { id: 'not-a-real-part', x: 50, y: 60, floor: 0, lvl: 1 },
    ],
  };
  const plan = G.previewLayout(lay);
  const r = G.importLayout(lay);
  return { plan, r, ids: g.state.parts.map((q) => q.id) };
});
ok('a part you have not unlocked is skipped', gated.plan.skipped.some((s) => /unlocked/i.test(s)),
  gated.plan.skipped.join(' | '));
ok('a floor you have not built is skipped', gated.plan.skipped.some((s) => /not built/i.test(s)));
ok('an unknown part id is skipped', gated.plan.skipped.some((s) => /unknown/i.test(s)));
ok('only the legal part is placed', gated.ids.length === 1 && gated.ids[0] === 'bumper', gated.ids.join(','));

/* ---- the table rules still apply -------------------------------------- */
const rules = await p.evaluate(() => {
  const G = window.IP.game, g = G.g, H = window.IP.data.W.FLOOR_H;
  g.state.coins = 1e9; g.state.stats.totalChips = 1e9; g.state.floors = 3;
  const lay = {
    format: G.LAYOUT_MAGIC, v: 1,
    parts: [
      { id: 'paddle', x: 35, y: H + 40, floor: 1, lvl: 1, side: 'L', panel: 0 },
      { id: 'paddle', x: 70, y: H + 55, floor: 1, lvl: 1, side: 'R', panel: 1 },
    ],
  };
  G.importLayout(lay);
  return g.state.parts.filter((q) => q.floor === 1).length;
});
ok('one-flipper-per-floor survives an import', rules === 1, 'placed ' + rules);

/* ---- rejected the way a save file is --------------------------------- */
const bad = await p.evaluate(() => {
  const G = window.IP.game;
  const err = (o) => { try { G.previewLayout(o); return null; } catch (e) { return e.message; } };
  return {
    nonsense: err({ hello: 1 }),
    save: err({ format: G.FILE_MAGIC, v: 1, state: {} }),
    newer: err({ format: G.LAYOUT_MAGIC, v: 99, parts: [] }),
    noParts: err({ format: G.LAYOUT_MAGIC, v: 1 }),
  };
});
ok('a non-layout file is rejected', !!bad.nonsense, bad.nonsense);
ok('a full save is rejected with the right advice', /IMPORT SAVE/i.test(bad.save || ''), bad.save);
ok('a newer format is rejected', /newer version/i.test(bad.newer || ''), bad.newer);
ok('a layout with no parts is rejected', !!bad.noParts, bad.noParts);

/* ---- and refused mid-run, like every other table change --------------- */
const midRun = await p.evaluate((txt) => {
  const G = window.IP.game, g = G.g;
  g.state.coins = 1e9;
  G.startRun(); g.running = false;
  const r = G.importLayout(JSON.parse(txt));
  const parts = g.state.parts.length;
  g.state.settings.autoRun = false; G.endRun();
  return { r, parts };
}, exported.txt);
ok('a layout cannot be built mid-run', midRun.r.ok === false, midRun.r.err);
ok('the mid-run refusal is the build lock', /finish the run/i.test(midRun.r.err || ''), midRun.r.err);

console.log(errs.length ? 'PAGE ERRORS:\n' + [...new Set(errs)].join('\n') : 'no page errors');
await b.close();
