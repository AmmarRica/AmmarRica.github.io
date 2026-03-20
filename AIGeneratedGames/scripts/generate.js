#!/usr/bin/env node
/**
 * generate.js – scaffold a new day entry
 *
 * Usage:
 *   node scripts/generate.js                        # today's date, auto-sequence, default title
 *   node scripts/generate.js "Snake Clone"          # today's date, auto-sequence, given title
 *   node scripts/generate.js "Snake Clone" 20260313 # specific date
 *
 * Output filename: YYYYMMDD-xx-gamename.html
 *   YYYYMMDD – calendar date
 *   xx       – sequence number within that day (increments when multiple games share a date)
 *   gamename – URL-safe slug derived from the title
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function zeroPad(n) {
  return String(n).padStart(2, '0');
}

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = zeroPad(d.getMonth() + 1);
  const day = zeroPad(d.getDate());
  return `${y}${m}${day}`;
}

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function nextSeqForDate(dateStr) {
  const pattern = new RegExp(`^${dateStr}-([0-9]{2})-.+\\.html$`);
  const seqs = fs.readdirSync(ROOT)
    .map(f => { const m = pattern.exec(f); return m ? parseInt(m[1], 10) : NaN; })
    .filter(n => !isNaN(n));
  if (seqs.length === 0) return 1;
  return Math.max(...seqs) + 1;
}

function gameTemplate(dateStr, seq, title) {
  const num = zeroPad(seq);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} – Game a Day</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: system-ui, sans-serif;
      background: #0f0f1a;
      color: #e0e0ff;
      display: flex;
      flex-direction: column;
      align-items: center;
      min-height: 100vh;
      padding: 2rem;
    }

    nav {
      width: 100%;
      max-width: 800px;
      margin-bottom: 2rem;
    }

    nav a {
      color: #a78bfa;
      text-decoration: none;
      font-size: 0.95rem;
    }

    nav a:hover { text-decoration: underline; }

    h1 {
      font-size: 2rem;
      color: #a78bfa;
      margin-bottom: 0.5rem;
    }

    p.subtitle {
      color: #9ca3af;
      margin-bottom: 2rem;
    }

    canvas {
      border: 2px solid #3b3b5c;
      border-radius: 8px;
      background: #1e1e2e;
    }
  </style>
</head>
<body>
  <nav><a href="index.html">&larr; Back to gallery</a></nav>
  <h1>${title}</h1>
  <p class="subtitle">${dateStr} #${num} – work in progress</p>
  <canvas id="game" width="480" height="320"></canvas>

  <script>
    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#a78bfa';
    ctx.font = 'bold 24px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('${title} – work in progress', canvas.width / 2, canvas.height / 2);
  </script>
</body>
</html>
`;
}

function galleryCard(fileName, dateStr, seq, title) {
  const num = zeroPad(seq);
  return `    <a class="card" href="${fileName}">
      <div class="day-number">${num}</div>
      <div class="day-label">${dateStr}</div>
      <div class="day-title">${title}</div>
    </a>`;
}

function addCardToGallery(fileName, dateStr, seq, title) {
  const indexPath = path.join(ROOT, 'index.html');
  if (!fs.existsSync(indexPath)) return;

  let html = fs.readFileSync(indexPath, 'utf8');
  const marker = '</main>';
  const card = galleryCard(fileName, dateStr, seq, title);

  if (html.includes(marker)) {
    html = html.replace(marker, `${card}\n  ${marker}`);
    fs.writeFileSync(indexPath, html, 'utf8');
    console.log('  ✓ Added card to index.html');
  }
}

// ── main ──────────────────────────────────────────────────────────────────────

const [, , argTitle, argDate] = process.argv;

const dateStr = argDate || todayStr();
if (!/^[0-9]{8}$/.test(dateStr)) {
  console.error('Invalid date. Expected YYYYMMDD format.');
  process.exit(1);
}

const seq = nextSeqForDate(dateStr);
const title = argTitle || `Game ${zeroPad(seq)}`;
const slug = slugify(title);
const fileName = `${dateStr}-${zeroPad(seq)}-${slug}.html`;
const filePath = path.join(ROOT, fileName);

if (fs.existsSync(filePath)) {
  console.error(`${filePath} already exists.`);
  process.exit(1);
}

fs.writeFileSync(filePath, gameTemplate(dateStr, seq, title), 'utf8');

console.log(`✓ Created ${fileName}`);
addCardToGallery(fileName, dateStr, seq, title);
