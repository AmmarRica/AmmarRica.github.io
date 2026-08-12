import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
const ctx = await b.newContext({ viewport: { width: 360, height: 720 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror', e=>errs.push('ERR '+e.message));
await p.goto(pathToFileURL('/home/user/AmmarRica.github.io').href + '/incremental-pinball/index.html');
await p.waitForTimeout(600);
await p.click('.macts .btn.primary');
await p.evaluate(()=>{ const G=window.IP.game; G.g.state.coins=1e7; G.g.state.stats.totalChips=1e8;
  G.g.state.stats.placed=3; G.g.state.stats.bestFloor=2; G.g.state.stats.runs=3; G.g.state.stats.paddles=1;
  G.g.state.stats.drains=1; G.rebuild(); });
// ⚠️ This suite only ever console.logged. A tap target under 44px, or a
// button you cannot hit, printed a line and exited 0 — so it could not fail
// a run and never had. Same defect tower-pwa carried. Assertions now.
const ok = (l, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + l + (x ? '  ' + x : '')); if (!c) process.exitCode = 1; };
const MIN = 44;
for (const tab of ['shop','build','balls','trinkets','tasks','upgrades','tower','panels','stats','feel','app']) {
  await p.evaluate(t=>{ window.IP.ui.UI.tab=t; window.IP.ui.setMenu(true); }, tab);
  await p.waitForTimeout(250);
  const bad = await p.evaluate((MIN)=>{
    const out = [];
    for (const el of document.querySelectorAll('#menu button, #menu select, #tableUI button')) {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;               // hidden
      if (r.height < MIN || r.width < 24) {
        out.push((el.className||el.tagName) + ' "' + (el.textContent||'').trim().slice(0,14) + '" ' +
                 Math.round(r.width) + 'x' + Math.round(r.height));
      }
    }
    return out;
  }, MIN);
  // dedupe by class+size so one rule shows once
  const uniq = [...new Set(bad.map(s=>s.replace(/"[^"]*"/,'')))];
  ok(tab.padEnd(9) + ' tap targets >= ' + MIN + 'px', bad.length === 0, uniq.join(' | '));
}
// reachability: scroll each menu button into view and hit-test its centre
await p.evaluate(()=>{ window.IP.ui.UI.tab='stats'; window.IP.ui.renderMenu(); });
await p.waitForTimeout(200);
const unreachable = await p.evaluate(()=>{
  const out = [];
  for (const el of document.querySelectorAll('#menuBody button')) {
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width/2, r.y + r.height/2);
    if (!hit || (!el.contains(hit) && !hit.contains(el))) out.push((el.textContent||'').trim().slice(0,18));
  }
  return out;
});
ok('every menu button is reachable', unreachable.length === 0, unreachable.join(', '));
/* ---- the settings split ------------------------------------------------
 * STATS had grown into stats, medals, settings, the app section, save files,
 * layout sharing, device controls and a wipe button on one scroll. Asserting
 * "three tabs exist" would pass on a split that left everything in one of
 * them, so this checks WHERE each control ended up.
 * --------------------------------------------------------------------- */
const split = await p.evaluate(() => {
  const U = window.IP.ui;
  const read = (t) => {
    U.UI.tab = t; U.setMenu(true);
    U.closeModal(true);
    return document.querySelector('#menuBody').textContent;
  };
  const stats = read('stats'), feel = read('feel'), app = read('app');
  const has = (txt, re) => re.test(txt);
  return {
    statsHasMedals: has(stats, /MEDALS/),
    statsHasSettings: has(stats, /Screen shake|Sound effects/),
    statsHasApp: has(stats, /SAVE FILE|WIPE SAVE|CHECK FOR UPDATES/),
    feelHasToggles: ['Sound effects', 'Screen shake', 'Particles', 'Parallax depth', 'automatically', 'Flipper assist']
      .filter((k) => !has(feel, new RegExp(k))),
    feelHasApp: has(feel, /SAVE FILE|WIPE SAVE|MEDALS/),
    appHasFiles: has(app, /SAVE FILE/) && has(app, /SHARE A LAYOUT/) && has(app, /WIPE SAVE/),
    appHasToggles: has(app, /Screen shake|Parallax depth/),
    lengths: { stats: stats.length, feel: feel.length, app: app.length },
  };
});
ok('STATS keeps the stats and medals', split.statsHasMedals === true);
ok('STATS no longer holds the settings', split.statsHasSettings === false);
ok('STATS no longer holds the app section', split.statsHasApp === false);
ok('FEEL holds every game-feel toggle', split.feelHasToggles.length === 0,
  'missing: ' + split.feelHasToggles.join(', '));
ok('FEEL holds nothing that belongs elsewhere', split.feelHasApp === false);
ok('APP holds the files, sharing and wipe', split.appHasFiles === true);
ok('APP holds no feel toggles', split.appHasToggles === false);
ok('no tab is a dumping ground any more',
  Math.max(split.lengths.stats, split.lengths.feel, split.lengths.app) < 3000,
  JSON.stringify(split.lengths));

console.log(errs.length ? 'ERRORS '+[...new Set(errs)].join('\n') : 'no page errors');
await b.close();
