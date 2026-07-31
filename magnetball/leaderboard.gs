/**
 * Magnetball global leaderboard — Google Apps Script Web App.
 *
 * Paste this into your Sheet's Extensions → Apps Script, then
 * Deploy → New deployment → Web app (Execute as: Me, Access: Anyone).
 * Copy the /exec URL into LB.endpoint in magnetball/index.html.
 *
 * Sheet tab must be named "Scores" with a header row:
 *   Timestamp | Name | RP | Country | Eyes | Colour
 * Columns are matched by header text, so order/extra columns are fine.
 *
 * Endpoints:
 *   GET  ?action=top&n=100                      → JSON array, sorted by RP desc
 *   GET  ?action=add&name=..&rp=..&country=..   → add/update (handy for testing)
 *   POST name=..&rp=..&country=..&eyes=..&color=..  → add/update one score
 */

var SHEET_NAME = 'Scores';
var HEADERS = ['Timestamp', 'Name', 'RP', 'Country', 'Eyes', 'Colour'];

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
  if (sh.getLastRow() === 0) sh.appendRow(HEADERS);
  return sh;
}

// Map header label (lower-cased) → column index (0-based).
function colMap_(sh) {
  var row = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0];
  var m = {};
  row.forEach(function (h, i) { m[String(h).trim().toLowerCase()] = i; });
  return m;
}
function pick_(m, names) {
  for (var i = 0; i < names.length; i++) if (m[names[i]] != null) return m[names[i]];
  return -1;
}

function readRows_(n) {
  var sh = sheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var m = colMap_(sh);
  var iN = pick_(m, ['name', 'player']), iR = pick_(m, ['rp', 'points', 'score']),
      iF = pick_(m, ['country', 'flag']), iE = pick_(m, ['eyes']), iC = pick_(m, ['colour', 'color']);
  var data = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  var out = [];
  data.forEach(function (r) {
    var name = iN >= 0 ? String(r[iN]).trim() : '';
    if (!name) return;
    out.push({
      name: name,
      rp: iR >= 0 ? Math.round(Number(r[iR]) || 0) : 0,
      country: iF >= 0 ? String(r[iF] || 'none') : 'none',
      eyes: iE >= 0 ? String(r[iE] || 'googly') : 'googly',
      color: iC >= 0 ? String(r[iC] || '') : '',
    });
  });
  out.sort(function (a, b) { return b.rp - a.rp; });
  return out.slice(0, n || 100);
}

// Upsert by name, keeping the highest RP for that player.
function addScore_(p) {
  var sh = sheet_();
  var name = String(p.name || '').trim().slice(0, 24);
  if (!name) return { ok: false, error: 'no name' };
  var rp = Math.round(Number(p.rp) || 0);
  var m = colMap_(sh);
  var iN = pick_(m, ['name', 'player']), iR = pick_(m, ['rp', 'points', 'score']),
      iF = pick_(m, ['country', 'flag']), iE = pick_(m, ['eyes']),
      iC = pick_(m, ['colour', 'color']), iT = pick_(m, ['timestamp', 'time', 'date']);
  var row = new Array(sh.getLastColumn()).fill('');
  if (iT >= 0) row[iT] = new Date();
  if (iN >= 0) row[iN] = name;
  if (iR >= 0) row[iR] = rp;
  if (iF >= 0) row[iF] = String(p.country || 'none');
  if (iE >= 0) row[iE] = String(p.eyes || 'googly');
  if (iC >= 0) row[iC] = String(p.color || '');

  // find an existing row for this name
  var last = sh.getLastRow(), foundRow = -1, foundRp = -Infinity;
  if (last >= 2 && iN >= 0) {
    var names = sh.getRange(2, iN + 1, last - 1, 1).getValues();
    var rps = iR >= 0 ? sh.getRange(2, iR + 1, last - 1, 1).getValues() : null;
    for (var i = 0; i < names.length; i++) {
      if (String(names[i][0]).trim().toLowerCase() === name.toLowerCase()) {
        foundRow = i + 2; foundRp = rps ? (Number(rps[i][0]) || 0) : -Infinity; break;
      }
    }
  }
  if (foundRow > 0) {
    if (rp > foundRp) sh.getRange(foundRow, 1, 1, row.length).setValues([row]); // only improve
    return { ok: true, updated: true };
  }
  sh.appendRow(row);
  return { ok: true, added: true };
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === 'add') return json_(addScore_(p));
  var n = Math.min(500, Math.max(1, parseInt(p.n, 10) || 100));
  return json_(readRows_(n));
}

function doPost(e) {
  var p = (e && e.parameter) || {};
  try {
    if (e && e.postData && e.postData.type === 'application/json') {
      p = JSON.parse(e.postData.contents) || p;
    }
  } catch (err) {}
  return json_(addScore_(p));
}
