# Birdex

A birding app built like a pokédex. Photograph a bird, log the sighting, and
the entry unlocks — with your own photo as its portrait. It runs entirely in
the browser: no account, no server, no upload.

Live at [/birdex/](https://ammarrica.github.io/birdex/).

## What it does

**Dex** — 413 species, weighted heavily towards North America. Undiscovered ones show a locked silhouette and a number;
once you log one, the card fills in with your photograph. Search by name,
family or Latin name; filter by what you have, what you are missing, and what is
findable where you are standing right now.

**Log a sighting** — take or pick photos, choose the species from a list
*ranked by what is actually likely at your location this month*, and save. The
photo, GPS fix, time and notes stay on the device. A first-ever sighting is a
lifer: it pops a banner and pays out dex points scaled to how hard the bird is.

**Nearby** — your coordinates resolve to a birding region, and the app lists
every species recorded there, best odds first, with a rarity tier and an
approximate hit rate per outing. Filters for "still need", "in season" and
"rare here" turn it into a target list.

**Album** — collections are hand-picked sets of your photos: a best-of, a trip,
a patch. Any photo can be promoted to be a species' dex portrait.

**History** — species / sightings / photos / points, a rank, a twelve-month
activity chart, twelve badges, and a day-by-day timeline of everything you have
logged.

## Getting it offline

There are two ways, for two different situations.

**Install it as an app** (what you want on a phone). Settings → *Install as an
app*, or the banner on the dex. It gets its own icon and its own window, and
after the install every one of the 413 entries, the rarity model and the camera
flow work with no signal at all — which is the point, since the places worth
birding rarely have any.

- **Chrome, Edge, Android**: an Install button appears in Settings, or use the
  browser's install icon in the address bar.
- **iPhone/iPad**: Safari only — Share → *Add to Home Screen*. Chrome and
  Firefox on iOS cannot install web apps. Installing on iOS also protects your
  data: Safari clears storage for sites you have not opened in a while, and
  leaves installed apps alone.

The service worker precaches the whole app shell on first visit, so a reload
with the network cut loads all 413 species from disk. That is checked by the
test suite rather than assumed.

**Download the single file** (what you want on a desktop, or to keep a copy).
Settings → Offline copy → *Download Birdex*, or
grab [`birdex-offline.html`](birdex-offline.html) from this folder. It is one
HTML file with the stylesheet, every script and the icon inlined. Save it
anywhere and open it — no server, no install, no network. All 413 entries, the
rarity model and the camera flow work exactly as they do online, and your
sightings persist across quitting the browser.

Chrome, Edge and Firefox allow local files to use browser storage. Safari does
not, so if you want to open it in Safari, serve the folder instead:

```sh
python3 -m http.server 8000    # then open http://localhost:8000/birdex/
```

`localhost` also counts as a secure origin, which is what GPS needs. A file
opened directly gets no GPS in some browsers — set your region by hand on the
Nearby tab and every rarity figure works the same.

Two things worth knowing about the downloaded copy: browsers keep storage for
local files separate from storage for websites, so its dex is its own (export a
JSON backup if you want to carry sightings across); and all local files share
one storage origin, so moving or renaming the file keeps your dex intact.

Rebuild it after changing any source:

```sh
node birdex/build-offline.mjs
```

## How the rarity model works

Rarity is not a single number attached to a species — it is a function of
*species × region × month*, which is the only version of the question that has a
useful answer.

- **19 regions** covering North America and Europe, each with a bounding box and
  a centre. A GPS fix inside a box wins; ties break on the nearest centre;
  outside every box, the nearest region within 1200 km is used and flagged as
  approximate. Beyond that the app says it has no data rather than guessing.
- **Abundance 0–5 per region**, the scale field guides have always used, from
  *vagrant* to *abundant*. Ranges are authored compactly against region groups
  (`{ NAE: 4, FL: 5 }` — "common in the east, swarming in Florida"), with narrow
  keys overriding broad ones.
- **Season** per species, overridable per region: a bird can be a summer
  breeder in the boreal and a winter mob in the Southeast.
- Abundance and season combine into an approximate share of outings, which maps
  onto six tiers from **Common** to **Legendary**. Out of season the odds fall
  through the floor rather than to zero — a wintering owl in July is a genuine
  find, not an impossibility, and the tier reflects that.

Coverage is deepest in North America, where every region carries 160-310
species — enough that most of what you meet on an ordinary outing is in the
dex. The European regions carry widespread residents and visitors rather than a
complete list.

## Dex art

Shipping 413 bird photographs is not an option in a static app, so every entry
has a generated portrait: each species carries a body plan (`shape`) and a
four-colour palette, and `js/art.js` assembles a stylised bird from parts —
body, wing, neck, head, bill, tail, legs. There are 48 body plans, from
`hummingbird` to `spoonbill`. An optional fifth colour paints the wing for
birds whose wing patch is the field mark.

Locked entries render the same geometry in one flat tone: the silhouette tells
you it is a duck without telling you which duck.

## Files

```
index.html               app shell
css/style.css            paper-warm light theme, deep forest dark
js/core.js               regions, seasons, abundance, rarity, registry
js/species-*.js          the 413 dex entries
js/art.js                parametric portrait generator
js/store.js              IndexedDB: sightings, photos, collections, settings
js/photos.js             import pipeline — re-encode, thumbnail
js/views.js              rendering, one pass from state
js/app.js                state, routing, geolocation, actions
sw.js, manifest.json     offline + installable
icon*.png                generated: home-screen icons (iOS ignores SVG)
build-icons.mjs          rasterises the SVGs to PNG
build-offline.mjs        inlines all of the above into one file
birdex-offline.html      generated: the downloadable copy (committed so the
                         site can serve it; regenerate, don't hand-edit)
```

## Storage

Photos are Blobs in IndexedDB. Every import is re-encoded to a ~1600 px JPEG
plus a 400 px thumbnail and the original file is discarded, so a few hundred
birds fit comfortably inside a normal browser quota. Settings → Backup exports
sightings, notes and collection lists as JSON; photo files are deliberately not
included, since they never leave the device.

## Tests

```sh
npm i -D playwright
node tests/birdex.mjs                                  # the hosted app
node birdex/build-offline.mjs && node tests/birdex-offline.mjs   # the downloadable copy
```

`birdex.mjs` drives the real app in a headless browser: geolocation resolving
to a region, dex unlocking, photo storage, collections, history, persistence
across a reload, the seasonal/off-range rarity reasoning, and the install
requirements — manifest, PNG icons, a PNG apple-touch-icon, an active service
worker, and a full reload with the network switched off.

`birdex-offline.mjs` opens the built file over `file://` from an unrelated
directory with all network requests blocked, then quits the browser and
reopens it — so "works offline from a double-click, and keeps your dex" is
checked rather than assumed. It also fails if the committed build has drifted
from its sources.

There is also the site-wide demo hook, `window.__birdex`, matching the
convention the other apps here use:

```js
window.__birdex.setDemo(true)      // auto-log sightings
window.__birdex.state()            // { progress, score, species, region, ... }
window.__birdex.setPosition(lat, lng)
window.__birdex.logSpecies('amerob')
```
