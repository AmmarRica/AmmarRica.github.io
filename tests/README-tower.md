# Tower of Chips test suite

Targeted suites while working, one full run before pushing.

```sh
node tests/ai-tester.mjs        # all site games, demo hook smoke test
node tests/tower-probe.mjs 20   # progression trace for this game
node tests/tower-timing.mjs     # fixed timestep, draw idempotency, interpolation
node tests/tower-touch.mjs      # 44px tap targets + reachability, every tab
node tests/tower-pwa.mjs        # manifest, icons, install gating, update check
```

`tower-pwa.mjs` serves the repo over real HTTP on :8099 — service workers and
install prompts do not exist on `file://`.

Set `PW_CHROME` if Playwright cannot find a browser.

Read `TRAPS.md` before adding a test.
