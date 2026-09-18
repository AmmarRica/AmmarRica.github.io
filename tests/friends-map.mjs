/* =========================================================================
 * Friends Map smoke test.
 *
 * Drives the real page in a headless browser: onboarding, sample data,
 * adding a friend, share-link round trip, Google Maps link import, and
 * persistence across a reload. Map tiles are blocked so it runs offline.
 *
 *   node tests/friends-map.mjs
 *   BASE_URL=http://localhost:4000 node tests/friends-map.mjs
 * ====================================================================== */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const PORT = 4189;

let passed = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failures.push(name + (detail ? ' — ' + detail : '')); console.log('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
}

function serve(root, port) {
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
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
  const base = (external || `http://127.0.0.1:${PORT}`) + '/friends-map/';

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 400, height: 860 },
    permissions: ['geolocation'],
    geolocation: { latitude: 30.2672, longitude: -97.7431 },   // Austin
    locale: 'en-GB',
  });
  await context.route(/basemaps\.cartocdn\.com/, r => r.abort());   // no tiles needed
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('dialog', d => d.accept());

  console.log('1. First run');
  await page.goto(base);
  await page.waitForFunction(() => window.__friendsmap && window.L);
  ok('leaflet loaded', await page.evaluate(() => !!window.L));
  ok('welcome dialog opens on first run', await page.locator('#profile').evaluate(d => d.open));
  await page.fill('#p-name', 'Ammar');
  await page.fill('#p-city', 'Austin');
  await page.click('#p-geo');
  await page.waitForFunction(() => window.__friendsmap.state().me.center !== null);
  await page.click('#p-save');
  const me = await page.evaluate(() => window.__friendsmap.state().me);
  ok('name + city + centre saved', me.name === 'Ammar' && me.city === 'Austin' && Math.abs(me.center[0] - 30.2672) < 1e-3, JSON.stringify(me));
  ok('avatar shows initial', (await page.textContent('#me-btn')) === 'A');

  console.log('2. Sample data');
  ok('sheet opens after onboarding on an empty map', await page.locator('#sheet').evaluate(el => el.classList.contains('open')));
  await page.click('#empty-sample');
  await page.waitForFunction(() => window.__friendsmap.state().friends === 6);
  ok('6 sample friends loaded', true);
  ok('6 markers on the map', (await page.locator('.leaflet-marker-icon .pin').count()) === 6);
  ok('list shows 6 rows', (await page.locator('#list .friend').count()) === 6);
  ok('chips include categories in use', (await page.locator('#chips .chip').count()) >= 5);

  console.log('3. Search + filter');
  await page.fill('#q', 'noodle');
  ok('search narrows the list', (await page.locator('#list .friend').count()) === 1);
  ok('search narrows the markers', (await page.locator('.leaflet-marker-icon .pin').count()) === 1);
  await page.click('#clear-q');
  await page.click('#chips .chip:has-text("Favourites")');
  ok('favourites filter shows 2', (await page.locator('#list .friend').count()) === 2);
  await page.click('#chips .chip:has-text("All")');

  console.log('4. Detail card');
  await page.evaluate(() => document.getElementById('sheet').classList.add('open'));
  await page.click('#list .friend:has-text("Sara")');
  await page.waitForSelector('#detail.show');
  ok('detail shows the recommendation', (await page.textContent('#detail .why')).includes('Best fade'));
  ok('directions link points at google maps', (await page.getAttribute('#detail a.btn', 'href')).startsWith('https://www.google.com/maps/'));
  await page.click('#d-close');

  console.log('5. Add a friend by hand');
  await page.click('#add');
  await page.fill('#f-name', 'Nadia — tailor');
  await page.click('#f-cats button[data-k="home"]');
  await page.fill('#f-place', 'East side');
  await page.fill('#f-why', 'Hems jeans same day.');
  await page.fill('#f-tags', 'same day, cheap');
  await page.click('#f-pick');
  await page.waitForFunction(() => document.body.classList.contains('picking'));
  await page.click('#pick-ok');
  await page.waitForFunction(() => document.getElementById('editor').open);
  ok('pin picked from map centre', (await page.textContent('#f-loc-txt')) !== 'No pin yet');
  await page.click('#editor-save');
  await page.waitForFunction(() => window.__friendsmap.state().friends === 7);
  ok('friend added', true);
  const nadia = await page.evaluate(() => JSON.parse(localStorage.getItem('friendsmap.v1')).friends.find(f => f.name.startsWith('Nadia')));
  ok('friend persisted in localStorage with tags', nadia && nadia.tags.length === 2 && nadia.cat === 'home', JSON.stringify(nadia));

  console.log('6. Google Maps link import');
  const parsed = await page.evaluate(() => window.__friendsmap.parseMapsText([
    "Franklin Barbecue",
    "https://maps.app.goo.gl/saZj8tFDso6QFwr47?g_st=ac",
    "https://www.google.com/maps/place/Cuvee+Coffee+Bar/@30.2635,-97.7285,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d30.26398!4d-97.72631!16s%2Fg%2F1",
    "https://www.google.com/maps/search/?api=1&query=30.27,-97.75",
    "https://example.com/not-maps",
  ].join('\n')));
  ok('three maps links recognised, non-maps ignored', parsed.length === 3, JSON.stringify(parsed));
  ok('short link keeps the name from the share text', parsed[0].name === 'Franklin Barbecue' && parsed[0].lat === null && parsed[0].short);
  ok('full link gets name + exact pin from !3d/!4d', parsed[1].name === 'Cuvee Coffee Bar' && Math.abs(parsed[1].lat - 30.26398) < 1e-6 && Math.abs(parsed[1].lng + 97.72631) < 1e-6);
  ok('query=lat,lng link gets a pin', Math.abs(parsed[2].lat - 30.27) < 1e-6);

  await page.click('#paste-link');
  await page.fill('#i-text', 'Cuvee Coffee Bar\nhttps://www.google.com/maps/place/Cuvee+Coffee+Bar/@30.2635,-97.7285,17z/data=!3d30.26398!4d-97.72631');
  ok('importer previews the parse', (await page.textContent('#i-status')).includes('pin found'));
  await page.click('#i-go');
  await page.waitForFunction(() => document.getElementById('editor').open);
  ok('editor prefilled with name', (await page.inputValue('#f-name')) === 'Cuvee Coffee Bar');
  ok('editor guessed the coffee category', await page.locator('#f-cats button.on').evaluate(b => b.dataset.k === 'coffee'));
  ok('editor shows the maps link', !(await page.locator('#f-maps').evaluate(el => el.classList.contains('hidden'))));
  await page.fill('#f-why', 'Nitro cold brew, sit outside.');
  await page.click('#editor-save');
  await page.waitForFunction(() => window.__friendsmap.state().friends === 8);
  const cuvee = await page.evaluate(() => JSON.parse(localStorage.getItem('friendsmap.v1')).friends.find(f => f.name === 'Cuvee Coffee Bar'));
  ok('imported friend keeps the maps link and pin', cuvee && cuvee.maps.startsWith('https://www.google.com/maps/place/') && Math.abs(cuvee.lat - 30.26398) < 1e-6);
  await page.waitForSelector('#detail.show');
  ok('directions uses the original maps link', (await page.getAttribute('#detail a.btn', 'href')) === cuvee.maps);
  await page.click('#d-close');

  console.log('7. Share target URL');
  await page.goto(base + '?title=Franklin%20Barbecue&text=https%3A%2F%2Fmaps.app.goo.gl%2FsaZj8tFDso6QFwr47');
  await page.waitForFunction(() => window.__friendsmap);
  ok('share-target params open the importer', await page.locator('#importdlg').evaluate(d => d.open));
  ok('share-target params are stripped from the URL', !(await page.evaluate(() => location.search)));
  await page.click('#i-go');
  await page.waitForFunction(() => document.getElementById('editor').open);
  ok('short link import prefills the name', (await page.inputValue('#f-name')) === 'Franklin Barbecue');
  ok('short link import has no pin yet', (await page.textContent('#f-loc-txt')) === 'No pin yet');
  await page.click('#editor-cancel');

  console.log('8. Share link round trip');
  const url = await page.evaluate(() => window.__friendsmap.shareUrl());
  ok('share url carries the list in the hash', url.includes('#s=') && url.length > 200);
  const page2 = await context.newPage();
  await page2.evaluate(() => localStorage.clear()).catch(() => {});
  await page2.goto(url);
  await page2.waitForFunction(() => window.__friendsmap);
  await page2.evaluate(() => localStorage.clear());   // pretend to be a different phone
  await page2.reload();
  await page2.waitForFunction(() => window.__friendsmap && window.__friendsmap.state().shared > 0);
  const st = await page2.evaluate(() => window.__friendsmap.state());
  ok('recipient sees 8 shared friends and none of their own', st.shared === 8 && st.friends === 0, JSON.stringify(st));
  ok('banner names the sender', (await page2.textContent('#shared-text')).includes('Ammar'));
  ok('no welcome dialog for a recipient', !(await page2.locator('#profile').evaluate(d => d.open)));
  await page2.evaluate(() => document.getElementById('sheet').classList.add('open'));
  await page2.click('#list .friend:has-text("Cuvee")');
  await page2.waitForSelector('#detail.show');
  ok('recipient reads the sender\'s note', (await page2.textContent('#detail .why')).includes('Nitro'));
  await page2.click('#d-import');
  ok('single import saved', (await page2.evaluate(() => window.__friendsmap.state().friends)) === 1);
  await page2.click('#shared-save');
  await page2.waitForFunction(() => window.__friendsmap.state().shared === 0);
  const st2 = await page2.evaluate(() => window.__friendsmap.state());
  ok('save-all merges without duplicating', st2.friends === 8, JSON.stringify(st2));
  ok('hash cleared after exiting shared view', !(await page2.evaluate(() => location.hash)));
  await page2.close();

  console.log('9. Persistence');
  await page.reload();
  await page.waitForFunction(() => window.__friendsmap);
  ok('friends survive reload', (await page.evaluate(() => window.__friendsmap.state().friends)) === 8);
  ok('no welcome dialog on return visit', !(await page.locator('#profile').evaluate(d => d.open)));
  await page.click('#me-btn');
  await page.click('#p-clear');
  ok('clear all empties the map', (await page.evaluate(() => window.__friendsmap.state().friends)) === 0);

  ok('no page errors', errors.length === 0, errors.join(' | '));

  await browser.close();
  if (server) server.close();
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) { failures.forEach(f => console.log('FAIL: ' + f)); process.exit(1); }
};

run().catch(e => { console.error(e); process.exit(1); });
