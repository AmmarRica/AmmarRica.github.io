#!/usr/bin/env node
/*
 * Removing parts: the refund maths, the undo, and the ways undo could be
 * turned into free money.
 *
 * ⚠️ The interesting assertions here are the ones that check undo is NOT
 * allowed. A refund is deliberately below the purchase price, so an undo
 * that does not charge the refund back is a coin pump — sell, undo, sell —
 * and one that ignores what you spent in between hands out free parts.
 * Testing only the happy path would pass on both of those.
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

/** A table with n bumpers on floor 0 and a known bank. */
const board = (n = 6, coins = 1e6) => p.evaluate(({ n, coins }) => {
  const G = window.IP.game, g = G.g;
  g.running = false; g.demo = false;
  // ⚠️ wipe() starts a run, and the table is frozen during one. End it the
  // way a player would before building anything.
  G.wipe();
  g.running = false;
  g.state.settings.autoRun = false; G.endRun();
  g.state.floors = 3;
  g.state.coins = coins;
  for (let i = 0; i < n; i++) G.buyPart('bumper', 16 + i * 11, 58 + (i % 3) * 16, 0, 0);
  g.state.coins = coins;
  G.rebuild();
  return { parts: g.state.parts.length, coins: g.state.coins };
}, { n, coins });

/* ---- a part can be removed at all ------------------------------------ */
let st = await board();
ok('the board set up', st.parts === 6, 'parts=' + st.parts);

const one = await p.evaluate(() => {
  const G = window.IP.game, g = G.g;
  const uid = g.state.parts[0].uid;
  const before = { parts: g.state.parts.length, coins: g.state.coins };
  const refund = G.sellPart(uid);
  return { before, refund, parts: g.state.parts.length, coins: g.state.coins, gone: !g.state.parts.some((q) => q.uid === uid) };
});
ok('removing a part takes it off the table', one.parts === 5 && one.gone, 'parts=' + one.parts);
ok('removing a part pays a refund', one.refund > 0 && one.coins === one.before.coins + one.refund,
  '+' + one.refund);

/* ---- and can be put back --------------------------------------------- */
const undone = await p.evaluate(() => {
  const G = window.IP.game, g = G.g;
  const before = { parts: g.state.parts.length, coins: g.state.coins };
  const r = G.undoSell();
  return { r, before, parts: g.state.parts.length, coins: g.state.coins, info: G.undoInfo() };
});
ok('undo puts the part back', undone.r.ok && undone.parts === 6, JSON.stringify(undone.r));
ok('undo charges the refund back', undone.coins === undone.before.coins - one.refund,
  undone.before.coins + ' → ' + undone.coins);
ok('undo is spent once used', undone.info === null);

/* ---- the part comes back intact, not as a fresh one ------------------- */
const intact = await p.evaluate(() => {
  const G = window.IP.game, g = G.g;
  const target = g.state.parts[0];
  target.lvl = 4; target.earned = 12345; target.used = 7;
  const snap = { uid: target.uid, lvl: target.lvl, earned: target.earned, x: target.x, y: target.y };
  G.sellPart(target.uid);
  G.undoSell();
  const back = g.state.parts.find((q) => q.uid === snap.uid);
  return { snap, back: back && { uid: back.uid, lvl: back.lvl, earned: back.earned, x: back.x, y: back.y } };
});
ok('a restored part keeps its level, earnings and place',
  JSON.stringify(intact.snap) === JSON.stringify(intact.back),
  JSON.stringify(intact.back));

/* ---- undo cannot mint coins ------------------------------------------ */
// Sell → undo → sell → undo, repeatedly. A refund that is not charged back
// on undo turns this loop into an infinite coin source.
const pump = await p.evaluate(() => {
  const G = window.IP.game, g = G.g;
  const start = g.state.coins;
  for (let i = 0; i < 25; i++) {
    G.sellPart(g.state.parts[0].uid);
    G.undoSell();
  }
  return { start, end: g.state.coins, parts: g.state.parts.length };
});
ok('25 sell/undo cycles do not mint coins', pump.end === pump.start,
  pump.start + ' → ' + pump.end);
ok('25 sell/undo cycles do not lose parts', pump.parts === 6, 'parts=' + pump.parts);

/* ---- undo refuses once the refund is spent --------------------------- */
const spent = await p.evaluate(() => {
  const G = window.IP.game, g = G.g;
  G.sellPart(g.state.parts[0].uid);
  g.state.coins = 0;                       // spent it all on something else
  const r = G.undoSell();
  return { r, parts: g.state.parts.length, coins: g.state.coins };
});
ok('undo refuses when the refund is already spent', spent.r.ok === false, JSON.stringify(spent.r));
ok('a refused undo hands out nothing', spent.parts === 5 && spent.coins === 0,
  'parts=' + spent.parts + ' coins=' + spent.coins);

/* ---- undo refuses if the space was built over ------------------------ */
const built = await p.evaluate(() => {
  const G = window.IP.game, g = G.g;
  g.state.coins = 1e6;
  const victim = g.state.parts[0];
  const at = { x: victim.x, y: victim.y };
  G.sellPart(victim.uid);
  G.buyPart('bumper', at.x, at.y, 0, 0);   // take the vacated spot
  const r = G.undoSell();
  const overlapping = g.state.parts.filter((q) => Math.abs(q.x - at.x) < 1 && Math.abs(q.y - at.y) < 1).length;
  return { r, overlapping };
});
ok('undo refuses when the space was built over', built.r.ok === false, JSON.stringify(built.r));
ok('nothing ends up stacked in the same spot', built.overlapping === 1, 'at that point=' + built.overlapping);

/* ---- clearing a whole floor ------------------------------------------ */
st = await board(6, 1e6);
const cleared = await p.evaluate(() => {
  const G = window.IP.game, g = G.g;
  const before = g.state.coins;
  const refund = G.sellFloor(0);
  const after = { parts: g.state.parts.length, coins: g.state.coins };
  const r = G.undoSell();
  return { refund, gained: g.state.coins, after, r, restored: g.state.parts.length, before };
});
ok('clearing a floor removes every part on it', cleared.after.parts === 0, 'left=' + cleared.after.parts);
ok('clearing a floor refunds the lot', cleared.refund > 0 && cleared.after.coins === cleared.before + cleared.refund,
  '+' + cleared.refund);
ok('one undo restores the whole batch', cleared.r.ok && cleared.restored === 6, 'restored=' + cleared.restored);

/* ---- a batch is worth the same as the parts sold one at a time -------- */
// refundValue() prices a part off how many of its type you still own, so a
// batch that reads every price before removing anything overpays.
const parity = await p.evaluate(() => {
  const G = window.IP.game, g = G.g;
  g.state.coins = 1e6;
  const batch = G.sellFloor(0);
  G.undoSell();
  let single = 0;
  while (g.state.parts.length) single += G.sellPart(g.state.parts[0].uid);
  return { batch, single };
});
ok('a batch refund equals the same parts sold one by one', parity.batch === parity.single,
  'batch=' + parity.batch + ' single=' + parity.single);

/* ---- undo does not survive a wipe ------------------------------------ */
const wiped = await p.evaluate(() => {
  const G = window.IP.game, g = G.g;
  g.state.coins = 1e6;
  G.buyPart('bumper', 30, 60, 0, 0);
  G.sellPart(g.state.parts[0].uid);
  G.wipe(); g.running = false; g.state.settings.autoRun = false; G.endRun();
  return { info: G.undoInfo(), parts: g.state.parts.length };
});
ok('a wipe drops the pending undo', wiped.info === null, JSON.stringify(wiped.info));
ok('a wipe leaves an empty table', wiped.parts === 0, 'parts=' + wiped.parts);

/* ---- the removed part does not follow the save ------------------------ */
// The undo buffer holds a whole part object. On g.state it would be
// serialised — and a part carries a collider cache that points back at it,
// which is how saving broke silently once before.
const saved = await p.evaluate(() => {
  const G = window.IP.game, g = G.g;
  g.state.coins = 1e6;
  G.buyPart('bumper', 30, 60, 0, 0);
  G.sellPart(g.state.parts[g.state.parts.length - 1].uid);
  const wrote = G.save();
  const raw = localStorage.getItem('towerOfChips.v1') || '';
  return { wrote, hasUndo: /"undo"/.test(raw), len: raw.length };
});
ok('saving still works with a pending undo', saved.wrote !== false && saved.len > 0, 'bytes=' + saved.len);
ok('the undo buffer is not written to the save', saved.hasUndo === false);

console.log(errs.length ? 'PAGE ERRORS:\n' + [...new Set(errs)].join('\n') : 'no page errors');
await b.close();
