/* =========================================================================
 * Birdex offline-copy test.
 *
 * Opens birdex/birdex-offline.html over file://, exactly as someone who
 * downloaded it would, with the network cut off. Checks that the file is
 * genuinely self-contained, that storage works from disk, and that data
 * survives closing and reopening the browser.
 *
 *     node birdex/build-offline.mjs && node tests/birdex-offline.mjs
 * ====================================================================== */
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.resolve(HERE, '../birdex/birdex-offline.html');

let passed = 0;
const failures = [];
const ok = (name, cond, detail) => {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failures.push(name + (detail ? ' — ' + detail : '')); console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
};

const run = async () => {
  console.log('\nBirdex offline copy\n' + '-'.repeat(40));

  if (!fs.existsSync(FILE)) {
    console.log('  ✗ birdex/birdex-offline.html is missing — run: node birdex/build-offline.mjs');
    process.exit(1);
  }

  /* ---- it must be one file, with nothing left to fetch --------------- */
  const html = fs.readFileSync(FILE, 'utf8');
  const markup = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
  const refs = [...markup.matchAll(/(?:src|href)="(?!data:|https?:|#)([^"]+)"/g)].map(m => m[1]);
  ok('no references to sibling files', refs.length === 0, refs.join(', '));
  ok('stylesheet is inlined', /<style>/.test(html) && !/rel="stylesheet"/.test(html));
  ok('scripts are inlined', !/<script src=/.test(html));
  ok('marked as the offline build', /window\.BIRDEX_OFFLINE\s*=\s*true/.test(html));
  ok('no service worker registration', !/serviceWorker\.register/.test(html));
  ok('file is a sensible size', html.length > 150e3 && html.length < 1.5e6, Math.round(html.length / 1024) + ' kB');

  /* A committed build artifact rots the moment someone edits a source and
   * forgets to re-run the build, so check every source is present verbatim. */
  const APP = path.resolve(HERE, '../birdex');
  const shell = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
  const sources = ['css/style.css', ...[...shell.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1])];
  const stale = sources.filter(f =>
    !html.includes(fs.readFileSync(path.join(APP, f), 'utf8').replace(/<\/script/gi, '<\\/script')));
  ok('offline copy is up to date with its sources', stale.length === 0,
    stale.length ? 'stale: ' + stale.join(', ') + ' — run: node birdex/build-offline.mjs' : '');

  /* Copy somewhere unrelated: a portable file must not depend on its folder. */
  const away = fs.mkdtempSync(path.join(os.tmpdir(), 'birdex-'));
  const copy = path.join(away, 'birdex-offline.html');
  fs.copyFileSync(FILE, copy);

  /* ---- run it from disk, offline, in a real profile ------------------ */
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'birdex-profile-'));
  let ctx = await chromium.launchPersistentContext(profile, {
    viewport: { width: 420, height: 900 },
    permissions: ['geolocation'],
    geolocation: { latitude: 42.36, longitude: -71.06 }
  });
  /* Nothing may be loaded from the network — prove it by refusing it all. */
  await ctx.route('http://**', r => r.abort());
  await ctx.route('https://**', r => r.abort());

  let page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('requestfailed', r => errors.push('blocked request: ' + r.url()));

  await page.goto('file://' + copy, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__birdex && window.__birdex.state().total > 0, null, { timeout: 20000 });

  ok('app boots from a double-clicked file', true);
  ok('all species loaded', (await page.evaluate(() => window.__birdex.state().total)) > 100);
  ok('dex renders', (await page.locator('.card').count()) > 50);
  ok('stylesheet applied', await page.evaluate(() =>
    getComputedStyle(document.querySelector('.tabs')).position === 'fixed'));

  /* Storage has to work from disk, or the app is a toy. */
  await page.evaluate(() => window.__birdex.setPosition(42.36, -71.06, 20));
  await page.evaluate(() => window.__birdex.logSpecies('amerob'));
  await page.waitForFunction(() => window.__birdex.state().species === 1, null, { timeout: 15000 });
  const logged = await page.evaluate(() => window.__birdex.state());
  ok('a sighting saves from file://', logged.sightings === 1);
  ok('a photo saves from file://', logged.photos === 1);

  /* Settings should tell the truth about which copy this is. */
  await page.evaluate(() => location.hash = '#/settings');
  await page.waitForTimeout(400);
  const settings = (await page.locator('.pane').innerText()).toLowerCase();
  ok('settings identify it as the offline copy', settings.includes('running the offline copy'));
  ok('settings offer no download of itself', !settings.includes('download birdex'));

  ok('nothing was fetched from the network', errors.length === 0, errors.slice(0, 3).join(' | '));

  /* ---- close the browser completely, reopen, expect the dex intact --- */
  await ctx.close();
  ctx = await chromium.launchPersistentContext(profile, { viewport: { width: 420, height: 900 } });
  page = await ctx.newPage();
  await page.goto('file://' + copy, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__birdex && window.__birdex.state().total > 0, null, { timeout: 20000 });
  const after = await page.evaluate(() => window.__birdex.state());
  ok('sightings survive quitting the browser', after.sightings === 1, JSON.stringify(after));
  ok('photos survive quitting the browser', after.photos === 1);
  ok('dex entry stays unlocked', after.species === 1);

  await ctx.close();
  fs.rmSync(away, { recursive: true, force: true });
  fs.rmSync(profile, { recursive: true, force: true });

  console.log('-'.repeat(40));
  console.log(failures.length ? `FAILED ${failures.length}, passed ${passed}` : `All ${passed} checks passed.`);
  if (failures.length) { failures.forEach(f => console.log('  - ' + f)); process.exit(1); }
};

run().catch(err => { console.error(err); process.exit(1); });
