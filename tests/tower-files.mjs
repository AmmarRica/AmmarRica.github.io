#!/usr/bin/env node
/* Save file round-trip, rejection paths, and device-control gating. */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
const ctx = await b.newContext({ viewport: { width: 400, height: 880 }, acceptDownloads: true });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push('ERR ' + e.message));
await p.goto(pathToFileURL('/home/user/AmmarRica.github.io').href + '/incremental-pinball/index.html');
await p.waitForTimeout(700);
const ok = (l, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + l + (x ? '  ' + x : '')); if (!c) process.exitCode = 1; };

// Build a distinctive tower to round-trip.
await p.evaluate(() => {
  const G = window.IP.game, g = G.g;
  G.wipe(); g.state.coins = 5e5; g.state.floors = 5; G.rebuild();
  for (let i = 0; i < 5; i++) G.buyPart('bumper', 20 + i * 12, 60 + (i % 2) * 18, 0, 0);
  G.buyPart('jet', 50, 62, 0, 0.3);
  const inst = g.state.parts[0]; inst.lvl = 4;
  G.buyUpgrade('flipPower'); G.buyBall('rubber'); G.selectBall('rubber');
  G.rebuild();
});
const before = await p.evaluate(() => {
  const g = window.IP.game.g;
  return { parts: g.state.parts.length, floors: g.state.floors, lvl: g.state.parts[0].lvl, ball: g.state.loadout,
           x: g.state.parts[0].x, a: g.state.parts[5] ? g.state.parts[5].a : 0 };
});

const file = await p.evaluate(() => JSON.stringify(window.IP.game.exportSave()));
const parsed = JSON.parse(file);
ok('export carries a magic field', parsed.format === 'tower-of-chips-save', parsed.format);
ok('export carries a format version', parsed.v === 1, 'v=' + parsed.v);
ok('export is self-contained', Array.isArray(parsed.state.parts) && parsed.state.parts.length === before.parts);
ok('filename names the content type', /tower-of-chips-save.*\.json$/.test(await p.evaluate(() => window.IP.game.suggestedFileName())),
   await p.evaluate(() => window.IP.game.suggestedFileName()));

// Wreck the live state, then load the file back.
await p.evaluate(() => { const G = window.IP.game; G.wipe(); });
ok('wipe really cleared it', 0 === await p.evaluate(() => window.IP.game.g.state.parts.length));
const after = await p.evaluate((f) => {
  window.IP.game.importSave(JSON.parse(f));
  const g = window.IP.game.g;
  return { parts: g.state.parts.length, floors: g.state.floors, lvl: g.state.parts[0].lvl, ball: g.state.loadout,
           x: g.state.parts[0].x, a: g.state.parts[5] ? g.state.parts[5].a : 0,
           builtFlippers: g.world.flippers.length };
}, file);
ok('round-trip restores parts', after.parts === before.parts, `${before.parts} -> ${after.parts}`);
ok('round-trip restores floors', after.floors === before.floors);
ok('round-trip restores part level', after.lvl === before.lvl);
ok('round-trip restores geometry', after.x === before.x && Math.abs(after.a - before.a) < 1e-9);
ok('round-trip restores loadout', after.ball === before.ball);
ok('world rebuilt from the loaded state', after.builtFlippers >= 2, 'flippers=' + after.builtFlippers);

// Rejection paths — each must throw something a human can act on.
const reject = (obj) => p.evaluate((o) => {
  try { window.IP.game.importSave(o); return null; } catch (e) { return e.message; }
}, obj);
ok('rejects a foreign .json', /not a Tower of Chips save/.test(await reject({ hello: 'world' })));
ok('rejects a newer format', /newer version/.test(await reject({ format: 'tower-of-chips-save', v: 99, state: {} })),
   await reject({ format: 'tower-of-chips-save', v: 99, state: {} }));
ok('rejects a versionless file', /no version/.test(await reject({ format: 'tower-of-chips-save', state: {} })));
ok('rejects a stateless file', /no game state/.test(await reject({ format: 'tower-of-chips-save', v: 1 })));

// Malformed rows must be dropped, not indexed into.
const junk = await p.evaluate(() => {
  const o = { format: 'tower-of-chips-save', v: 1, state: { floors: 3, parts: [
    { id: 'bumper', x: 40, y: 70, floor: 0, lvl: 2 },
    { id: 'bumper' },                       // no coordinates
    { id: 'no-such-part', x: 1, y: 2, floor: 0 },
    null, 'nope', 42,
    { id: 'bumper', x: NaN, y: 70, floor: 0 },
    { id: 'bumper', x: 60, y: 70, floor: 999, lvl: 9999 },
  ] } };
  window.IP.game.importSave(o);
  const g = window.IP.game.g;
  return { n: g.state.parts.length, floor: g.state.parts[1] && g.state.parts[1].floor,
           lvl: g.state.parts[1] && g.state.parts[1].lvl, uid: !!(g.state.parts[0] && g.state.parts[0].uid) };
});
ok('malformed rows are dropped', junk.n === 2, 'kept ' + junk.n + ' of 8');
ok('out-of-range values are clamped', junk.floor >= 0 && junk.floor < 12 && junk.lvl <= 20, `floor=${junk.floor} lvl=${junk.lvl}`);
ok('rebuilt through the real constructor', junk.uid === true);

// Device controls appear only where they have a job.
const dev = await p.evaluate(() => {
  window.IP.ui.UI.tab = 'stats'; window.IP.game.g.state.stats.runs = 2; window.IP.ui.setMenu(true);
  const rows = [...document.querySelectorAll('#menuBody .prow')].map(r => r.textContent);
  return { hasExport: rows.some(t => /Export save/.test(t)), hasImport: rows.some(t => /Import save/.test(t)),
           hasPad: rows.some(t => /Gamepad/.test(t)) };
});
ok('export/import offered', dev.hasExport && dev.hasImport);
ok('gamepad row hidden with no pad attached', dev.hasPad === false);

// --- localStorage persistence WITH parts placed ------------------------
// ⚠️ Regression guard for the bug this file found: parts carry `_cols`,
// which points back at the part, so state was a cycle and saveJSON silently
// returned false. Earlier persistence tests missed it because they set stats
// directly instead of PLACING a part.
const persisted = await p.evaluate(() => {
  const G = window.IP.game, g = G.g;
  G.wipe(); g.state.coins = 1e5; G.rebuild();
  G.buyPart('bumper', 40, 70, 0, 0);
  G.buyPart('jet', 50, 62, 0, 0);
  g.state.stats.totalChips = 4321;
  const wrote = G.save();
  const raw = localStorage.getItem(G.SAVE_KEY);
  let round = null;
  try { round = JSON.parse(raw); } catch (e) {}
  return { wrote, hasRaw: !!raw, parts: round && round.parts && round.parts.length,
           leaked: !!(round && round.parts && round.parts.some(x => '_cols' in x)),
           chips: round && round.stats && round.stats.totalChips };
});
ok('save() succeeds with parts on the table', persisted.wrote === true);
ok('localStorage actually holds the save', persisted.hasRaw && persisted.parts === 2, 'parts=' + persisted.parts);
ok('runtime-only fields are stripped', persisted.leaked === false);
ok('stats survive the write', persisted.chips === 4321, 'chips=' + persisted.chips);

await p.reload(); await p.waitForTimeout(800);
const reloaded = await p.evaluate(() => ({ parts: window.IP.game.g.state.parts.length,
                                           chips: window.IP.game.g.state.stats.totalChips }));
ok('save survives a reload with parts placed', reloaded.parts === 2 && reloaded.chips >= 4321,
   `parts=${reloaded.parts} chips=${reloaded.chips}`);

console.log(errs.length ? 'PAGE ERRORS:\n' + [...new Set(errs)].join('\n') : 'no page errors');
await b.close();
