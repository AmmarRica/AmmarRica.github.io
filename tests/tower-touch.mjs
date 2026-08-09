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
const MIN = 44;
for (const tab of ['shop','build','balls','trinkets','tasks','upgrades','tower','panels','stats']) {
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
  console.log(tab.padEnd(9), bad.length ? uniq.join(' | ') : 'all >= 44px');
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
console.log('unreachable buttons:', unreachable.length ? unreachable.join(', ') : 'none');
console.log(errs.length ? 'ERRORS '+[...new Set(errs)].join('\n') : 'no page errors');
await b.close();
