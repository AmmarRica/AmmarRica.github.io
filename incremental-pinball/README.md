# Tower of Chips — incremental pinball

Pinball played *upward*. The table is a tower of floors, and the chips you
score on floor `k` are multiplied by `1.95^k` — so height is score. You start
with two flippers and a handful of bumpers, and you spend everything you earn
on more table: bouncers, jets, lifts, paddles, and eventually more floors to
put them on.

Live at [`/incremental-pinball/`](https://ammarrica.github.io/incremental-pinball/).

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
the drain — because a player can always build a cradle the geometry did not
anticipate.
