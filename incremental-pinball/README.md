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

## Testing

The game exposes the site-standard demo hook, so it runs under the shared
harness:

```sh
node tests/ai-tester.mjs         # all games
node tests/tower-probe.mjs 20    # this game only, with a progress trace
```

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
