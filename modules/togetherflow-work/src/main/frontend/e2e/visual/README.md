# Visual regression baselines

Playwright names snapshots per platform (`…-desktop-darwin.png`, `…-desktop-linux.png`)
because font rendering differs between operating systems. A baseline generated on macOS
will not match a Linux CI runner, and vice versa — that is expected, not a failure of the
test.

## Committed baselines

`*-darwin.png` — generated on macOS, used for local development.

`*-linux.png` — **not yet committed.** Until they are, the CI visual job runs with
`continue-on-error: true` and uploads its output as an artifact rather than failing the
build.

## Generating the Linux baselines (one-time)

Run in the Playwright container matching the installed Playwright version, so the browser
and OS match CI exactly:

```bash
cd modules/togetherflow-work/src/main/frontend
PW=$(node -p "require('@playwright/test/package.json').version")

docker run --rm -it \
  -v "$(pwd)/../../../..":/work -w /work/togetherflow-work/src/main/frontend \
  mcr.microsoft.com/playwright:v$PW-noble \
  bash -c "npm ci --no-audit --no-fund && npx playwright test --config=playwright.visual.config.ts --update-snapshots"
```

Commit the resulting `*-linux.png` files, then remove `continue-on-error: true` from the
`visual` job in `.github/workflows/togetherflow-ui.yml` so visual regressions actually
block a merge.

Alternatively, let CI produce them: run the workflow once, download the
`visual-regression-report` artifact, and commit the snapshots from it.

## Updating baselines after an intentional change

```bash
npm run e2e:visual -- --update-snapshots
```

Review the image diff before committing — the point of the suite is that an *unintended*
visual change fails, so updating baselines reflexively defeats it.
