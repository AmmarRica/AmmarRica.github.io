/* =========================================================================
 * Birdex smoke test.
 *
 * Drives the real app in a headless browser: geolocation -> region, dex
 * unlocking, photo storage, collections, history, and offline reload.
 *
 *   node tests/birdex.mjs
 *   BASE_URL=http://localhost:4000 node tests/birdex.mjs
 *
 * Exits non-zero on the first failed assertion.
 * ====================================================================== */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const PORT = 4188;

let passed = 0;
const failures = [];

function ok(name, cond, detail) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failures.push(name + (detail ? ' — ' + detail : '')); console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

function serve(root, port) {
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.svg': 'image/svg+xml' };
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(root, p);
    if (!file.startsWith(root)) return res.writeHead(403).end();
    fs.readFile(file, (err, buf) => {
      if (err) return res.writeHead(404).end('404');
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(buf);
    });
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server)));
}

const run = async () => {
  const external = process.env.BASE_URL;
  const server = external ? null : await serve(REPO, PORT);
  const base = (external || `http://127.0.0.1:${PORT}`) + '/birdex/';

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 420, height: 900 },
    permissions: ['geolocation'],
    geolocation: { latitude: 42.36, longitude: -71.06 },   // Boston -> Northeast
    locale: 'en-GB'
  });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('pageerror', e => consoleErrors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  console.log('\nBirdex smoke test\n' + '-'.repeat(40));

  /* ---- boot -------------------------------------------------------- */
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__birdex && window.__birdex.state().total > 0, null, { timeout: 15000 });

  const total = await page.evaluate(() => window.__birdex.state().total);
  ok('dex loads its species', total > 100, total + ' species');
  ok('dex grid renders', (await page.locator('.card').count()) > 50);
  ok('every entry has portrait art', (await page.locator('.card-art svg.art, .card-art img').count()) > 50);

  /* ---- geolocation -> region -> rarity ------------------------------ */
  await page.locator('button.tab', { hasText: 'Nearby' }).click();
  await page.locator('button', { hasText: 'Use my location' }).click();
  await page.waitForFunction(() => window.__birdex.state().region, null, { timeout: 15000 });

  const region = await page.evaluate(() => window.__birdex.state().region);
  ok('GPS resolves to a region', region === 'NE', 'got ' + region);
  ok('region name is shown', (await page.locator('.panel.loc h2').innerText()).includes('Northeast'));

  const rows = await page.locator('.rows .row').count();
  ok('nearby lists species for the region', rows > 40, rows + ' rows');

  const firstTier = await page.locator('.rows .row .tier').first().innerText();
  ok('commonest bird here is rated Common', firstTier.trim() === 'Common', firstTier);

  const tiers = await page.locator('.rows .row .tier').allInnerTexts();
  ok('rarity varies across the list', new Set(tiers).size >= 3, [...new Set(tiers)].join('/'));

  /* Odds must be sorted best-first — that is the whole promise of the view. */
  const pcts = await page.$$eval('.rows .row .row-tier em', els => els.map(e => parseFloat(e.textContent)));
  ok('list is ordered by likelihood', pcts.every((v, i) => i === 0 || pcts[i - 1] >= v));

  /* ---- log a sighting with a photo ---------------------------------- */
  const before = await page.evaluate(() => window.__birdex.state());
  await page.evaluate(() => window.__birdex.logSpecies('amerob'));
  await page.waitForFunction(() => window.__birdex.state().species > 0, null, { timeout: 10000 });
  const after = await page.evaluate(() => window.__birdex.state());

  ok('sighting is recorded', after.sightings === before.sightings + 1);
  ok('species unlocks in the dex', after.species === before.species + 1);
  ok('photo is stored', after.photos === before.photos + 1);
  ok('dex points are awarded', after.score > before.score, before.score + ' -> ' + after.score);

  await page.waitForSelector('.newbanner', { timeout: 5000 });
  ok('new-entry banner shows on a lifer', await page.locator('.newbanner').isVisible());

  /* Detail view: the reading material and the local rarity answer.
   * Headings are uppercased in CSS, so innerText comes back shouting —
   * compare case-insensitively rather than asserting the rendered case. */
  const detail = (await page.locator('.pane.detail').innerText()).toLowerCase();
  ok('detail shows the species name', detail.includes('american robin'));
  ok('detail explains where they live', detail.includes('where they live'));
  ok('detail explains the range', detail.includes('range'));
  ok('detail answers how rare it is here', detail.includes('how rare is it here?'));
  ok('detail names the region', detail.includes('northeast'));
  ok('unlocked entry shows your own photo', await page.locator('.hero.has-photo img').isVisible());

  /* ---- second species, then collections ----------------------------- */
  await page.evaluate(() => window.__birdex.logSpecies('bkcchi'));
  await page.waitForFunction(() => window.__birdex.state().species === 2, null, { timeout: 10000 });

  await page.locator('button.tab', { hasText: 'Album' }).click();
  page.once('dialog', d => d.accept('Best of Boston'));
  await page.locator('button', { hasText: 'New collection' }).first().click();
  await page.waitForSelector('.pane .photogrid, .pane .empty', { timeout: 8000 });
  ok('collection is created', (await page.locator('h1').innerText()).includes('Best of Boston'));

  await page.locator('button', { hasText: 'Add photos' }).click();
  await page.waitForSelector('.sheet .ph', { timeout: 8000 });
  const sheetPhotos = await page.locator('.sheet .ph').count();
  ok('photo picker offers your photos', sheetPhotos === 2, sheetPhotos + ' offered');

  await page.locator('.sheet .ph').first().click();
  await page.locator('.sheet button', { hasText: 'Done' }).click();
  await page.waitForSelector('.photogrid .ph.pick', { timeout: 8000 });
  ok('selected photo joins the collection', (await page.locator('.photogrid .ph.pick').count()) === 1);

  /* ---- history ------------------------------------------------------ */
  await page.locator('button.tab', { hasText: 'History' }).click();
  await page.waitForSelector('.tiles', { timeout: 8000 });
  const history = await page.locator('.pane').innerText();
  ok('history shows a species count', history.includes('species'));
  ok('history lists past sightings', (await page.locator('.day .row').count()) === 2);
  ok('badges are awarded', (await page.locator('.badge.on').count()) >= 1);

  /* ---- persistence across a reload ---------------------------------- */
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__birdex && window.__birdex.state().total > 0, null, { timeout: 15000 });
  const reloaded = await page.evaluate(() => window.__birdex.state());
  ok('sightings survive a reload', reloaded.sightings === 2, JSON.stringify(reloaded));
  ok('photos survive a reload', reloaded.photos === 2);
  ok('region survives a reload', reloaded.region === 'NE');

  /* ---- off-range and out-of-season reasoning ------------------------ */
  const checks = await page.evaluate(() => {
    const B = window.Birdex;
    return {
      snowyWinter: B.rarity(B.get('snoowl'), 'MDW', 1).tier.name,
      snowySummer: B.rarity(B.get('snoowl'), 'MDW', 7).tier.name,
      snowyFlorida: B.rarity(B.get('snoowl'), 'FL', 1).offRange,
      robinCommon: B.rarity(B.get('amerob'), 'NE', 6).tier.name,
      condor: B.rarity(B.get('calcon'), 'CAL', 5).tier.name
    };
  });
  ok('a winter visitor is findable in winter', checks.snowyWinter === 'Scarce', checks.snowyWinter);
  ok('the same bird is a legend out of season', checks.snowySummer === 'Legendary', checks.snowySummer);
  ok('off-range species are flagged', checks.snowyFlorida === true);
  ok('an abundant bird rates Common', checks.robinCommon === 'Common');
  ok('a near-extinct bird rates Legendary', checks.condor === 'Legendary');

  /* ---- demo mode (the repo's shared game-tester convention) ---------- */
  await page.evaluate(() => window.__birdex.setDemo(true));
  await page.waitForFunction(() => window.__birdex.state().progress >= 6, null, { timeout: 20000 });
  await page.evaluate(() => window.__birdex.setDemo(false));
  const demo = await page.evaluate(() => window.__birdex.state());
  ok('demo mode advances progress', demo.progress >= 6, 'progress ' + demo.progress);

  ok('no runtime errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

  await browser.close();
  if (server) server.close();

  console.log('-'.repeat(40));
  console.log(failures.length ? `FAILED ${failures.length}, passed ${passed}` : `All ${passed} checks passed.`);
  if (failures.length) { failures.forEach(f => console.log('  - ' + f)); process.exit(1); }
};

run().catch(err => { console.error(err); process.exit(1); });
