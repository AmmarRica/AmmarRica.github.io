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
