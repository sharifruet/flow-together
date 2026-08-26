# TogetherFlow — Operator Runbook

Written for whoever runs this in production, not for whoever built it
(REQUIREMENTS.md §13.8). It covers configuration, health, the failure modes worth
recognising, and the things this product deliberately cannot do.

Related: [REQUIREMENTS.md](REQUIREMENTS.md) for why each requirement exists,
[VERSIONING.md](VERSIONING.md) for the compatibility matrix, and each module's own
README for developer-facing detail.

## 1. What gets deployed

Four independent static SPAs, each its own container image, each served by nginx:

| App | Image | Purpose | Talks to |
|---|---|---|---|
| Work | `flowable/togetherflow-work` | Task and case inbox | process, CMMN |
| Control | `flowable/togetherflow-control` | Runtime operations | process, CMMN, DMN, event registry, external job |
| Identity | `flowable/togetherflow-identity` | Users, groups, privileges | process, IDM |
| Design | `flowable/togetherflow-design` | Model authoring | process, CMMN, DMN, app, event registry |

Plus two optional backend pieces, neither part of a default install:

- `flowable/togetherflow-attachment-gateway` — its own container, deployed **only** when
  attachments are stored somewhere other than the engine's own database (§7.6).
- `togetherflow-event-recorder` — **not** a container. A jar added to the application
  hosting the event registry engine, giving Control a log of inbound events the engine
  itself does not keep (§7.2, §4b below).

Two ways to deploy them, both maintained here and neither generated from the other:

- **Helm**: [`k8s/flowable/togetherflow`](../../k8s/flowable/togetherflow/README.md) — the
  four apps, the optional gateway, ingress and an off-by-default NetworkPolicy.
- **Plain manifests**: [`k8s/resources/`](../../k8s/resources/), following the shape of the
  existing `flowable-rest.yaml`.

Both add liveness/readiness probes, a read-only root filesystem and a non-root uid, and
both are schema-validated in CI. Neither has been applied to a real cluster — see
STATUS.md §3 before assuming otherwise.

Note the chart is not yet *published*: `helm-release.yml` fires only on the `flowable-helm`
branch, so a chart on `main` is released by nothing. Install from a checkout until that is
resolved.

## 2. Configuration

Every app reads its configuration at **runtime**, from `/config.js`, which the container
writes at start from environment variables. One image is promoted across environments
rather than rebuilt per environment. Nothing below is baked into the bundle.

### Shared by every app

| Variable | Default | Meaning |
|---|---|---|
| `TF_API_BASE` | `/process-api` | Process REST API |
| `TF_AUTH_MODE` | `oidc` | `oidc` or `basic` |
| `TF_OIDC_AUTHORITY` | — | Required when mode is `oidc` |
| `TF_OIDC_CLIENT_ID` | — | Required when mode is `oidc` |
| `TF_OIDC_SCOPE` | `openid profile email` | Requested scopes |
| `TF_APP_WORK` / `_CONTROL` / `_IDENTITY` / `_DESIGN` | — | Sibling URLs for the app switcher; unset apps are not offered |
| `TF_ERROR_ENDPOINT` | — | Where unhandled errors **and Core Web Vitals** are POSTed. Unset means console-only, and disables vitals collection entirely |
| `TF_RELEASE` | — | Build id, attached to every error report |
| `TF_LOCALE` | — | Forces a UI language. Unset lets the browser and the user decide |

### Per app

| App | Additional |
|---|---|
| Work | `TF_CMMN_BASE`, `TF_ATTACHMENT_GATEWAY` |
| Control | `TF_IDM_BASE`, `TF_DMN_BASE`, `TF_CMMN_BASE`, `TF_EVENT_BASE`, `TF_EXTERNAL_JOB_BASE`, `TF_EVENT_RECORDER_BASE` |
| Identity | `TF_IDM_BASE`, `TF_IDENTITY_READ_ONLY` |
| Design | `TF_IDM_BASE`, `TF_DMN_BASE`, `TF_CMMN_BASE`, `TF_APP_BASE`, `TF_EVENT_BASE` |

### OIDC vs Basic

**Production uses OIDC** (Authorization Code + PKCE against a public client — see
[ADR 0006](adr/0006-oidc-authentication.md)). A `togetherflow-ui` public client is already
present in the checked-in Keycloak realm at `docker/config/keycloak-flowable.json`.

`TF_AUTH_MODE=basic` exists for local development and **refuses to run over plain HTTP
outside loopback**. If a container starts with `oidc` but no authority or client id, it
**exits at startup** rather than silently downgrading — a misconfigured deployment that
quietly falls back to Basic is worse than one that will not start.

The client is public, so there is no client secret. If your identity provider requires
one, that is a Secret, never a ConfigMap.

## 3. Health and readiness

Each app serves `GET /healthz` (nginx, `200 ok`). The gateway serves
`GET /attachments/health`, which reports the **active provider** — that is what lets Work
degrade gracefully when the gateway is down (§13.4).

The gateway validates its configuration **at startup**, so a misconfigured gateway fails
its readiness check rather than accepting an upload it cannot store.

## 4. Attachment storage

One property selects the provider; switching is ops configuration, not a rebuild, and
existing attachments keep resolving because the engine stores either a `url` or a
`contentId` per row and the two coexist.

| Provider | Bytes live in | Gateway needed |
|---|---|---|
| `db` (default) | The engine's own database | **No** |
| `filesystem` | A directory the gateway serves | Yes |
| `sharepoint` | A SharePoint document library via Graph | Yes |

To move Work onto a gateway, set `TF_ATTACHMENT_GATEWAY` to its base URL. No screen
changes; the seam is inside `TaskApi.uploadAttachment`.

**Before enabling SharePoint, read
[the gateway's README](../../modules/togetherflow-attachment-gateway/README.md).** That
provider is the one integration in this repo not verified against the real service, its
auth is app-only (SharePoint sees the gateway, not the end user), and uploads use Graph's
simple upload, documented to 250 MB.

## 4b. Inbound event log (optional)

The event registry engine records nothing about events it receives, so by default Control
can show what is *deployed* and can send an event through a channel, but cannot answer
"did that event arrive?". The optional `togetherflow-event-recorder` answers it.

Unlike the attachment gateway, **this is a library, not a service**: registry dispatch is
an in-JVM callback, so it runs inside the application hosting the event registry engine —
normally a thin image built over `flowable/flowable-rest` with the jar added.

| Property | Default | Notes |
|---|---|---|
| `togetherflow.events.recorder.enabled` | `false` | Being on the classpath is not consent |
| `togetherflow.events.recorder.tenant-scope` | `strict` | **The application will not start** with `strict` and no `EventRecorderTenantResolver` bean. Use `single-tenant` only where every caller may read every tenant's recorded payloads |
| `togetherflow.events.recorder.store-payload` | `true` | `false` keeps arrivals without contents (§7 below) |
| `togetherflow.events.recorder.retention` | `7d` | Purged on a background schedule |
| `togetherflow.events.recorder.max-payload-length` | `4000` | Longer payloads truncated; the row says so |
| `togetherflow.events.recorder.table-name` | `TF_EVENT_RECORD` | Its own table, created on first use, outside the engine's versioned schema |

Then set `TF_EVENT_RECORDER_BASE` on Control to reveal the **Received** tab. Left unset,
the tab does not appear at all.

**Before enabling it, read
[the recorder's README](../../modules/togetherflow-event-recorder/README.md).** Three things
matter operationally. It **replaces** the engine's inbound event processor, so a deployment
that has installed a custom `InboundEventProcessor` must not enable it. It adds a write to
the path of every inbound event, which is exactly the cost the engine's design avoids — on a
busy channel prefer `store-payload: false` and a short retention, or leave it off and enable
it to investigate. And it will **refuse to start** until you have said who may read the log:
supply an `EventRecorderTenantResolver` bean deriving the tenant from your authenticated
principal, or declare `tenant-scope: single-tenant`. That is a deliberate startup failure
rather than a warning, because the alternative it prevents is serving every tenant's event
payloads to every authenticated caller.

## 5. Observability

- **Correlation.** Every request carries `X-Correlation-Id`, and the same id spans all
  retry attempts. It is shown to the user on error toasts and error screens as
  "Reference:", so a user's screenshot is enough to find the request in engine logs.
- **Error reporting.** Set `TF_ERROR_ENDPOINT` to any collector that accepts a JSON POST.
  Reports carry app, release, route, action, user id, tenant id, status, correlation id
  and stack. Capped at 25 per session and deduplicated within 10s so a render loop cannot
  become a flood. Unset means console-only, which is a supported configuration.
- **401/403/404 are never reported** — they are the auth layer working and stale links.
- **Core Web Vitals** (§13.5) ride the same endpoint, marked `kind: "web-vital"` with a
  `metric`, `value` and `rating` (`good`/`needs-improvement`/`poor`, against Google's
  published thresholds). LCP, CLS, INP and TTFB, sampled once per page as it is hidden —
  which is the only point at which the first three are final. INP is omitted rather than
  reported as `0` when nobody interacted, so an untouched page does not read as perfect.
  Collection does not start at all when no endpoint is configured. This is **field data**:
  it tells you what users experienced, not why — diagnosing a regression still means a
  Lighthouse or DevTools trace.

## 6. Failure modes worth recognising

| Symptom | Likely cause | What to do |
|---|---|---|
| Container exits immediately at start | `TF_AUTH_MODE=oidc` without authority/client id | Set both, or use `basic` for local only |
| "Configuration error" page | `/config.js` unreadable or malformed | Check the entrypoint's output; it echoes the resolved bases |
| App loads, every request 401 | Session expired, or the OIDC client is misconfigured | Check the authority is reachable from the **browser**, not just the cluster |
| App loads, every request 404 | A `*_BASE` points at the wrong servlet | The stock `flowable-rest` image serves under `/flowable-rest` and mounts BPMN at `/service`, not `/process-api` |
| "The server took too long to respond" | A request hit its 30s deadline | Check engine health; heavy history queries are the usual cause |
| "This screen stopped working" | An unhandled render error, already reported | The Reference on screen matches the error report |
| Work's attachment widget fails, rest of app fine | Attachment gateway down | Expected degradation — Work stays usable (§13.4) |
| A case shows no diagram | The `.cmmn` has no CMMNDI | Not a fault; hand-written case files often lack it and the engine answers 400 |
| The application will not start: "no EventRecorderTenantResolver bean is defined" | The recorder is enabled under the default `tenant-scope=strict` | Intentional, not a bug. Supply a resolver bean deriving the tenant from your authenticated principal, or set `tenant-scope: single-tenant` if every caller of this application may read every tenant's recorded event payloads. The failure exists because the previous default served them to everyone and said so only in a README |
| The **Received** tab returns 403 | The tenant Control is asking for is not the one the server's resolver returns for this user | Control sends its active tenant; under `strict` the server refuses a mismatch rather than quietly narrowing it, because a UI bug and an attempt look identical from there. Check which tenant the user is actually entitled to |
| Control shows no "Received" tab | The event recorder is not deployed, or `TF_EVENT_RECORDER_BASE` is unset | The engine keeps no inbound log of its own — `EventInstanceCollectionResource` is POST-only. The optional `togetherflow-event-recorder` provides one; the tab is hidden rather than empty when it is absent, because "nothing arrived" and "nothing was watching" are different answers (ADR 0015) |
| The Received tab is present but always empty | The recorder is on the classpath but `togetherflow.events.recorder.enabled` is `false`, or nothing has arrived since it started | Check the startup log for "Inbound event recording enabled"; it also names the inbound processor it replaced. The log only covers the period since the recorder was switched on |
| Received rows show `Matched nothing` | The payload arrived; the pipeline resolved it to no event definition | An unrecognised event key for that channel's detector, or a filter that dropped it. Nothing downstream was started — this is the diagnostic the feed exists for |
| Received rows have no payload | `togetherflow.events.recorder.store-payload` is `false` | Deliberate: arrivals recorded, contents not retained (§13.7) |

## 7. Data protection

- **Retention** is visible in Control under **System → Data retention**, which surfaces the
  engine's history and cleanup properties. It is **not configurable from the UI** — history
  cleanup is engine configuration, and this repo's REST layer exposes no endpoint to change
  it. Cleanup itself runs as jobs on Control's **History** job queue.
- **Data subject access**: Identity's user list has an **Export data** action producing a
  JSON file of what the identity store holds — the user record, group memberships,
  privileges and custom info.
- **Deleting a user is not an erasure.** Task history, variables, comments and attachments
  created by that person stay in the engine. The delete confirmation says so. If you are
  answering an erasure request, export first and handle the engine's own records
  separately — this is the §13.7 caveat, and it has not been automated.
- **Audit trail**: task-level history is in Work's task detail and in Control. Note that
  the engine's `enableHistoricTaskLogging` defaults to **`false`**, so on a stock engine
  there is nothing to show — the UI says so rather than implying nothing happened.

## 8. Scaling and rollback

- Every app is stateless: no in-memory session, tokens held in memory per browser tab with
  silent renewal. Replicas scale freely behind the existing load-balancer pattern.
- The **filesystem** attachment provider is the one exception — replicas share a volume, so
  scaling out needs `ReadWriteMany`. The manifest ships `replicas: 1` for that reason.
- **Rollback** is redeploying the previous image tag. Images are versioned to match the
  engine (see [VERSIONING.md](VERSIONING.md)), signed with the same cosign key as the
  engine images, and verifiable with `docker/cosign.pub`:

  ```
  cosign verify --key docker/cosign.pub flowable/togetherflow-work:<version>
  ```

  Nothing in these apps performs a schema migration, so rolling back the UI is safe on its
  own — it is a static bundle plus its runtime configuration.

## 8b. Disaster recovery

Read this before you need it. The short version: **these four apps hold nothing you can
lose.** Everything that matters lives in the engine's database, so DR for TogetherFlow is
almost entirely DR for Flowable — and the one place that is not true is attachments.

### What actually holds state

| Component | State | If you lose it |
|---|---|---|
| Work, Control, Identity, Design | **None.** Static bundles plus `/config.js`, regenerated from environment at every container start | Redeploy the image. Nothing to restore |
| Engine database | Everything: definitions, instances, tasks, variables, history, identities | This is the recovery |
| Attachment gateway, `db` provider | None — bytes are in the engine database | Covered by the database backup |
| Attachment gateway, `filesystem` provider | **The uploaded files.** Not in any database | Attachments are gone; the engine still holds rows pointing at URLs that now 404 |
| Attachment gateway, `sharepoint` provider | None locally — SharePoint holds the files | Covered by your Microsoft 365 retention, not by you |
| Browser `localStorage` | Saved filters and per-user UI preferences (§14.4) | Users lose their saved views. Not worth a recovery plan |

The row to notice is `filesystem`. Its volume is a **second** thing to back up, and it must
be backed up *consistently with* the database — an attachment row restored without its
bytes is a broken link, and bytes restored without their row are unreferenced files. If
that pairing is not something you want to operate, `db` and `sharepoint` both avoid it.

### Stated targets

These are the ones the design supports, not aspirations. Set your own if they differ, but
set them explicitly:

| | Target | Why it is achievable |
|---|---|---|
| **RPO** | Whatever your database backup interval is | The UI adds no state, so it cannot add data loss |
| **RTO, UI tier** | Minutes | Redeploying stateless containers, no migration, no warm-up |
| **RTO, overall** | Database restore time | Which the UI has no influence over |

### The drill

Run this against a staging environment on a schedule. It is written as a drill, so each
step names the evidence, not just the action.

1. **Record the baseline.** In Control: engine version from **System → Engine**, the
   instance count, and the finished-instance count from history. In Work: one known task id.
   These are what you compare against afterwards.
2. **Take the backup** by whatever mechanism you actually rely on — not a hand-run
   `pg_dump` you would not have in a real incident. If the filesystem attachment provider
   is in use, snapshot its volume **in the same window**.
3. **Destroy.** Delete the engine's database and, if applicable, the attachment volume.
   Leave the UI deployments running: they should degrade, not crash, and confirming that is
   part of the drill.
4. **Observe the degradation.** Every app should show a reachable error state rather than a
   white page — this is the §13.4 behaviour, and the drill is where you find out whether it
   really holds. Note anything that spins forever instead.
5. **Restore** the database, and the attachment volume from the same window.
6. **Restart the engine**, then the UI pods. The UIs hold no connection pool, but
   restarting them proves the config path still works from cold.
7. **Verify against the baseline**, in this order — each step exercises a different tier:
   - Control → **System → Engine** returns the same version.
   - Control → **Instances** shows the same count.
   - Control → **History** shows the same finished count.
   - Work → open the task id from step 1; its variables, comments and history are intact.
   - Work → open an attachment on a task that has one. **This is the step that catches a
     database-only backup** — the row survives a restore that the bytes did not.
   - Design → open a model and check its version history.
   - Identity → confirm users and group memberships.
8. **Write down the actual RTO** — wall-clock from step 3 to step 7 passing — and compare it
   with the target above. A drill that does not produce a number has not tested anything.

### What the drill will not tell you

Nothing here exercises a partial failure: a database restored to a point *before* an
attachment upload, a half-completed job queue, or a restore that lands mid-transaction on a
clustered engine. Those are engine-level concerns and belong to Flowable's own DR guidance.

**Status: this drill has never been executed.** It is written from the deployment's
structure, not from experience of running it. Treat the first run as a test of the runbook
as much as of the system.

## 9. What this product deliberately does not do

Recognising these saves an investigation:

- **Suspend a case or decision definition.** The engine exposes suspend/activate only for
  BPMN process definitions. Control lists case definitions and says so rather than
  offering a control that always fails.
- **Diff two model versions.** Version history exists; comparison does not. A real BPMN diff
  is a graph comparison, and a text diff of serialised XML mostly reports attribute
  reordering.
- **Migrate a running instance.** The endpoints exist and are wrapped, but the screen was
  never designed.
- **Report aggregate analytics.** No REST module exposes an aggregation resource. Any
  counts come from paging metadata.
