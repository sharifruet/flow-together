# TogetherFlow Control

Runtime operations and administration (REQUIREMENTS.md §7.2). Phase 3 of
[docs/ui/IMPLEMENTATION_PLAN.md](../../docs/ui/IMPLEMENTATION_PLAN.md).

## Run it locally

```bash
docker run -p 8080:8080 flowable/flowable-rest
cd src/main/frontend && npm install && npm run dev   # http://localhost:5275
```

Control talks to three servlets — `/process-api`, `/dmn-api` and `/external-job-api` — all
proxied in development. `TF_API_TARGET` points them elsewhere.

## What's here

| Section | Covers |
|---|---|
| **Instances** | Query running process instances, suspend/activate, delete, and a detail view with the PNG diagram, activity instances and variables |
| **Jobs** | All five queues (async, timer, suspended, dead-letter, history), failed-only filter, stack-trace viewer, run-now, delete, and **bulk** selection |
| **Deployments** | List, search, upload a `.bar`/BPMN/CMMN/DMN/form file, browse resources, delete (with an explicit cascade choice) |
| **Cases** | Query running case instances, inspect plan items and stage/milestone progress, act on plan items, terminate or delete |
| **Definitions** | Suspend/activate process definitions (with a cascade choice), manage authorized starters for processes *and* cases, broadcast a signal |
| **Events** | Deployed event and channel definitions with their live source, and sending an event into the registry |
| **System** | Engine info and properties, read-only database table browser, event subscriptions, batches, DMN decision executions, external worker jobs |

Bulk actions are first-class (§14.4): Control exists to act at a volume nobody handles one
row at a time. The engine offers a genuine bulk endpoint only for moving dead-letter jobs;
other bulk actions issue one request per item and **report partial failure honestly**
("3 of 5 jobs executed; 2 failed") rather than claiming blanket success.

## What the engine will not let this app do

- **Suspend a case or decision definition.** The engine exposes suspend/activate only for
  BPMN process definitions (§7.2). The Definitions screen lists case definitions and says
  so, rather than offering a control that always fails.
- **List received events.** Despite its name, `EventInstanceCollectionResource` is
  POST-only — "Send an event instance". The engine keeps no queryable log of inbound
  events, so the Events screen offers the honest inverse: send one and watch what it
  starts.
- **Show a case diagram without CMMNDI.** Hand-written `.cmmn` files usually lack it and
  the engine answers 400.

**Forcing a human task.** Triggering an active human task completes it, skipping its form
and assignee. This app offers it — that is what an operator needs when a case is stuck on
a task nobody can action — behind a confirmation that names exactly what is skipped. Work
does not offer it at all ([ADR 0011](../../docs/ui/adr/0011-case-runtime-and-audience-scoped-actions.md)).

## Keyboard shortcuts

Press `?` for the list. `1`–`7` jump to a section — digits rather than mnemonic letters
because seven sections collide badly (Deployments/Definitions, Cases/Control). On the job
queue, `a` selects or clears the page, `f` toggles failed-only and `r` refreshes.

Bulk selection plus `a` is the loop §14.4 exists for: Control's reason to exist is acting
at a volume nobody handles one row at a time.

## Saved filters

Instance and job queries can be **saved and reapplied** (§14.4) — including the queue, so
"failed dead-letter jobs" comes back as one view rather than two settings to re-pick.
Saved views live in the browser's own storage, not on the server: this repo's REST layer
has no per-user preference store, and the UI says so rather than implying they follow you
to another machine.

## Data retention

**System → Data retention** surfaces the engine's history and cleanup properties, because
task variables, comments and attachments can all carry personal data and this is what
governs how long it survives (§13.7). It is **read-only**: retention is engine
configuration and this repo's REST layer exposes no endpoint to change it. Cleanup itself
runs as jobs on the **History** queue.

## Not built

- **Process and case instance migration.** The endpoints exist (including
  `validate-migration`) and are wrapped in the client, but the operation needs its own
  design pass — picking a target definition and mapping activities is a screen in itself.
- **Change-state** for a running instance.

## Container

```bash
cd modules
docker build -f togetherflow-control/docker/Dockerfile -t togetherflow/control:dev .

docker run -p 8080:8080 \
  -e TF_AUTH_MODE=oidc \
  -e TF_OIDC_AUTHORITY=https://keycloak.example.com/realms/Flowable \
  -e TF_OIDC_CLIENT_ID=togetherflow-ui \
  togetherflow/control:dev
```

Extra env vars beyond the shared ones: `TF_DMN_BASE` (default `/dmn-api`) and
`TF_EXTERNAL_JOB_BASE` (default `/external-job-api`).

## Access

Control can delete instances, delete jobs and cascade-delete deployments. Restrict it with
a privilege in TogetherFlow Identity and enforce that server-side — the UI hiding an action
is not a security boundary (REQUIREMENTS.md §13.1).
