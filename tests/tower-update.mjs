#!/usr/bin/env node
/*
 * Required updates: the 30-day deadline, the lock, and the patch notes.
 *
 * ⚠️ Most of this file is about when the game must NOT lock. A rule that
 * locks on "we did not see a new version" instead of "we saw one, 30 days
 * ago" bricks an offline-capable game for being offline — and a happy-path
 * test where the clock is simply wound forward passes on that bug.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

/* ⚠️ Served over real HTTP, not file://. Update.check() returns immediately
 * on a file:// page — there are no deploys there — so an "offline does not
 * lock the game" assertion run from file:// passes without the rule ever
 * executing. That is exactly how the first version of this suite passed its
 * own sabotage check. `serverVersion` drives what the check finds. */
const ROOT = '/home/user/AmmarRica.github.io';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
let serverVersion = null;                       // null = serve the real file
const srv = createServer((req, res) => {
  let f = join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
  if (!existsSync(f)) { res.writeHead(404); return res.end('nope'); }
  let body = readFileSync(f);
  if (serverVersion && f.endsWith('index.html')) {
    body = Buffer.from(String(body).replace(/name="app-version" content="[^"]+"/, 'name="app-version" content="' + serverVersion + '"'));
  }
  res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(body);
});
await new Promise((r) => srv.listen(8100, r));

const DAY = 86400000;
const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
const ctx = await b.newContext({ viewport: { width: 420, height: 900 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push('ERR ' + e.message));
await p.goto('http://localhost:8100/incremental-pinball/index.html');
await p.waitForTimeout(1000);
const ok = (l, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + l + (x ? '  ' + x : '')); if (!c) process.exitCode = 1; };

const reset = () => p.evaluate(() => {
  const g = window.IP.game.g;
  g.state.update = { seen: null, seenAt: 0, notesFor: null, ran: window.IP.VERSION };
  g.locked = false; g.paused = false;
  window.IP.ui.closeModal(true);
  window.IP.ui.__t.enforceLock();
});

/* ---- version comparison, pinned from both ends ------------------------ */
const cmp = await p.evaluate(() => {
  const c = window.IP.util.cmpVer;
  return { newer: c('1.10.0', '1.9.0'), older: c('1.9.0', '1.10.0'), same: c('1.9.0', '1.9.0'),
           pad: c('1.9', '1.9.0'), major: c('2.0.0', '1.99.9') };
});
ok('cmpVer: 1.10.0 is newer than 1.9.0 (not string order)', cmp.newer === 1, String(cmp.newer));
ok('cmpVer: the reverse is older', cmp.older === -1, String(cmp.older));
ok('cmpVer: equal versions compare equal', cmp.same === 0 && cmp.pad === 0);
ok('cmpVer: a major bump wins', cmp.major === 1, String(cmp.major));

/* ---- a newer version starts the clock --------------------------------- */
await reset();
const seen = await p.evaluate(() => {
  const G = window.IP.game;
  G.noteVersionSeen('99.0.0');
  const d = G.updateDeadline();
  return { d, locked: G.g.locked, at: G.g.state.update.seenAt };
});
ok('seeing a newer version starts a deadline', !!seen.d && seen.d.version === '99.0.0', JSON.stringify(seen.d));
ok('the deadline is 30 days out', Math.round(seen.d.daysLeft) === 30, String(seen.d.daysLeft));
ok('nothing locks on day zero', seen.locked === false);

/* ---- the same version seen again does not restart it ------------------ */
const restart = await p.evaluate((DAY) => {
  const G = window.IP.game;
  G.g.state.update.seenAt = Date.now() - 20 * DAY;      // 20 days in
  G.noteVersionSeen('99.0.0');                          // seen again today
  return Math.round(G.updateDeadline().daysLeft);
}, DAY);
ok('re-seeing the same version does not reset the clock', restart === 10, 'daysLeft=' + restart);

/* ---- it locks once overdue -------------------------------------------- */
const locked = await p.evaluate((DAY) => {
  const G = window.IP.game, g = G.g;
  g.state.update.seenAt = Date.now() - 31 * DAY;
  const wasLocked = window.IP.ui.__t.enforceLock();
  // Measured, not inferred from a flag: run the sim and see if anything moves.
  const t0 = g.time;
  const ball = g.balls[0];
  const y0 = ball ? ball.p.y : 0;
  G.stepFor(600);
  g.awaitLaunch = true;
  g.plunger.pull = 1;
  G.plungerRelease();                                   // must refuse
  return {
    wasLocked, locked: g.locked, paused: g.paused,
    simMoved: g.time !== t0 || (ball && ball.p.y !== y0),
    stillAwaiting: g.awaitLaunch,
    modal: document.querySelector('#modal').classList.contains('on'),
    sticky: document.querySelector('#modal').classList.contains('sticky'),
    body: (document.querySelector('#modal .modalbox') || {}).textContent || '',
  };
}, DAY);
ok('31 days past the deadline locks the game', locked.wasLocked === true && locked.locked === true);
ok('600 sim steps advance nothing while locked', locked.simMoved === false);
ok('the plunger will not fire while locked', locked.stillAwaiting === true);
ok('a lock screen is shown', locked.modal === true, locked.body.slice(0, 40));
ok('the lock screen cannot be dismissed', locked.sticky === true);

/* ---- but never traps the save ----------------------------------------- */
const escape = await p.evaluate(() => {
  const labels = [...document.querySelectorAll('#modal .btn')].map((x) => x.textContent.trim());
  window.IP.ui.closeModal();                            // an ordinary close must bounce
  return { labels, stillOpen: document.querySelector('#modal').classList.contains('on') };
});
ok('the lock screen offers a save export', escape.labels.some((l) => /EXPORT/.test(l)), escape.labels.join(' | '));
ok('the lock screen offers the update', escape.labels.some((l) => /UPDATE/.test(l)));
ok('closeModal() cannot dismiss it', escape.stillOpen === true);

/* ---- a real check reaches the server ---------------------------------- */
// Proves the scenario below actually exercises Update.check(). Without this,
// every offline assertion passes on a page where check() returns at line one.
await reset();
serverVersion = '99.0.0';
const live = await p.evaluate(async () => {
  const G = window.IP.game;
  const found = await window.IP.ui.__t.Update.check(false);
  return { found, d: G.updateDeadline(), lastCheck: window.IP.ui.__t.Update.lastCheck };
});
ok('a live check finds the deployed version', live.found === '99.0.0', String(live.found));
ok('a live check starts the deadline', !!live.d && live.d.version === '99.0.0', JSON.stringify(live.d));
ok('a live check stamps lastCheck', live.lastCheck > 0, String(live.lastCheck));

/* ---- a failed check must not start the clock -------------------------- */
// The important one. Offline is not evidence that an update exists.
await reset();
serverVersion = null;
const offline = await p.evaluate(async () => {
  const G = window.IP.game;
  const realFetch = window.fetch;
  let attempts = 0;
  window.fetch = () => { attempts++; return Promise.reject(new Error('offline')); };
  window.IP.ui.__t.Update.lastCheck = 0;
  for (let i = 0; i < 5; i++) await window.IP.ui.__t.Update.check(false);
  window.fetch = realFetch;
  return { attempts, d: G.updateDeadline(), locked: G.g.locked, seen: G.g.state.update.seen,
           lastCheck: window.IP.ui.__t.Update.lastCheck };
});
ok('the failing checks actually tried to fetch', offline.attempts === 5, 'attempts=' + offline.attempts);
ok('a failed check does not stamp lastCheck', offline.lastCheck === 0, String(offline.lastCheck));
ok('a month of failed checks starts no deadline', offline.d === null && offline.seen === null,
  JSON.stringify(offline));
ok('being offline never locks the game', offline.locked === false);

/* ---- an older version on the server must not start the clock ---------- */
await reset();
const rollback = await p.evaluate(() => {
  const G = window.IP.game;
  G.noteVersionSeen('0.0.1');
  return { d: G.updateDeadline(), seen: G.g.state.update.seen };
});
ok('a rollback does not start a deadline', rollback.d === null && rollback.seen === null,
  JSON.stringify(rollback));

/* ---- updating clears an existing deadline ----------------------------- */
const cleared = await p.evaluate((DAY) => {
  const G = window.IP.game;
  G.noteVersionSeen('99.0.0');
  G.g.state.update.seenAt = Date.now() - 40 * DAY;
  const before = !!G.updateDeadline();
  G.noteVersionSeen(window.IP.VERSION);          // a later check: we are current
  window.IP.ui.__t.enforceLock();
  return { before, after: G.updateDeadline(), locked: G.g.locked };
}, DAY);
ok('a deadline exists before updating', cleared.before === true);
ok('being current clears the deadline and the lock',
  cleared.after === null && cleared.locked === false, JSON.stringify(cleared));

/* ---- a clock moved backwards resets instead of locking ---------------- */
await reset();
const backwards = await p.evaluate((DAY) => {
  const G = window.IP.game;
  G.noteVersionSeen('99.0.0');
  G.g.state.update.seenAt = Date.now() + 400 * DAY;   // device date is wrong
  const d = G.updateDeadline();
  return { daysLeft: Math.round(d.daysLeft), locked: window.IP.ui.__t.enforceLock() };
}, DAY);
ok('a seenAt in the future resets rather than locking',
  backwards.daysLeft === 30 && backwards.locked === false, JSON.stringify(backwards));

/* ---- the countdown is visible long before the lock -------------------- */
const banner = await p.evaluate((DAY) => {
  const G = window.IP.game, U = window.IP.ui.__t;
  const at = (days) => {
    G.g.state.update = { seen: '99.0.0', seenAt: Date.now() - days * DAY, notesFor: null, ran: window.IP.VERSION };
    const b = U.updateBanner();
    return b && b.head;
  };
  return { d0: at(0), d25: at(25), d29: at(29), d31: at(31) };
}, DAY);
ok('day 0 reads as an ordinary update', /available/i.test(banner.d0), banner.d0);
ok('day 25 counts down', /required in 5 days/i.test(banner.d25), banner.d25);
ok('day 29 counts down to one', /required in 1 day$/i.test(banner.d29), banner.d29);
ok('day 31 reads as required', /^Update required$/i.test(banner.d31), banner.d31);

// ⚠️ The helper returning the right string is not the bar showing it. The bar
// is built once at boot; if it is only toggled and never repainted, the
// countdown is frozen at whatever it said when the page loaded.
const barDom = await p.evaluate((DAY) => {
  const g = window.IP.game.g, U = window.IP.ui.__t;
  const at = (days) => {
    g.state.update = { seen: '99.0.0', seenAt: Date.now() - days * DAY, notesFor: null, ran: window.IP.VERSION };
    U.Update.found = '99.0.0'; U.Update.declined = null;
    U.refreshInstallUI();
    const bar = document.querySelector('#updateBar');
    return { text: bar.textContent, urgent: bar.classList.contains('urgent'),
             dismissable: /✕/.test(bar.textContent) };
  };
  return { early: at(2), late: at(28), over: at(31) };
}, DAY);
ok('the bar in the DOM shows the countdown', /required in 2 days/i.test(barDom.late.text), barDom.late.text);
ok('the bar is not urgent early on', barDom.early.urgent === false && /Update available/.test(barDom.early.text));
ok('the bar turns urgent near the deadline', barDom.late.urgent === true);
ok('an overdue bar cannot be dismissed', barDom.over.dismissable === false, barDom.over.text);
ok('an early bar can be dismissed', barDom.early.dismissable === true);

/* ---- patch notes ------------------------------------------------------ */
const notes = await p.evaluate(() => {
  const D = window.IP.data;
  const list = D.changesSince('1.6.0');
  const since = list.map((c) => c.v);
  const cmp = window.IP.util.cmpVer;
  window.IP.ui.closeModal(true);
  window.IP.ui.__t.showChangelog();
  const box = document.querySelector('#modal .modalbox');
  const text = box.textContent;
  const entries = box.querySelectorAll('.patch').length;
  window.IP.ui.closeModal(true);
  return {
    since, entries, total: D.CHANGELOG.length,
    sinceAllNewer: list.every((c) => cmp(c.v, '1.6.0') > 0),
    sinceHasOlder: D.CHANGELOG.some((c) => cmp(c.v, '1.6.0') <= 0 && since.includes(c.v)),
    ordered: D.CHANGELOG.every((c, i, a) => i === 0 || window.IP.util.cmpVer(a[i - 1].v, c.v) > 0),
    // A release with nothing player-facing is allowed to be fixes-only —
    // that is the point of the `fixes` line. What is not allowed is an entry
    // that says nothing at all.
    everyEntrySaysSomething: D.CHANGELOG.every((c) =>
      (Array.isArray(c.notes) && c.notes.length > 0) || (typeof c.fixes === 'string' && c.fixes.length > 0)),
    mentionsUndo: /undone/i.test(text),
  };
});
// ⚠️ Assert the property, not a frozen list. The literal here had to be
// edited every release, which makes shipping a patch look like a failure.
ok('changesSince() returns only newer versions',
  notes.since.length > 0 && notes.sinceAllNewer && !notes.sinceHasOlder,
  JSON.stringify(notes.since));
ok('patch notes render every version', notes.entries === notes.total, notes.entries + '/' + notes.total);
ok('patch notes are newest first', notes.ordered);
ok('every version says something a player can act on', notes.everyEntrySaysSomething);
ok('the notes carry real content', notes.mentionsUndo);

/* ---- "what's new" only for someone upgrading -------------------------- */
const whatsNew = await p.evaluate(() => {
  const g = window.IP.game.g, U = window.IP.ui.__t;
  window.IP.ui.closeModal(true);
  g.state.update = { seen: null, seenAt: 0, notesFor: null, ran: null };   // fresh install
  U.maybeShowPatchNotes();
  const fresh = document.querySelector('#modal').classList.contains('on');
  window.IP.ui.closeModal(true);
  g.state.update.ran = '1.6.0';                                            // upgraded from older
  U.maybeShowPatchNotes();
  return { fresh, ranNow: g.state.update.ran };
});
ok('a fresh install is not shown release notes', whatsNew.fresh === false);
ok('the run marker advances to this build', whatsNew.ranNow === await p.evaluate(() => window.IP.VERSION));

console.log(errs.length ? 'PAGE ERRORS:\n' + [...new Set(errs)].join('\n') : 'no page errors');
await b.close();
srv.close();
