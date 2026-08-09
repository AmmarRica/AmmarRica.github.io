#!/usr/bin/env node
/* Every themed surface measured against the text actually painted on it. */
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
const MIN = 4.5;                       // WCAG AA for normal text
const b = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
const ctx = await b.newContext({ viewport: { width: 400, height: 880 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push('ERR ' + e.message));
await p.goto(pathToFileURL('/home/user/AmmarRica.github.io').href + '/incremental-pinball/index.html');
await p.waitForTimeout(700);
const ok = (l, c, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + l + (x ? '  ' + x : '')); if (!c) process.exitCode = 1; };

await p.evaluate(() => {
  const G = window.IP.game, g = G.g;
  g.state.coins = 1e7; g.state.stats.totalChips = 1e9; g.state.stats.placed = 4;
  g.state.stats.bestFloor = 3; g.state.stats.runs = 3; g.state.stats.drains = 1; g.state.stats.paddles = 1;
  g.state.gems = 40; G.rebuild();
});

// Measured from COMPUTED styles, not from the palette constants — the point
// is what actually lands on screen after the cascade.
const worst = [];
for (const tab of ['shop', 'build', 'balls', 'trinkets', 'tasks', 'upgrades', 'tower', 'panels', 'stats']) {
  await p.evaluate((t) => { window.IP.ui.UI.tab = t; window.IP.ui.setMenu(true); }, tab);
  await p.waitForTimeout(180);
  const rows = await p.evaluate((MIN) => {
    const C = window.IP.util.contrast;
    const out = [];
    const solid = (el) => {
      let n = el;
      while (n && n !== document.documentElement) {
        const bg = getComputedStyle(n).backgroundColor;
        if (bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) return bg;
        n = n.parentElement;
      }
      return 'rgb(27,38,44)';
    };
    for (const el of document.querySelectorAll('#menuBody .cathead, #menuBody .pname, #menuBody .sk, #menuBody .sv, #menuBody .btn')) {
      const cs = getComputedStyle(el);
      if (!el.textContent.trim()) continue;
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const ratio = C(cs.color, solid(el));
      if (ratio < MIN) out.push({ cls: el.className || el.tagName, ratio: +ratio.toFixed(2), fg: cs.color, bg: solid(el) });
    }
    return out;
  }, MIN);
  if (rows.length) worst.push(tab + ': ' + [...new Set(rows.map(r => `${r.cls} ${r.ratio}:1 (${r.fg} on ${r.bg})`))].join(', '));
}
ok('all themed text meets ' + MIN + ':1 against its own background', worst.length === 0, worst.join(' | '));

/* The menu is not the only light surface. `.btn.ghost` is written for the dark
 * menu ground and has to be re-scoped for every cream panel that appears — the
 * undo bar was the next one to be missed, and shipped an invisible dismiss
 * button. Walk the in-table surfaces too, so the next one fails here instead. */
const tableRows = await p.evaluate((MIN) => {
  const G = window.IP.game, g = G.g, C = window.IP.util.contrast;
  window.IP.ui.setMenu(false);
  g.state.coins = 1e7;
  G.buyPart('bumper', 30, 60, 0, 0);
  G.buyPart('bumper', 55, 75, 0, 0);
  window.IP.ui.enterBuild(0);
  G.sellPart(g.state.parts[0].uid);
  window.IP.ui.__t.showUndo();
  const solid = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      if (bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) return bg;
      n = n.parentElement;
    }
    return 'rgb(27,38,44)';
  };
  const out = [];
  for (const el of document.querySelectorAll('#undoBar .btn, #undoBar b, #undoBar small, #buildBar .btn, #tableUI .btn')) {
    const cs = getComputedStyle(el);
    if (!el.textContent.trim()) continue;
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const ratio = C(cs.color, solid(el));
    if (ratio < MIN) out.push(`${el.className || el.tagName} ${ratio.toFixed(2)}:1 (${cs.color} on ${solid(el)})`);
  }
  return out;
}, MIN);
ok('in-table surfaces meet ' + MIN + ':1 too', tableRows.length === 0, [...new Set(tableRows)].join(' | '));

// Pin the helper from both ends so it cannot be a rubber stamp.
const sanity = await p.evaluate(() => {
  const C = window.IP.util.contrast;
  return { bw: +C('#000000', '#ffffff').toFixed(1), same: +C('#888888', '#888888').toFixed(1),
           rgbForm: +C('rgb(0,0,0)', '#ffffff').toFixed(1) };
});
ok('contrast(): black on white is 21:1', sanity.bw === 21, String(sanity.bw));
ok('contrast(): a colour on itself is 1:1', sanity.same === 1, String(sanity.same));
ok('contrast(): parses rgb() as well as hex', sanity.rgbForm === 21, String(sanity.rgbForm));

console.log(errs.length ? 'PAGE ERRORS:\n' + [...new Set(errs)].join('\n') : 'no page errors');
await b.close();
