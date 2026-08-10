# Measurement traps already hit in this repo

Read this before writing a new test. Every entry is a mistake that was
actually made here and produced a *passing* test that proved nothing, or a
failing one that was measuring the wrong thing.

## Canvas / rendering

- **A clamped value hides a rate bug.** `_glow` decays toward a floor of 0.
  Measuring the drop over 500 ms showed `Δ = 1.0` against an expected `1.68`
  — the assertion was measuring the clamp, not the rate. Sample over a window
  short enough that the value never reaches its limit, and assert on the
  remainder too (`left > 0`).
- **"The canvas changed" is not "the thing rendered."** Something else
  repaints on the way out. To prove draw is idempotent, freeze the sim
  (`g.paused = true`), draw twice, and compare `toDataURL()` — otherwise a
  step slips in between and the difference is legitimate.
- `getImageData` outside the canvas returns zeros, which reads convincingly
  as "that area is black". Sample in screen space and clamp.
- **"The canvas changed when I turned the feature on" is the weakest possible
  assertion about a multi-part effect.** Four parallax layers, and that check
  passes while three of them render nothing at all. The renderer now counts
  what each layer painted into `view.drawn`, so "painted nothing" is
  distinguishable from "painted behind something else".
- **Screen y grows downward; world y grows upward.** The parallax rate test
  first reported every layer moving a *negative* distance and failed four
  assertions on a renderer that was completely correct. If a geometry test
  fails by exactly a sign, suspect the harness before the code.
- **Anything a draw function generates must be a pure function of the frame.**
  Layer content is hashed from its lattice index rather than drawn from
  `IP.rng`, because a renderer that consumes a random stream breaks draw
  idempotency *and* desyncs the sim from its seed — two suites away from the
  file you edited. The parallax test asserts zero rng draws during 21 frames.

## DOM / UI

- **`slice(0, 4)` on a failure list hides failures.** The tap-target audit
  truncated its report, so `.btn.sm` violations were invisible behind four
  `.btn.chip` ones. Report every distinct offender.
- **A background re-render clears transient UI before you can assert on it.**
  NEW badges were marked seen inside `renderMenu()`, and an unlock toast
  arriving a moment later re-rendered the list. The test read zero badges and
  the bug looked like the badges were never drawn. Marking now happens on tab
  *exit*; tests must not call `renderMenu()` a second time before asserting.
- **`setMenu(true)` already renders.** Calling `renderMenu()` straight after
  it is a second render, with all the consequences above.
- **An element being in the viewport is not the same as being reachable.**
  Scroll it into view and hit-test its centre with `elementFromPoint`.

## Determinism

- **A scenario that never reaches the code under test passes everything —
  including its own sabotage checks.** The first determinism test used a
  Steel ball, which has neither `luck` nor `splitChance`, so every random
  call site short-circuited before drawing. "No `Math.random()` during 4000
  steps" passed trivially, and so did both sabotage runs. The fix was to make
  usage observable: each RNG stream carries a `draws` counter, and the test
  now asserts `simDraws > 50`, `fxDraws > 50` and `maxBalls > 1` before it
  asserts anything about hashes.
- **One setup function, shared by every scenario.** When the stream-separation
  scenario kept its own copy of the setup, the copy drifted to a non-proccing
  ball and quietly stopped catching a sim proc that read the cosmetic stream.
- **Pin the clock, not just the seed.** `g.time` is part of the initial state,
  and the page had been running rAF for a different length of time before each
  scenario. Runs diverged for a reason that reads exactly like a sim bug. Set
  `g.time = 0` (and `lastSave`, and per-ball `lastHit`) before stepping.
- **Stub `Math.random` to throw, not to return a constant.** A constant lets a
  non-deterministic call site sail through the test while staying
  non-deterministic in the real game.

## Saving

- **`JSON.stringify` throwing inside a `try` is a silent data-loss bug.**
  `inst._cols` points back at the part that owns it, so the state graph was
  circular, `stringify` threw, and `saveJSON` swallowed it. Saving had been
  failing on every profile with a part placed, for three passes, with no
  symptom until a test round-tripped the save. Underscore-prefixed keys are
  now stripped by `cleanState()`, and the round-trip is asserted rather than
  assumed.

## Colour

- **Measure contrast against what is actually behind the element, not against
  the theme it was designed for.** `.btn.ghost` was written for the dark menu
  ground; inside a cream card it rendered cream-on-cream at **1:1** — text
  that is not merely low-contrast but invisible. Read both colours from
  `getComputedStyle`, walking up for the first non-transparent background.
- **A contrast audit only sees text.** A default `.btn` (cream2) on a `.prow`
  (cream) passes every text check and still has no visible button edge. Text
  contrast is necessary, not sufficient — look at the rendered screenshot too.

## Environment

- **`file://` is not the environment half this code runs in.** `Update.check()`
  returns at its first line off HTTP — there are no deploys on a local file —
  so the entire required-update suite passed while never executing the rule it
  tested, *including its sabotage check*. The suite now serves over real HTTP
  and asserts the check actually reached the network (`attempts === 5`,
  `lastCheck` moved) before asserting anything about what it decided.
  This is the second time a suite has passed its own sabotage; both times the
  cause was a scenario that never reached the code.

## Rendered vs. computed

- **A helper returning the right string is not the UI showing it.** The
  update countdown was correct in `updateBanner()` and frozen in the DOM,
  because `refreshInstallUI()` toggled a class on a bar built once at boot.
  Every assertion about the countdown passed. A bar still reading "Update
  available" on the day the game locks is worse than no warning at all, so
  the test now reads `#updateBar.textContent` at three points on the clock.

## Reversible actions

- **Testing only the happy path of an undo passes on two different exploits.**
  A part refunds less than it cost, so an undo that does not charge the refund
  back is a coin pump (sell → undo → sell), and one that ignores what you spent
  in between hands out free parts. Most of `tower-remove.mjs` is assertions
  that undo is *refused*, plus a 25-cycle loop asserting the balance is
  unchanged — a single sell/undo would not reveal either.
- **The interesting question about an undo buffer is where it lives.** Holding
  the removed part on `g.state` puts a whole part — collider cache and all —
  into the save, which is exactly the shape that made `JSON.stringify` throw
  before. There is an assertion that the save file does not contain it.

## Colour, continued

- **`.btn.ghost` is written for the dark menu ground and has to be re-scoped
  for every new light surface.** The undo bar was the next one missed: an
  invisible dismiss button, cream on cream, in a panel the contrast audit did
  not walk because it only visited menu tabs. A test that covers one region
  will keep passing as new regions are added; `tower-contrast.mjs` now walks
  the in-table surfaces too. The same gap still exists in `tower-touch.mjs`.

## Constants copied into tests

- **A test that hardcodes a product constant fails when the product changes,
  and reads as a regression.** Raising the tower from 12 floors to 20 failed
  `out-of-range values are clamped`, which had `junk.floor < 12` written into
  it — the clamp was working perfectly. Same for the release-notes test, which
  asserted a frozen list of version strings and so failed on every release.
  Read the constant from the game (`W.MAX_FLOORS`) or assert the property
  ("everything returned is newer than X"), never a literal copy.

## Predicates

- **Pin a gate from both ends.** `Install.offerable()` returning `false`
  always would pass every "the button is hidden" check while having deleted
  the feature. There is a companion test that stubs `isIOS()` to `true` and
  asserts the button comes back.
- **Sabotage every new test.** Revert the fix, confirm the test fails, restore.
  Done for the timing tests (decay moved back into `drawPart` → three
  failures) and the tap-target audit (`min-height: 28px` → failures).

## Data

- **`D.C` has no `cream3`.** Passing a missing palette key to a CSS custom
  property sets it to the string `"undefined"`, which is invalid, so
  `background: var(--accent)` silently falls back to transparent. The heading
  rendered as dark-on-dark rather than throwing.
- **`el()` accepts both dotted and space-separated classes now**, but a spec
  like `'div.frow' + ' open'` used to drop *every* class silently. If an
  element looks unstyled, check the class list before the stylesheet.
