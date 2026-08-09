import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
const ROOT = '/home/user/AmmarRica.github.io';
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/manifest+json', '.svg':'image/svg+xml', '.png':'image/png' };
let bumpVersion = false;                       // flip to simulate a deploy
const srv = createServer((req, res) => {
  let f = join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
  if (!existsSync(f)) { res.writeHead(404); return res.end('nope'); }
  let body = readFileSync(f);
  if (bumpVersion && f.endsWith('index.html')) {
    body = Buffer.from(String(body).replace(/name="app-version" content="[^"]+"/, 'name="app-version" content="9.9.9"'));
  }
  res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(body);
});
await new Promise(r => srv.listen(8099, r));
const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
const ctx = await b.newContext({ viewport: { width: 400, height: 880 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror', e=>errs.push('ERR '+e.message));
const SHOT='/tmp/claude-0/-home-user-AmmarRica-github-io/43501a1b-6782-59a1-beb0-8b30e9215300/scratchpad/';
const ok = (label, cond, extra='') => console.log((cond ? 'PASS ' : 'FAIL ') + label + (extra ? '  ' + extra : ''));

await p.goto('http://localhost:8099/incremental-pinball/index.html');
await p.waitForTimeout(1500);
ok('service worker registers', 1 === await p.evaluate(()=>navigator.serviceWorker.getRegistrations().then(r=>r.length)));
const man = await p.evaluate(async ()=>{ const j = await (await fetch('manifest.json')).json();
  return { png: j.icons.filter(i=>i.type==='image/png').length, maskable: j.icons.some(i=>i.purpose==='maskable'), display: j.display }; });
ok('manifest is installable-shaped', man.png >= 2 && man.maskable && man.display === 'standalone', JSON.stringify(man));
for (const f of ['icon-192.png','icon-512.png','icon-maskable-512.png']) {
  const r = await p.evaluate(async (f)=>(await fetch(f)).status, f);
  ok('icon ' + f, r === 200);
}
await p.click('.macts .btn.primary');

// --- install button only exists while the prompt is live -----------------
ok('no install card before the event', 0 === await p.evaluate(()=>{
  window.IP.ui.UI.tab='stats'; window.IP.game.g.state.stats.runs=2; window.IP.ui.renderMenu();
  return document.querySelectorAll('.card.installcard').length; }));
ok('banner hidden before the event', false === await p.evaluate(()=>document.getElementById('installBar').classList.contains('on')));
await p.evaluate(()=>{
  const e = new Event('beforeinstallprompt');
  e.prompt = () => { window.__promptCalled = true; };
  e.userChoice = Promise.resolve({ outcome: 'accepted' });
  window.dispatchEvent(e);
});
await p.waitForTimeout(300);
ok('banner appears on the event', true === await p.evaluate(()=>document.getElementById('installBar').classList.contains('on')));
await p.evaluate(()=>{ window.IP.ui.UI.tab='stats'; window.IP.ui.renderMenu(); });
ok('install card appears', 'INSTALL NOW' === await p.evaluate(()=>{ const c=document.querySelector('.card.installcard'); return c && c.querySelector('.btn').textContent; }));
await p.screenshot({ path: SHOT+'install-bar.png' });
await p.evaluate(()=>document.querySelector('.card.installcard .btn').click());
await p.waitForTimeout(400);
ok('prompt() fired', true === await p.evaluate(()=>!!window.__promptCalled));
ok('banner hides once consumed', false === await p.evaluate(()=>document.getElementById('installBar').classList.contains('on')));
await p.evaluate(()=>{ window.IP.ui.UI.tab='stats'; window.IP.ui.renderMenu(); });
ok('card gone once consumed', 0 === await p.evaluate(()=>document.querySelectorAll('.card.installcard').length));

// --- sabotage check: a dead always-on button would pass the above --------
ok('sabotage: offerable() actually gates', false === await p.evaluate(()=>window.IP.ui.__t.Install.offerable()));
ok('sabotage: iOS path would offer', true === await p.evaluate(()=>{
  const I = window.IP.ui.__t.Install, real = I.isIOS; I.isIOS = () => true;
  const r = I.offerable(); I.isIOS = real; return r; }));

// --- update check --------------------------------------------------------
ok('no update when versions match', null === await p.evaluate(()=>window.IP.ui.__t.Update.check(true)));
bumpVersion = true;
const v = await p.evaluate(()=>window.IP.ui.__t.Update.check(true));
ok('update detected after deploy', v === '9.9.9', 'got ' + v);
await p.waitForTimeout(300);
ok('update bar shows', true === await p.evaluate(()=>document.getElementById('updateBar').classList.contains('on')));
await p.screenshot({ path: SHOT+'update-bar.png' });
await p.evaluate(()=>{ const t=window.IP.ui.__t.Update; t.declined = t.found; });
await p.evaluate(()=>window.IP.ui.__t.refreshInstallUI());
ok('declining hides the bar', false === await p.evaluate(()=>document.getElementById('updateBar').classList.contains('on')));
ok('manual check still reports', '9.9.9' === await p.evaluate(()=>window.IP.ui.__t.Update.check(true)));

console.log(errs.length ? 'ERRORS:\n' + [...new Set(errs)].join('\n') : 'no page errors');
await b.close(); srv.close();
