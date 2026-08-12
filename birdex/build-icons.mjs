#!/usr/bin/env node
/* =========================================================================
 * Render the app icons to PNG.
 *
 * The SVGs are the source of truth, but PNG is not optional: iOS ignores
 * SVG for apple-touch-icon and falls back to a screenshot of the page, and
 * Android and Windows render home-screen icons better from raster. This
 * rasterises the same artwork at the sizes those platforms want.
 *
 *     node birdex/build-icons.mjs
 *
 * Needs playwright (the repo's test dependency); the browser is only used
 * as an SVG renderer.
 * ====================================================================== */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const JOBS = [
  { svg: 'icon.svg', out: 'icon-192.png', size: 192 },
  { svg: 'icon.svg', out: 'icon-512.png', size: 512 },
  { svg: 'icon-maskable.svg', out: 'icon-maskable-512.png', size: 512 }
];

const browser = await chromium.launch();
for (const job of JOBS) {
  const svg = fs.readFileSync(path.join(HERE, job.svg), 'utf8');
  const page = await browser.newPage({
    viewport: { width: job.size, height: job.size },
    deviceScaleFactor: 1
  });
  /* The SVG is inlined rather than loaded from a file:// URL so it cannot
   * pick up any surrounding page styling. */
  await page.setContent(
    '<style>html,body{margin:0;padding:0;background:transparent}' +
    'svg{display:block;width:' + job.size + 'px;height:' + job.size + 'px}</style>' + svg,
    { waitUntil: 'load' }
  );
  await page.screenshot({ path: path.join(HERE, job.out), omitBackground: true });
  await page.close();
  const kb = (fs.statSync(path.join(HERE, job.out)).size / 1024).toFixed(1);
  console.log('wrote birdex/' + job.out + ' — ' + job.size + 'x' + job.size + ', ' + kb + ' kB');
}
await browser.close();
