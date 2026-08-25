# TogetherFlow Work

Task and case inbox for business users. Phase 1 of [docs/ui/IMPLEMENTATION_PLAN.md](../../docs/ui/IMPLEMENTATION_PLAN.md).

## Run it locally

You need a running Flowable REST API:

```bash
docker run -d --name tf-engine -p 8080:8080 flowable/flowable-rest
```

Then, from `src/main/frontend`:

```bash
npm install
npm run dev            # http://localhost:5273
```

Sign in as **`rest-admin` / `test`** — verified against the stock image.

The dev proxy rewrites to the engine's actual layout: that image serves under context path
`/flowable-rest` and mounts the BPMN servlet at `/service`, **not** `/process-api`. Override
with `TF_API_TARGET` (host) and `TF_API_CONTEXT` (context path) for a deployment mapped
differently; a production deployment sets `TF_API_BASE` instead.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with the REST proxy |
| `npm run build` | Typecheck, then production build into `dist/` |
| `npm test` | Component tests (Vitest + Testing Library) |
| `npm run e2e` | Playwright golden-path suite — needs a real backend, see below |
| `npm run typecheck` | `tsc --noEmit` |

## Maven

Both UI modules sit behind an opt-in profile so engine-only builds don't download Node:

```bash
./mvnw install -Ptogetherflow -pl modules/togetherflow-common,modules/togetherflow-work
```

`package` runs the JS build and puts the SPA in the jar under `static/`.

## End-to-end tests

The e2e suite deliberately runs against a real engine rather than mocks, so a drift
between this UI and the REST contract fails the build (REQUIREMENTS.md §8):

```bash
npx playwright install chromium     # first run only
docker run -d --name tf-engine -p 8080:8080 flowable/flowable-rest
TF_E2E_USER=rest-admin TF_E2E_PASSWORD=test npm run e2e
```

All five golden-path tests pass against a real engine. Note the image ships demo processes,
some of which (`createTimersProcess`) throw unless given variables — the suite deliberately
starts one it picks **by name** rather than whichever is first in the list.

Set `TF_E2E_BASE_URL` to test an already-running deployment instead.

## What's here, and what isn't

Implemented: sign-in, task inbox (assigned / claimable / involved, server-side paging and
search), task detail (typed variables, comments, attachments, claim/unclaim/complete),
start a process instance, my history (completed tasks and process instances I'm involved
in), and the shell (branding, tenant context, user menu).

**Rendered forms** (Phase 2) drive both task completion and process start where the engine
supplies a form definition, using the Flowable-native renderer in `togetherflow-common`
([ADR 0007](../../docs/ui/adr/0007-flowable-native-form-renderer.md)); the typed variable
grid remains the fallback when there is no form. Forms authored in Design use that same
schema, untranslated.

Attachments run on the engine's own storage — the default `db` provider in REQUIREMENTS.md
§7.6 — and support both uploading bytes and registering a link to content held elsewhere.
The link path is the same seam a SharePoint or filesystem gateway plugs into later, so
switching provider changes where the URL comes from, not this UI.

Not built: case-specific views beyond tasks (a CMMN task appears in the inbox like any
other, but there is no case-level view of it), and process/case diagram context on a task
— "where am I in the flow?" is answerable in Control, not here.

**The app switcher is still stubbed.** Control, Identity and Design all exist now, but the
account menu lists them as disabled "Coming soon" items — in all four apps, not just this
one. Making them real links needs each app's URL as runtime configuration (they are
separately deployed origins), which no app has yet.

Keyboard shortcuts: `g` cycles Tasks → Start work → My history, `/` focuses task search,
`Esc` closes the task detail.

## Configuration

All configuration is read at runtime from `window.__TOGETHERFLOW_CONFIG__`, so one build is
promoted across environments rather than rebuilt per environment. In development that object
comes from `public/config.js`; in the container it is written at startup from environment
variables.

| Env var | Default | Meaning |
|---|---|---|
| `TF_API_BASE` | `/process-api` | Base URL of the process REST API |
| `TF_AUTH_MODE` | `oidc` | `oidc` (production) or `basic` (local development only) |
| `TF_OIDC_AUTHORITY` | — | Issuer URL, e.g. `https://keycloak.example.com/realms/Flowable`. Required when mode is `oidc` |
| `TF_OIDC_CLIENT_ID` | — | Public client id. Required when mode is `oidc` |
| `TF_OIDC_SCOPE` | `openid profile email` | Requested scopes |

A container started with `TF_AUTH_MODE=oidc` and no authority/client id **exits non-zero**
rather than starting with degraded auth.

## Authentication

Production uses OIDC Authorization Code + PKCE against a public client — see
[ADR 0006](../../docs/ui/adr/0006-oidc-authentication.md). The checked-in Keycloak realm
(`docker/config/keycloak-flowable.json`) includes a `togetherflow-ui` public client with
localhost redirect URIs for development; **a real deployment must add its own origins**.

`TF_AUTH_MODE=basic` remains for local development against a bare `flowable-rest`. It
refuses to run unless the page is served over HTTPS or from loopback, because Basic replays
a reusable credential on every request.

## Container image

```bash
# Build from the modules/ directory so togetherflow-common is in context
cd modules
docker build -f togetherflow-work/docker/Dockerfile -t togetherflow/work:dev .

docker run -p 8080:8080 \
  -e TF_AUTH_MODE=oidc \
  -e TF_OIDC_AUTHORITY=https://keycloak.example.com/realms/Flowable \
  -e TF_OIDC_CLIENT_ID=togetherflow-ui \
  togetherflow/work:dev
```

Serves on port 8080 as an unprivileged user, with a `/healthz` endpoint for liveness and
readiness probes and a strict Content-Security-Policy on every route. Released images are
signed with cosign by `.github/workflows/togetherflow-docker-release.yml`, following the
same pattern as the engine's own images.
