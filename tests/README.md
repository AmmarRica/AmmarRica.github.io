# AI tester

A tiny automated player that smoke-tests the site's interactive games.

Every game exposes a standard demo hook on the page:

```js
window.__<game> = {
  setDemo(bool),   // turn auto-play on/off
  startDemo(),
  stopDemo(),
  state(),         // -> { score | progress, mode?, ... }
}
```

`ai-tester.mjs` loads each game, turns its demo on, lets the built-in AI play
for a few seconds, and asserts the score/progress advances — recording every
distinct **mode** the demo passes through (e.g. nonogram board sizes).

## Games covered

| Game | Hook | Demo behaviour | Metric |
|------|------|----------------|--------|
| pinball | `__pinball` | launches + flips to keep the ball alive | `score` |
| incremental-pinball | `__incpinball` | plunges, flips, and spends its coins building the tower | `score` (lifetime chips) |
| football-cards | `__gridiron` | plays BATTLE mode, picking the winning stat | `score` |
| crab-breed-swiper | `__crab` | auto-swipes the deck | `score` (likes) |
| dog-swiper | `__dog` | auto-swipes the deck | `progress` |
| nonogram | `__nonogram` | auto-solves, cycling through board sizes | `progress` |

## Other suites

`birdex.mjs` is a full smoke test for the birding dex rather than a demo
player: it drives the real app in a headless browser through geolocation,
dex unlocking, photo storage, collections, history and a reload, and checks
the seasonal / off-range rarity model. Birdex also exposes the standard
`window.__birdex` demo hook, so `ai-tester.mjs` conventions apply to it too.

```sh
node tests/birdex.mjs
```

`birdex-offline.mjs` covers the downloadable single-file build: it opens
`birdex/birdex-offline.html` over `file://` with the network blocked, and
restarts the browser to check saved sightings survive.

```sh
node birdex/build-offline.mjs && node tests/birdex-offline.mjs
```

## Run

```sh
npm i -D playwright        # or: npx playwright install chromium
node tests/ai-tester.mjs

# against a locally served site instead of file://
BASE_URL=http://localhost:4000 node tests/ai-tester.mjs
```

Exit code is non-zero if any game fails to auto-play and score.

You can also drive any game's demo by hand from the browser console, e.g.
`window.__nonogram.setDemo(true)`. In pinball there's a **Watch demo** button
on the start screen (and `?demo=1`).
