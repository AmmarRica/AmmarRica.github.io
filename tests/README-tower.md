# Tower of Chips test suite

Targeted suites while working, one full run before pushing.

```sh
node tests/ai-tester.mjs        # all site games, demo hook smoke test
node tests/tower-probe.mjs 20   # progression trace for this game
node tests/tower-timing.mjs     # fixed timestep, draw idempotency, interpolation
node tests/tower-touch.mjs      # 44px tap targets + reachability, every tab
node tests/tower-pwa.mjs        # manifest, icons, install gating, update check
node tests/tower-determinism.mjs # seeded replay, stream separation, no Math.random
node tests/tower-files.mjs      # save round-trip, export/import, malformed input
node tests/tower-contrast.mjs   # WCAG 4.5:1 on every themed surface
```

`tower-pwa.mjs` serves the repo over real HTTP on :8099 — service workers and
install prompts do not exist on `file://`.

`tower-determinism.mjs` runs the same scripted 4000 steps under several seeds
and compares `hashState()`. It also asserts the scenario actually *reached*
the random call sites — see the determinism section of `TRAPS.md` for why that
assertion is the important half of the test.

`tower-files.mjs` covers both directions of the save file and the in-place
`localStorage` save. It is the suite that caught `JSON.stringify` throwing on
a circular part graph, which had been losing every save silently.

`tower-contrast.mjs` walks each menu tab, reads computed colours, and fails any
text below 4.5:1 against the first non-transparent background above it.

Set `PW_CHROME` if Playwright cannot find a browser.

Read `TRAPS.md` before adding a test.
