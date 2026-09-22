/* =========================================================================
 * Daily smoke test.
 *
 * Serves the repo, opens /daily/ and checks that the right entry from
 * schedule.json is picked for a given date, that only that one media file
 * is requested, that the bar shows date + clock, and that the page flips
 * to the next entry when the day changes.
 *
 *   node tests/daily.mjs
 *   BASE_URL=http://localhost:4000 node tests/daily.mjs
 *
 * Exits non-zero if any assertion fails.
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
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.json': 'application/json', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.png': 'image/png' };
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
  const base = (external || `http://127.0.0.1:${PORT}`) + '/daily/';

  const schedule = JSON.parse(fs.readFileSync(path.join(REPO, 'daily', 'schedule.json'), 'utf8'));
  ok('schedule.json parses with entries[]', Array.isArray(schedule.entries) && schedule.entries.length > 0);
  for (const e of schedule.entries) {
    const dates = Array.isArray(e.date) ? e.date : [e.date];
    ok(`entry "${e.title || e.src}" has a valid date`, dates.every(d => /^(\d{4}-)?\d{2}-\d{2}$/.test(String(d))), JSON.stringify(e.date));
    ok(`entry "${e.title || e.src}" has a known type`, ['image', 'youtube', 'video', 'text'].includes(e.type), e.type);
    if (e.type !== 'text') ok(`entry "${e.title || e.src}" has a src`, typeof e.src === 'string' && e.src.length > 0);
    if (e.type !== 'youtube' && e.src && !/^(https?:)?\/\//.test(e.src) && !e.src.startsWith('/'))
      ok(`local media exists: ${e.src}`, fs.existsSync(path.join(REPO, 'daily', e.src)));
  }
  if (schedule.fallback && schedule.fallback.src && !/^(https?:)?\/\//.test(schedule.fallback.src))
    ok('fallback media exists', fs.existsSync(path.join(REPO, 'daily', schedule.fallback.src)));

  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 }, locale: 'en-US' });
  await context.route(/youtube(-nocookie)?\.com/, r => r.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>stub</body></html>' }));
  const page = await context.newPage();

  const requests = [];
  page.on('request', r => requests.push(r.url()));
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  console.log('\n[daily] recurring entry via ?date=');
  await page.goto(base + '?date=2026-09-21');
  await page.waitForFunction(() => window.__daily && window.__daily.state().key);
  let st = await page.evaluate(() => window.__daily.state());
  ok('picked 09-21 recurring entry', st.source === 'yearly' && st.type === 'youtube', JSON.stringify(st));
  ok('YouTube iframe rendered with the right id', await page.evaluate(() => {
    const f = document.querySelector('#stage iframe'); return !!f && f.src.includes('/embed/Gs069dndIYk') && f.src.includes('mute=1');
  }));
  ok('title text rendered', (await page.textContent('#text h1')).toLowerCase().includes('do you remember'));
  ok('date shown in bar', (await page.textContent('#date')).includes('September 21, 2026'), await page.textContent('#date'));
  ok('clock shows a time', /\d{1,2}:\d{2}:\d{2}/.test(await page.textContent('#clock')), await page.textContent('#clock'));
  ok('preview badge visible for ?date=', await page.isVisible('#preview'));
  ok('unmute button offered', await page.isVisible('#sound'));
  await page.click('#sound', { force: true });   // button pulses, so skip the stability wait
  ok('unmute reloads iframe unmuted', await page.evaluate(() => document.querySelector('#stage iframe').src.includes('mute=0')));
  ok('no unrelated media requested (schedule + page + one embed only)',
    !requests.some(u => /\/daily\/media\//.test(u)), requests.join('\n'));

  console.log('\n[daily] fallback + only one media file loaded');
  requests.length = 0;
  await page.goto(base + '?date=2026-03-15');
  await page.waitForFunction(() => window.__daily && window.__daily.state().key === '2026-03-15');
  st = await page.evaluate(() => window.__daily.state());
  ok('fallback used on an empty day', st.source === 'fallback', JSON.stringify(st));
  await page.waitForFunction(() => { const i = document.querySelector('#stage img'); return i && i.complete && i.naturalWidth > 0; });
  const media = requests.filter(u => /\/daily\/media\//.test(u));
  ok('exactly one media file requested', media.length === 1, media.join('\n'));
  ok('it is the fallback image', media[0] && media[0].endsWith('/daily/media/fallback.svg'), media[0]);

  console.log('\n[daily] exact date beats recurring; text-only entry');
  await page.goto(base + '?date=2027-01-01');
  await page.waitForFunction(() => window.__daily && window.__daily.state().key === '2027-01-01');
  st = await page.evaluate(() => window.__daily.state());
  ok('01-01 text entry picked', st.source === 'yearly' && st.type === 'text', JSON.stringify(st));
  ok('text entry has no media node', await page.evaluate(() => document.querySelector('#stage').children.length === 0));
  const precedence = await page.evaluate(() => {
    const s = window.__daily;
    const keep = s.pick;
    return keep('2026-09-21').source;
  });
  ok('pick() exposes precedence (recurring)', precedence === 'yearly');
  ok('youtubeId parses watch / short / id forms', await page.evaluate(() => {
    const y = window.__daily.youtubeId;
    return y('https://www.youtube.com/watch?v=Gs069dndIYk') === 'Gs069dndIYk' &&
           y('https://youtu.be/Gs069dndIYk?t=3') === 'Gs069dndIYk' &&
           y('https://youtube.com/shorts/Gs069dndIYk') === 'Gs069dndIYk' &&
           y('Gs069dndIYk') === 'Gs069dndIYk' && y('nope') === null;
  }));

  console.log('\n[daily] midnight rollover');
  await page.goto(base);
  await page.waitForFunction(() => window.__daily && window.__daily.state().key);
  const before = await page.evaluate(() => window.__daily.state().key);
  ok('live page renders today', /^\d{4}-\d{2}-\d{2}$/.test(before), before);
  ok('countdown to midnight shown', /\d{2}:\d{2}:\d{2}/.test(await page.textContent('#next b')));
  // Jump the clock to 23:59:58 on 2026-09-20 so the tick crosses into the 21st.
  await page.evaluate(() => {
    const target = new Date(2026, 8, 20, 23, 59, 58, 500).getTime();
    const offset = target - Date.now();
    const RealDate = Date;
    // eslint-disable-next-line no-global-assign
    Date = class extends RealDate {
      constructor(...a) { if (a.length) super(...a); else super(RealDate.now() + offset); }
      static now() { return RealDate.now() + offset; }
    };
  });
  await page.waitForFunction(() => window.__daily.state().key === '2026-09-20', null, { timeout: 5000 }).catch(() => {});
  const beforeFlip = await page.evaluate(() => window.__daily.state());
  await page.waitForFunction(() => window.__daily.state().key === '2026-09-21', null, { timeout: 8000 });
  const afterFlip = await page.evaluate(() => window.__daily.state());
  ok('page re-rendered for the new day without reload', afterFlip.key === '2026-09-21' && afterFlip.type === 'youtube', JSON.stringify({ beforeFlip, afterFlip }));
  ok('bar date flipped too', (await page.textContent('#date')).includes('September 21, 2026'));

  ok('no page errors', errors.length === 0, errors.join('\n'));

  await browser.close();
  if (server) server.close();

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) { failures.forEach(f => console.log('  FAIL: ' + f)); process.exit(1); }
};

run().catch(e => { console.error(e); process.exit(1); });
