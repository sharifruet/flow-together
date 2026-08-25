# TogetherFlow UI — versioning and engine compatibility

Phase 0 deliverable (IMPLEMENTATION_PLAN.md; REQUIREMENTS.md §13.3).

## Versioning scheme

The UI modules track the engine's own version rather than versioning independently. Both
`togetherflow-common` and `togetherflow-work` are `8.1.0-SNAPSHOT`, matching
`org.flowable:flowable-root`, in both `pom.xml` and `package.json`.

**Why coupled rather than independent:** these apps are not a general-purpose client. They
talk to this repo's REST layer, and the contract-conformance check (ADR 0005) is compiled
against the specs published by this same repo. A UI version means "the UI that goes with
this engine build", and pinning the versions together is the honest expression of that.

The cost is that a UI-only fix still ships under an engine version number. If the UI ever
needs to release on its own cadence — for example shipped to customers separately from the
engine — this should be revisited and recorded as a new ADR.

## Compatibility matrix

| TogetherFlow UI | Engine (`flowable-root`) | REST API base | Notes |
|---|---|---|---|
| 8.1.0-SNAPSHOT | 8.1.0-SNAPSHOT | `/process-api`, `/idm-api`, `/dmn-api`, `/external-job-api` | Current. Requires the process REST app; Identity additionally requires the IDM REST app. CMMN endpoints are declared in the client but not yet exercised by any screen. |

Add a row per released version. A UI build is supported only against the engine version in
its row; a mismatch is not blocked at runtime, and the failure mode is a 404 or a missing
field rather than a clear error.

## What the UI actually requires from the engine

Phase 1 depends on this subset. Anything outside it can change without affecting the UI;
anything inside it should be treated as a breaking change for the UI when it moves.

| Area | Endpoints |
|---|---|
| Tasks | `POST /query/tasks`, `GET/POST /runtime/tasks/{id}`, `GET /runtime/tasks/{id}/variables` |
| Forms | `GET /runtime/tasks/{id}/form`, `GET /repository/process-definitions/{id}/start-form` |
| Control — jobs | `GET /management/{jobs,timer-jobs,suspended-jobs,deadletter-jobs,history-jobs}`, `POST/DELETE /management/{queue}/{id}`, `POST /management/deadletter-jobs` (bulk), `GET /management/{queue}/{id}/exception-stacktrace` |
| Control — instances | `POST /query/process-instances`, `GET/PUT/DELETE /runtime/process-instances/{id}`, `GET .../{id}/diagram`, `GET /runtime/activity-instances` |
| Control — repository | `GET/POST /repository/deployments`, `GET/DELETE /repository/deployments/{id}`, `GET .../{id}/resources`, `PUT /repository/process-definitions/{id}` |
| Control — system | `GET /management/{engine,properties,tables,batches}`, `GET /management/tables/{name}/{columns,data}`, `GET /runtime/event-subscriptions` |
| Control — other servlets | `GET /dmn-api/dmn-history/historic-decision-executions`, `GET /external-job-api/jobs` |
| Identity (`/idm-api`) | `GET/POST /users`, `GET/PUT/DELETE /users/{id}`, `GET/POST /groups`, `GET/PUT/DELETE /groups/{id}`, `POST /groups/{id}/members`, `DELETE /groups/{id}/members/{userId}`, `GET /privileges`, `GET /privileges/{id}`, `POST /privileges/{id}/users`, `DELETE /privileges/{id}/users/{userId}`, `POST /privileges/{id}/groups`, `DELETE /privileges/{id}/group/{groupId}` |
| Comments | `GET/POST /runtime/tasks/{id}/comments` |
| Attachments | `GET/POST /runtime/tasks/{id}/attachments`, `GET .../{attachmentId}/content`, `DELETE .../{attachmentId}` |
| Definitions | `GET /repository/process-definitions` |
| Instances | `POST /runtime/process-instances` |
| History | `POST /query/historic-task-instances`, `POST /query/historic-process-instances` |

The typed assertions in `modules/togetherflow-common/src/main/frontend/src/api/contract.test-d.ts`
cover the response *shapes*; this table covers the *routes*, which no compile-time check can
verify. Route changes surface only in the Playwright e2e suite, which is why that suite runs
against a real engine rather than mocks.

## Verified against a running engine

The endpoint table above was originally derived by reading Java source. It has since been
**exercised against a live `flowable/flowable-rest` container**, which corrected two
assumptions:

| Assumption | Reality |
|---|---|
| Process API at `/process-api` | The stock image serves everything under context path **`/flowable-rest`** and mounts the BPMN servlet at **`/service`**. `/process-api` is only the default when `flowable.process.servlet.path` is not overridden — and `flowable-app-rest` overrides it. |
| Credentials | Default is **`rest-admin` / `test`**, not `admin` / `test`. |

The other servlets are where the source said, relative to the context path: `/idm-api`,
`/cmmn-api`, `/dmn-api`, `/external-job-api`.

Because the base URLs are runtime configuration, no application code changed — but the dev
proxies now rewrite to the real layout, and any deployment must set `TF_API_BASE` to match
its own servlet mapping.

Confirmed working end to end against the live engine: task query, task complete with typed
variables, attachments (both multipart upload and `externalUrl` link), draft model create +
multipart source PUT + source GET, IDM user list/create, process start, historic task query,
all job queues, tables, engine info, BPMN/CMMN deployment, app-bundle (zip) deployment, and
event/channel deployment.

A later round of probing, for the forms and events work, corrected two more assumptions:

| Assumption | Reality |
|---|---|
| A form REST API exists at `/form-api` | **404.** No form REST module is mounted, and the stock image does not initialise a form engine at all — `GET /runtime/tasks/{id}/form` answers `"Form engine is not initialized"`. Forms are deployed inside an app bundle instead. |
| The event registry takes a deployment archive, like the process and app engines | It accepts **only** `.event` and `.channel`, **one file per call**. A model carrying both is deployed as two calls. |

The event registry itself is mounted where the source said, at `/event-registry-api`, and
event definitions round-trip losslessly. See [ADR 0010](adr/0010-form-and-event-authoring.md).

The `/repository/models/{id}/source` endpoint returns `Content-Type: application/octet-stream`
whatever the stored bytes are. That matters: app, form and event drafts store JSON, so a
client that decides how to read a body by sniffing it will hand back a parsed object where
the caller expects text — which silently emptied every JSON draft on reopen. `getSource`
reads with an explicit text response type.

## Runtime configuration

Nothing environment-specific is baked into the bundle. Configuration is read from
`window.__TOGETHERFLOW_CONFIG__` (API base, auth mode, OIDC authority and client id), written
by the container entrypoint from environment variables, so a single built artifact and a
single signed image are promoted across environments (REQUIREMENTS.md §13.3). See the
Work module README for the environment variables.

## Known compatibility caveats

- **The published OpenAPI specs are behind the Java source.** `HistoricProcessInstanceResponse`
  declares `name`, `businessStatus` and `state` in Java but not in the checked-in spec. The UI
  follows the Java source. See ADR 0005.
- **Three of the five published specs are Swagger 2.0**, not OpenAPI 3, and are converted
  during codegen. See ADR 0005.
- **Auth is OIDC** (Authorization Code + PKCE) by default; the identity provider must be
  reachable from the browser, and its realm must include the app's origins in the client's
  redirect URIs and web origins. Basic auth remains available for local development only and
  refuses to run over plain HTTP outside loopback. See ADR 0006.
