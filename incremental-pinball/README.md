# Tower of Chips — incremental pinball

Pinball played *upward*. The table is a tower of floors, and the chips you
score on floor `k` are multiplied by `1.95^k` — so height is score. You start
with two flippers, an empty table and no coins, and you spend everything you earn
on more table: bouncers, jets, lifts, paddles, and eventually more floors to
put them on.

Live at [`/incremental-pinball/`](https://ammarrica.github.io/incremental-pinball/).

## Starting from nothing

There are no free parts. A new save is a bare playfield, two flippers and zero
coins. The only things on the table that pay anything are **the flippers
themselves** — every solid contact scores, scaled by how hard you hit the ball
— plus a token amount for the plunge and for each upward pass through a floor
opening. The built-in slingshot faces above the flippers are geometry only.

That first stretch is deliberately lean: a minute or so of honest flipping buys
your first Pop Bumper (25 coins). It is meant to feel like scraping together
seed money, because everything after it compounds.

Flipper income never scales with floor height, so it fades to noise on its own
once the tower is doing the work — it is a bootstrap, not a strategy.

A one-line prompt at the bottom of the table always names the next worthwhile
step, and tapping it jumps to the right menu tab. It disappears once you have
outgrown it.

## It opens up gradually

Thirty parts, fifteen balls, twenty-four trinkets and nine menu tabs is a wall
of choice for someone who has just launched their first ball, so almost none of
it is visible at the start. A fresh save has **one menu tab and one part**.

Everything gates on lifetime chips, which only ever goes up, so the game
reveals itself at the pace you are actually earning:

| | Appears at |
|---|---|
| Parts | a fixed ladder — Pop Bumper at 0, Jet Pad at 250, Slingshot at 700, … Ball Splitter at 200M |
| Balls, trinkets, upgrades | when lifetime chips pass a multiple of the item's own price |
| BUILD / TASKS tabs | first and second part placed |
| UPGRADES · TOWER · BALLS · TRINKETS | 4K chips · first floor climbed · 20K · 90K |
| PANELS | your first paddle |

Each list ends with a single **LOCKED** card showing what the next reveal costs
and how close you are — enough to promise more without becoming a catalogue.
Newly revealed things get a **NEW** ribbon and put a dot on their tab, and both
clear only once you have actually opened that tab and looked.

## The loop

1. **Flip.** Launch with the plunger, keep the ball alive, hit things.
2. **Score.** Every hit pays `CHIPS`, and most hits also raise `MULT`. Score is
   chips × mult, and mult only holds while the combo window is alive.
3. **Earn.** Chips convert to coins continuously. Chip Mints and Batteries keep
   earning while the tab is closed.
4. **Build.** Spend coins on parts, drop them anywhere on an unlocked floor,
   drag them around whenever you like.
5. **Climb.** Buy the next floor. Repeat with a bigger multiplier.
6. **Reforge.** Melt the tower down for gems, which permanently multiply
   everything and buy perks that survive every future reset.

## Milestones, and why you buy ten of the same thing

Part cost grows exponentially — `base × growth^owned`, with growth between 1.09
and 1.42 depending on the part — while a single part's output is flat. Left
alone that makes the tenth bumper strictly worse value than the first, and the
game stalls.

The fix is the standard idle-game one: **owning a round number of one part type
doubles the output of every copy of it.** Milestones sit at 5, 10, 25, 50 and
100, so a shop card reading "×2 now · ×4 at 10 owned" is telling you the real
decision — spread wide for coverage, or go deep on one type for the multiplier.
Each milestone briefly out-runs the cost curve, which is what gives progression
its sawtooth instead of a slow grind to a wall.

The BUILD tab shows lifetime chips earned per individual part, so "which of
these is actually paying" is a question you can answer rather than guess.

## Pop bumpers wear out

Nothing on the table comes with a bumper on it — every pop bumper is one you
bought and placed. Each has a limited number of pops, shown as a counter above
it: gold when healthy, orange when low, red when spent. A spent bumper still
deflects the ball but pays nothing and kicks nothing, and it goes visibly dark.

Pops come back on their own, one every few seconds (a ring around the bumper
shows the next one arriving), and every bumper refills completely at the start
of each ball. So the pressure is on *concentration*: hammering one bumper burns
it out, while a table that spreads its hits across several never notices. The
**Bumper Coils** upgrade and levelling a bumper both raise its capacity.

## Two screens

The page is the table, and the menu is a drawer over it. Hit **▼ PLAY** to
collapse the menu and watch the tower; hit **☰ MENU** to bring it back. On a
desktop-width window the drawer docks beside the table instead of covering it,
so you can shop while the ball is still in play — the simulation never pauses.

## Controls

| Input | Action |
|---|---|
| `A` / `D` (rebindable) | Panels 1 and 2 — the main flippers |
| `W` `S` `Q` `E` | Panels 3–6 — whatever paddles you assign to them |
| Tap left / right of the table | Panels 1 and 2 |
| `SPACE` (hold) or **PULL & LAUNCH** | Charge and fire the plunger |
| `N` / `←` `→` | Nudge the table — limited per ball, and it tilts if you lean on it |
| `B` | Build mode |
| `TAB` / `ESC` | Open and close the menu |
| Gamepad | Shoulders flip, `A` plunges, D-pad nudges, Start opens the menu |

Every panel's key is rebindable in **PANELS**, and every paddle you build can be
assigned to any of the six panels — that is how you end up hand-flipping four
different floors at once.

## Files

```
index.html      page shell
css/style.css   the whole look
js/util.js      maths, formatting, storage, tiny hyperscript
js/data.js      all content: parts, balls, upgrades, trinkets, perks, tasks
js/physics.js   circle vs segment/circle/arc, force fields, flippers
js/table.js     builds world geometry from the save; placement rules
js/render.js    canvas renderer
js/game.js      state, run loop, scoring pipeline, economy, save/load
js/ui.js        HUD, menu drawer, build mode, input
js/demo.js      the self-playing demo + `window.__incpinball` test hook
```

Content lives in `data.js` and nothing else needs to know about it: a part is a
`build()` that pushes colliders and an `onHit(A, inst, ball)` that talks to the
game API, so adding one is a single object literal.

## Installing it

The game is a PWA. On Chrome/Edge/Android a green **Install** banner appears
at the top of the menu once the browser fires `beforeinstallprompt`, with a
matching button under **STATS → APP**. On iOS, where there is no prompt API,
the same button opens Add-to-Home-Screen instructions instead.

⚠️ The button only exists while an install is genuinely on offer — it is
hidden in standalone, after `appinstalled`, and in browsers that will never
offer one. `beforeinstallprompt` cannot be summoned; it arrives once, as an
event, so an always-on install button is a dead button.

Updates are detected by fetching `index.html` with `cache: 'reload'` and
reading `<meta name="app-version">` out of it — **not** via
`registration.update()`, which fires `updatefound` for almost no real deploys
and would report "up to date" through every release. The service worker is
network-first for HTML and cache-first for everything else, classified by URL
extension rather than `request.mode` (the update check is a `fetch()`, not a
navigation, so mode-based classification would pin it to the precache
forever). The update prompt only ever appears in the menu, never over a live
ball, and declining silences the automatic check only.

Bump `<meta name="app-version">` in `index.html` on every deploy. That tag is
the single source of the version — `IP.VERSION` reads it out of the DOM at
startup rather than carrying its own copy. It used to be a second literal in
`js/util.js`, which meant any drift between the two made the update check
compare a version against itself and report an update forever.

## Save files

**STATS → SAVE FILE** exports the whole profile as `.json` and imports it back.
The file carries a magic field and a format version; import validates both,
then validates the shape of the state before touching anything, drops rows it
does not recognise, clamps numbers back into range, and rebuilds every part
through the real `IP.table.newInstance` constructor rather than trusting the
object in the file.

⚠️ Anything cached on a part at runtime is prefixed with `_` and stripped by
`cleanState()` before serialising. `inst._cols` holds colliders that point back
at the part, so the state graph is circular; when that went in unstripped,
`JSON.stringify` threw inside `saveJSON`'s `try`, and the game stopped saving
at all — with no symptom, for three passes, until `tests/tower-files.mjs`
round-tripped a save.

## Determinism

Nothing in the simulation calls `Math.random`. `IP.rng` holds four independent
mulberry32 streams — `sim`, `fx`, `audio`, `ui` — seeded together from the run
seed by `IP.reseed(seed)`, so a run replays identically from its seed and a
cosmetic draw can never shift a physics outcome. `G.hashState()` folds the
clock, score, mult, combo, coins, ball states, parts and flipper angles into an
FNV-1a hash for comparison.

The split matters in both directions: particles and screen shake read `fx`, so
turning effects down does not change the game, and a proc that reads `sim` is
unaffected by how many frames have been drawn.

## Device controls

Under **STATS → DEVICE**, each row appears only where it has a job to do:

- **Fullscreen** — `requestFullscreen()` can reject, and on iOS Safari it is
  simply absent, so the row is gated on support and the label is set from
  `Full.active()` after the promise settles rather than from the intent.
- **Tilt to nudge** — `DeviceOrientationEvent.requestPermission()` exists only
  on iOS and *must* be called from inside a user gesture, so it is requested on
  the tap, never at load. Neutral drifts, so the reading is measured against a
  slow-moving baseline and rotated by `screen.orientation.angle`.
- **Gamepad** — listed only once a pad has actually reported a button press;
  `navigator.getGamepads()` returns ghost entries otherwise.

`prefers-reduced-motion` is read once through `matchMedia` and cuts screen
shake and particle counts.

## Timing

Fixed timestep at 120 Hz with an accumulator; the renderer interpolates
between the last two states with `g.alpha`. Everything that advances over
time — particle life, part glow, field heat, camera easing, screen shake —
lives in `update()`, and draw functions only draw. `tests/tower-timing.mjs`
asserts that drawing twice with no step between produces an identical image.

Balls and flippers are interpolated for render; particles are not, since they
are independent short-lived bodies rather than something anchored to a moving
one.

## Testing

The game exposes the site-standard demo hook, so it runs under the shared
harness:

```sh
node tests/ai-tester.mjs          # all games
node tests/tower-probe.mjs 20     # this game only, with a progress trace
node tests/tower-timing.mjs       # fixed step, draw idempotency, interpolation
node tests/tower-touch.mjs        # 44px tap targets, every tab
node tests/tower-pwa.mjs          # manifest, icons, install gating, updates
node tests/tower-determinism.mjs  # seeded replay and stream separation
node tests/tower-files.mjs        # save round-trip and import validation
node tests/tower-contrast.mjs     # WCAG 4.5:1 on every themed surface
```

`tests/TRAPS.md` lists the measurement mistakes already made here — several of
these suites passed convincingly while proving nothing before they were fixed.
Read it before adding a test.

`window.__incpinball` also works from the browser console:
`setDemo(true)` turns on the self-playing AI (which buys and places parts as it
goes), `state()` returns a progress snapshot, and `give(n)` adds coins.

## How you actually climb

Each deck has exactly one opening, and the openings zig-zag in 25-unit steps
(`25 → 50 → 75 → 50 → …`) rather than flipping wall to wall — one well-placed
bumper can cover 25 units, which is what makes chaining floors possible at all.

A ball arriving on a floor has almost no energy left, so it will roll back down
the way it came unless something catches it. **Jet Pads are the answer**: they
are force fields, not solid bodies, so they are the one part allowed to hang
directly over an opening. A jet above the hole blows arriving balls straight
up through the next one. Everything else — lifts, pistons, trampolines,
paddles, portals, cannons — is a different answer to the same question.

## Notes on the physics

Decks are the one piece of geometry doing double duty: the top slopes gently
into the floor opening so a ball that runs out of energy rolls to the hole and
drops rather than parking forever, and two funnel rails hang underneath fanning
out to the walls so a ball rising anywhere on the floor below gets nudged toward
the opening. There is still a ball-search relay — three escalating shoves, then
the drain, plus a dry-spell rule that ends any ball which stops scoring —
because a player can always build a cradle the geometry did not
anticipate.
