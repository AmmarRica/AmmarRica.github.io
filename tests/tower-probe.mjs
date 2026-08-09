#!/usr/bin/env node
/*
 * Deep probe for incremental-pinball (Tower of Chips).
 * Boots the page, runs the built-in demo, and reports how the tower
 * progresses — plus every console/page error along the way.
 *
 *   node tests/tower-probe.mjs [seconds]
 */
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE_URL || pathToFileURL(repoRoot).href;
const SECONDS = Number(process.argv[2] || 20);

const browser = await chromium.launch({ executablePath: process.env.PW_CHROME || undefined });
const ctx = await browser.newContext({ viewport: { width: 400, height: 860 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();

const errs = [];
page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type().toUpperCase() + ': ' + m.text()); });

await page.goto(`${BASE}/incremental-pinball/index.html`);
await page.waitForTimeout(700);

const hook = await page.evaluate(() => !!window.__incpinball);
console.log('hook present:', hook);
if (!hook) { console.log(errs.slice(0, 10).join('\n')); await browser.close(); process.exit(1); }

const before = await page.evaluate(() => window.__incpinball.state());
console.log('start:', JSON.stringify(before));

await page.evaluate(() => window.__incpinball.setDemo(true));

const samples = [];
for (let i = 0; i < SECONDS * 2; i++) {
  await page.waitForTimeout(500);
  samples.push(await page.evaluate(() => window.__incpinball.state()));
}
await page.evaluate(() => window.__incpinball.setDemo(false));

const last = samples[samples.length - 1];
const peakFloor = Math.max(...samples.map((s) => Number(String(s.mode).split('-')[1] || 0)));
console.log('end:   ', JSON.stringify(last));
console.log('samples:', samples.filter((_, i) => i % 6 === 0).map((s) => `${s.mode}/sc${s.score}/c${s.coins}/p${s.parts}`).join('  '));
console.log('peak ball floor:', peakFloor, ' best floor stat:', last.bestFloor);
console.log('chips grew:', last.score > before.score, ' parts grew:', last.parts > before.parts, ' floors:', last.floors);

await page.screenshot({ path: '/tmp/claude-0/-home-user-AmmarRica-github-io/43501a1b-6782-59a1-beb0-8b30e9215300/scratchpad/tower-play.png' });
await page.evaluate(() => window.IP.ui.setMenu(true));
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/claude-0/-home-user-AmmarRica-github-io/43501a1b-6782-59a1-beb0-8b30e9215300/scratchpad/tower-menu.png' });

if (errs.length) {
  console.log('\n--- errors (' + errs.length + ') ---');
  console.log([...new Set(errs)].slice(0, 12).join('\n'));
}
await browser.close();
process.exit(last.score > before.score && !errs.some((e) => e.startsWith('PAGEERROR')) ? 0 : 1);
