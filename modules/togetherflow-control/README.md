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
| **System** | Engine info and properties, read-only database table browser, event subscriptions, batches, DMN decision executions, external worker jobs |

Bulk actions are first-class (§14.4): Control exists to act at a volume nobody handles one
row at a time. The engine offers a genuine bulk endpoint only for moving dead-letter jobs;
other bulk actions issue one request per item and **report partial failure honestly**
("3 of 5 jobs executed; 2 failed") rather than claiming blanket success.

## Not in this phase

- **Case (CMMN) instances** — the client is wired for `/cmmn-api` but no screen consumes it
  yet; process instances came first as the higher-traffic surface.
- **Suspend/activate for case and decision definitions** — the engine exposes this only for
  BPMN process definitions (§7.2), so the UI does not offer it elsewhere.
- **Process instance migration** and change-state; the endpoints exist but the operations
  need their own design pass.
- **Signal broadcast** — `SystemApi.broadcastSignal` exists but has no screen yet.

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
