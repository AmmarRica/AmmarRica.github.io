#!/usr/bin/env node
/* =========================================================================
 * Build the single-file offline copy of Birdex.
 *
 * Inlines the stylesheet, every script and the icon into one .html file
 * that runs from a double-click — no server, no network, no install. The
 * app already keeps photos in IndexedDB and never uploads anything, so the
 * offline copy is the whole app rather than a cut-down version.
 *
 *     node birdex/build-offline.mjs
 *
 * Writes birdex/birdex-offline.html. Re-run after changing any source file;
 * `node tests/birdex-offline.mjs` checks the built file still works.
 * ====================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = f => fs.readFileSync(path.join(HERE, f), 'utf8');

/* A literal </script> inside inlined JS would close the tag early. */
const safe = js => js.replace(/<\/script/gi, '<\\/script');

const OUT = 'birdex-offline.html';
let html = read('index.html');

/* --- stylesheet ---------------------------------------------------- */
html = html.replace(
  /[ \t]*<link rel="stylesheet" href="css\/style\.css"[^>]*>\n?/,
  '  <style>\n' + read('css/style.css') + '  </style>\n'
);

/* --- icon: data URI, so the favicon survives with no sibling files --- */
const iconURI = 'data:image/svg+xml;base64,' +
  Buffer.from(read('icon.svg'), 'utf8').toString('base64');
html = html.replace(/href="icon\.svg"/g, 'href="' + iconURI + '"');

/* --- manifest and service worker: meaningless without an http origin - */
html = html.replace(/[ \t]*<link rel="manifest"[^>]*>\n?/, '');
html = html.replace(
  /[ \t]*\/\/ PWA:[\s\S]*?\n  \}\n/,
  '  // No service worker in the offline copy: this file is the offline copy.\n'
);

/* --- scripts -------------------------------------------------------- */
const scripts = [...html.matchAll(/[ \t]*<script src="([^"]+)"><\/script>\n?/g)];
if (!scripts.length) throw new Error('No external scripts found — did index.html change?');
for (const m of scripts) {
  html = html.replace(m[0], '<script>\n' + safe(read(m[1])) + '</script>\n');
}

/* --- mark the build, so the app knows it is the offline copy --------- */
const stamp = new Date().toISOString().slice(0, 10);
html = html.replace('<script>\n',
  '<script>window.BIRDEX_OFFLINE = true;</script>\n<script>\n');
html = html.replace('<head>',
  '<head>\n  <!-- Birdex offline copy, built ' + stamp + ' by birdex/build-offline.mjs.\n' +
  '       Everything is inlined: open this file directly, no server needed.\n' +
  '       Your sightings and photos are stored by the browser, on this device only. -->');

fs.writeFileSync(path.join(HERE, OUT), html);

const kb = Math.round(Buffer.byteLength(html) / 1024);

/* Anything still pointing at a sibling file means the copy is not portable.
 * Script and style bodies are stripped first: they are full of JS string
 * concatenation that looks like markup attributes but is not. */
const markup = html
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
const left = [...markup.matchAll(/(?:src|href)="(?!data:|https?:|#)([^"]+)"/g)].map(m => m[1]);

console.log('wrote birdex/' + OUT + ' — ' + kb + ' kB, ' + scripts.length + ' scripts inlined');
if (left.length) {
  console.error('ERROR: the copy still references sibling files: ' + left.join(', '));
  process.exit(1);
}
