# Visual regression baselines

Suites exist for **all four apps** as of W1.5 (UI_POLISH_BACKLOG.md G1). Each previews on
its own port — Work 4173, Control 4174, Identity 4175, Design 4176 — so the four can run
concurrently without fighting over one.

Playwright names snapshots per platform (`…-desktop-darwin.png`, `…-desktop-linux.png`)
because font rendering differs between operating systems. A baseline generated on macOS
will not match a Linux CI runner, and vice versa — that is expected, not a failure of the
test.

## Status: no baselines are committed

**Read this before assuming the suite is broken.** There are currently no `*.png`
baselines for any app, so every run reports "snapshot not found" and writes the actual
output rather than comparing against anything.

That is deliberate, and it is the honest state rather than the tidy one:

- The `*-darwin.png` baselines that used to live here were generated before W1.3–W1.5 and
  no longer resemble the app — routing, the rail, page headers, badges, user chips and the
  rebuilt table all changed what every screen looks like. Keeping them would have made
  every local run report six failures that are not regressions, which is precisely the
  stale-baseline problem G1 was raised about.
- They could not be regenerated in the change that invalidated them: the machine it was
  written on is macOS 12, and `npx playwright install chromium` on Playwright 1.62 answers
  *"Playwright does not support chromium on mac12"*. No browser, no screenshots.

So this is one command away from working, and the command has to run somewhere with a
supported OS or a Docker daemon.

## Generating the baselines

Run in the Playwright container matching the installed Playwright version, so the browser
and OS match CI exactly. Do this for each app:

```bash
cd modules/togetherflow-work/src/main/frontend   # …and control, identity, design
npm run e2e:visual:docker -- --update-snapshots
```

Or, on a machine whose OS Playwright supports, for local `*-darwin.png` baselines:

```bash
npx playwright install chromium
npm run e2e:visual -- --update-snapshots
```

Commit the resulting files. Once the `*-linux.png` set is committed, remove
`continue-on-error: true` from the `visual` job in
`.github/workflows/togetherflow-ui.yml` so visual regressions actually block a merge —
a check that cannot fail is not a check (§14.5).

## Updating baselines after an intentional change

```bash
npm run e2e:visual -- --update-snapshots
```

Review the image diff before committing — the point of the suite is that an *unintended*
visual change fails, so updating baselines reflexively defeats it.
