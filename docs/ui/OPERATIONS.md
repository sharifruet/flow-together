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

Plus one optional backend, `flowable/togetherflow-attachment-gateway`, deployed **only**
when attachments are stored somewhere other than the engine's own database (§7.6).

Kubernetes manifests for all five are in [`k8s/resources/`](../../k8s/resources/). They
follow the shape of the existing `flowable-rest.yaml` and add liveness/readiness probes,
a read-only root filesystem and a non-root uid.

There is **no Helm chart** for these apps. The chart family lives on the `flowable-helm`
branch, under `k8s/flowable`, which does not exist on `main` — adding chart entries has to
happen there.

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
| Control | `TF_IDM_BASE`, `TF_DMN_BASE`, `TF_CMMN_BASE`, `TF_EVENT_BASE`, `TF_EXTERNAL_JOB_BASE` |
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
| Control shows no "received events" feed | There is none | `EventInstanceCollectionResource` is POST-only; the engine keeps no queryable inbound log |

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

## 9. What this product deliberately does not do

Recognising these saves an investigation:

- **Suspend a case or decision definition.** The engine exposes suspend/activate only for
  BPMN process definitions. Control lists case definitions and says so rather than
  offering a control that always fails.
- **Validate a model server-side before deploy.** `flowable-process-validation` has no REST
  endpoint. Design runs client-side checks and says they are client-side; the only
  server-side validation available is deployment itself.
- **Migrate a running instance.** The endpoints exist and are wrapped, but the screen was
  never designed.
- **Report aggregate analytics.** No REST module exposes an aggregation resource. Any
  counts come from paging metadata.
