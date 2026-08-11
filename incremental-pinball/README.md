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

## Shades of brown

The whole tower is brown: **six floor tints** cycled up the shaft, and **six
lighter tans** used for the wall plaque, the deck stripe and the minimap.

Brown is a narrow slice of the colour space — warm hue, R > G > B, and dark
enough that cream parts still read on top of it. There is no hue ladder to
walk, so both palettes were *searched for* rather than chosen, each against an
explicit objective:

| | Objective | Result |
|---|---|---|
| Tints | largest minimum distance between floors within three of each other, staying brown and dark | 45.5 RGB units, peak luminance 0.149 |
| Accents | largest minimum pairwise distance, staying brown and ≥4.5:1 on the ink plaque | 73.5 RGB units, 4.53:1 |

⚠️ The tints repeat every six floors, and that is the deliberate cost of the
constraint. Floors six apart are never on screen together, and spreading six
shades thinner to make forty unique ones would put *neighbours* closer than
the eye can separate — the opposite of the point. The test asserts what
matters: any two floors within three of each other differ by at least 40
units, every tint is warm with R > G > B, and none is bright enough to wash
out the parts. All three fail under sabotage.

Each deck carries a stripe in the accent of the floor it opens onto, so
crossing into a new level is legible from the table and not only from the
plaque on the wall.

## Forty floors

The tower runs to 40. The first 20 are hand-authored; above that `floorAt(k)`
generates named, tinted decks on demand, so raising the cap never produces a
floor with no name and no colour. Nothing reads `FLOORS[k]` directly any more.

Floor prices grow at **3.2× per floor** against income growing 1.95×. They
used to grow at 5.4×, which is ~2.8× harder per floor *relative to what that
floor earns* — compounded over a tall tower that puts the top out of reach by
astronomical margins, so the upper floors existed but could never be bought.
`tower-scoring.mjs` now asserts the ratio directly rather than trusting it.

## Repeats pay less

Borrowed from Tony Hawk: **every time one part scores in a run, it pays less
than the time before** — `0.87^(n-1)`, floored at 12%. The tenth hit on a
bumper is worth 29% of the first; the twentieth is at the floor.

It exists because the optimal play without it is to park the ball on the
single best part and let it rattle. The decay makes covering ground the
better line, and it resets every run so a fresh ball is a fresh table. The
floor stops a toured table from going completely dead mid-ball.

## The run-over screen

Unlock toasts fire during play, which is exactly when you are watching a ball
and not the top of the screen. So the run-over screen lists **everything the
run opened up** — parts, balls, trinkets, upgrades and menu tabs — with what
each one is.

Unlocks are recorded the moment they are *detected*, not when their toast
fires. Toasts drain one per 0.75s tick, so a run ending on a burst would
otherwise list only the handful that happened to be announced before the last
ball drained — 4 of 99, in the test that covers it.

## The white line

A white dashed line marks the highest point any ball has ever reached, drawn
across the table with a `BEST` tag. It is sampled every frame — not on floor
crossings — so it sits at the actual peak rather than wherever the ball
happened to be when it last entered a new floor.

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

## The table is fixed during a run

Nothing that changes the geometry — buying, placing, moving, rotating,
levelling, selling, buying a floor, or opening build mode — works while a ball
is in play. Building mid-ball is not a small convenience: a part can be
dropped in the ball's path, a floor bought under it, or the bumper it is about
to hit sold out from under it. Each of those is a way to score without
playing.

⚠️ The rule lives in `buildLocked()` in **game.js**, not in the UI. Greying out
a button still leaves the keyboard shortcuts, the demo AI and the console able
to build mid-ball; the test asserts the refusals through the model for exactly
that reason. The self-playing demo is the one exemption, or the shared harness
could not play at all.

**Auto-run and this rule would deadlock each other**: a run restarts 1.4 s
after the last one ends, so a player who must build between runs would never
get a window. Auto-run therefore *holds* — not cancels — while the menu is
open or build mode is on, and starts the moment you go back to the table.

Every tab that can change the table shows why its buttons are dead, with an
**END RUN** button on it. A disabled control with no explanation reads as a
bug.

## Taking things off again

Every part can come back off the table, and there are three ways to do it
depending on what you are actually trying to change:

- **One part** — select it in build mode and hit **💰 REMOVE**, or use the row
  button in the BUILD tab. Both show the refund on the button itself.
- **A lot of parts** — arm **🧨 REMOVE** in the build bar and tap them. Every
  part on the floor is ringed in red while it is armed, so the mode is visible
  on the table rather than only in the bar.
- **The whole floor** — **🧹 CLEAR FLOOR** in the BUILD tab, behind a confirm.

Refunds are 40% of what you paid, rising to 65% with the Fair Trade upgrade and
to the full price with one trinket. A part is priced off how many of its type
you still own, so a batch is refunded part by part as it comes off — pricing
the whole batch up front would pay out about 40% more than selling the same
parts one at a time.

Because a refund is worth less than what you paid, **every removal offers an
undo**. The bar names what went and what it paid, and undo puts it back exactly
as it was — level, earnings, position, panel binding — for the price of the
refund. It refuses if you have already spent that refund, and if the space has
since been built over; both cases say which. Undoing costs nothing net, so
sell → undo → sell cannot be farmed for coins.

Trinkets can also be removed, but that one is not undoable and says so.

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

## The mark

`icon.svg` is the single source: the PNGs are rendered from it, and the menu
header shows the same file rather than a stand-in emoji. A **lighthouse** of
brown levels, a ball and a flipper, designed at **32px first**, because that
is where an app icon actually lives.

What makes it read as a lighthouse rather than a striped block is the lantern
room — a glazed box under a dark cap, *wider* than the shaft it sits on, with
a gallery rail beneath. Without that the same silhouette is a barber's pole.
The beam is one wide wedge: two beams read as a bow tie once scaled down.

Two things were tried and dropped, both because they only worked large:

- **Openings cut into the deck bands**, echoing the real table. At icon size a
  band with a hole in it does not read as an opening, it reads as a broken
  stripe, and the tapering edge left stray slivers.
- **A dotted trajectory** from flipper to ball. Any dash pattern fine enough
  to look like a trail becomes speckle when scaled down.

The taper matters: a strong one reads as a traffic cone, none at all reads as
a door. The narrow crown is what settles it as a tower.

⚠️ The maskable icon is a *different render*, not the same file renamed.
Launchers crop to a circle and only the centre 80% is guaranteed, so the
artwork is scaled about its measured bounding-box centre (`getBBox()`, not an
eyeballed number) to fit the safe circle, over the same gradient full-bleed —
pasting the normal icon smaller onto a flat panel leaves a visible seam where
its sky meets the ground.

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

## Updates are required, eventually

The game checks for a new build **every time you open it** and every time it
comes back to the foreground — an installed PWA can sit open for days without
ever reloading, so a check tied only to page load would never fire on the
copy that most needs it.

Once a check that reached the server reports a newer version, a 30-day clock
starts. The menu bar counts down the whole time, turns red in the last week,
and at day 30 play stops behind a screen whose only ways out are UPDATE NOW
and EXPORT SAVE.

Two rules keep that from bricking a legitimate player, and both are the
interesting part of the design:

- **The clock only starts from a check that reached the server.** Being
  offline is not evidence that an update exists. An offline-capable game that
  locks you out *for being offline* is broken, not strict — so a failed check
  writes nothing at all.
- **A clock that has moved backwards resets rather than accumulating.** A
  device with a wrong date would otherwise lock a player out on day one with
  no way to argue.

A rollback (the server serving something older) is ignored too — versions are
compared numerically, so `1.10.0` is correctly newer than `1.9.0`, which
string comparison gets backwards.

The lock never traps progress: the save lives in this browser, not in the
build, and the lock screen still exports it to a file.

## Patch notes

`CHANGELOG` in `data.js` is the whole thing — **STATS → WHAT'S NEW** renders
it, and after an update lands the player is shown just the entries newer than
the build they were on. A fresh install is shown nothing, because it has
nothing to catch up on.

A line earns its place by changing something a player can do, see or decide.
Everything else — refactors, tests, internal plumbing — collapses into the one
`fixes` line per release, and a fixed bug is only named when it cost the
player something (data loss, a wrong payout). Otherwise it is "General fixes
and polish" and that is the honest summary.

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

## Depth

Four parallax layers give the shaft some space. Each one gets its own camera:
at depth `p` the layer scrolls at `p ×` the real camera, so `p = 0` would be
painted on the glass, `p = 1` moves with the world, and `p > 1` sweeps past in
front of it.

| Layer | `p` | What it is |
|---|---|---|
| `far` | 0.15 | A skyline of other towers, lit window by window |
| `mid` | 0.42 | Suit glyphs adrift in the gap |
| `struct` | 0.74 | The steelwork this tower is bolted to |
| `fore` | 1.34 | Beams passing in front of the glass |

Screen shake is scaled by `p` too — near things jolt further than far ones,
and that is most of what actually sells it.

Layer content is a pure hash of its lattice index, so a layer dresses a tower
of any height while storing nothing, and the same height looks the same on
every visit. It is deliberately *not* drawn from `IP.rng`: `draw()` has to be
idempotent, and a renderer that consumed a random stream would desync the sim
from its seed. Cost is about **0.11 ms/frame** at 2× DPR. **STATS → SETTINGS →
Parallax depth layers** turns the whole thing off; the idle bobbing (but not
the parallax, which is just the camera) also follows the Particles setting.

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
node tests/tower-parallax.mjs     # depth layers paint, and at their own rates
node tests/tower-remove.mjs       # refunds, undo, and the ways undo could pay
node tests/tower-update.mjs       # the 30-day deadline, and when NOT to lock
node tests/tower-scoring.mjs      # repeat decay, one flipper per floor, best line
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
