#!/usr/bin/env node
/*
 * Simple AI tester for the site's games.
 *
 * Each game exposes a standard demo hook on `window.__<game>`:
 *     { setDemo(bool), startDemo(), stopDemo(), state() -> { score|progress, mode?, ... } }
 *
 * This harness loads each game, turns on its built-in demo (auto-play) mode,
 * lets the AI play for a few seconds, and asserts that the score/progress
 * advances — also recording every distinct "mode" the demo passes through.
 *
 * Run:
 *     npm i -D playwright   # or: npx playwright install chromium
 *     node tests/ai-tester.mjs
 *     BASE_URL=http://localhost:4000 node tests/ai-tester.mjs   # against a served site
 *
 * Exit code is non-zero if any game fails to auto-play and score.
 */
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE_URL || pathToFileURL(repoRoot).href;

// game dir · window hook · metric key in state() that should grow · play time (ms)
const GAMES = [
  { name: 'pinball',           hook: '__pinball',   metric: 'score',    ms: 7000 },
  { name: 'incremental-pinball', hook: '__incpinball', metric: 'score',  ms: 9000 },
  { name: 'football-cards',    hook: '__gridiron',  metric: 'score',    ms: 7000 },
  { name: 'crab-breed-swiper', hook: '__crab',      metric: 'score',    ms: 6000 },
  { name: 'dog-swiper',        hook: '__dog',       metric: 'progress', ms: 6000 },
  { name: 'nonogram',          hook: '__nonogram',  metric: 'progress', ms: 8000 },
];

const browser = await chromium.launch();
const rows = [];

for (const g of GAMES) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 820 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));

  let hookPresent = false, before = null, peak = null;
  const modes = new Set();
  try {
    await page.goto(`${BASE}/${g.name}/index.html`);
    await page.waitForTimeout(400);

    hookPresent = await page.evaluate(h => !!(window[h] && (window[h].setDemo || window[h].startDemo)), g.hook);
    if (hookPresent) {
      before = await page.evaluate(h => (window[h].state ? window[h].state() : null), g.hook);
      await page.evaluate(h => (window[h].setDemo ? window[h].setDemo(true) : window[h].startDemo()), g.hook);

      // Sample repeatedly: track the PEAK metric (robust to games that finish
      // and restart mid-window) and collect every distinct mode observed.
      const t0 = Date.now();
      while (Date.now() - t0 < g.ms) {
        await page.waitForTimeout(400);
        const s = await page.evaluate(h => (window[h].state ? window[h].state() : null), g.hook);
        if (s) {
          if (s.mode != null) modes.add(String(s.mode));
          if (s[g.metric] != null && (peak == null || s[g.metric] > peak)) peak = s[g.metric];
        }
      }
      await page.evaluate(h => (window[h].setDemo ? window[h].setDemo(false) : window[h].stopDemo()), g.hook);
    }
  } catch (e) {
    errs.push('run: ' + e.message);
  }

  const from = before && before[g.metric] != null ? before[g.metric] : 0;
  const to = peak != null ? peak : 0;
  rows.push({
    game: g.name,
    demo: hookPresent ? 'yes' : 'NO',
    metric: g.metric, from, to,
    pass: hookPresent && to > from,
    modes: modes.size ? [...modes].join(',') : '-',
    // Only surface genuine page errors (ignore external image/CDN load failures).
    errors: errs.filter(e => !/load resource|ERR_/.test(e)),
  });
  await ctx.close();
}

console.log('\n================= AI TESTER REPORT =================\n');
for (const r of rows) {
  console.log(
    `${(r.pass ? 'PASS' : 'FAIL').padEnd(5)} ${r.game.padEnd(18)} demo:${r.demo.padEnd(3)} ` +
    `${r.metric}:${r.from}→${r.to}  modes:[${r.modes}]`
  );
  if (r.errors.length) console.log(`      errors: ${r.errors.slice(0, 2).join(' | ')}`);
}
const passes = rows.filter(r => r.pass).length;
console.log(`\n${passes}/${rows.length} games auto-played and scored.\n`);

await browser.close();
process.exit(passes === rows.length ? 0 : 1);
