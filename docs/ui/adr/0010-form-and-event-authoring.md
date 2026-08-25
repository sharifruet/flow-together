# ADR 0010 — Client-side authoring for forms and events

**Status**: Accepted (Phase 6)
**Supersedes**: nothing. **Resolves**: REQUIREMENTS.md Open Question 7.

## Context

Forms and Event Registry definitions were the last two model types left unauthored. Unlike
BPMN, CMMN and DMN, neither had an obvious path to the engine, and Open Question 7 framed
the choice as a fork:

- **(a)** add backend REST surface — a `flowable-form-rest` module, plus draft endpoints on
  `flowable-event-registry-rest`; or
- **(b)** author entirely in the browser and package the deployment bytes client-side.

The plan flagged this as a gating decision because option (a) turns a frontend phase into
one with real engine-side scope.

## What the running engine actually says

Rather than settle this from the Java source, the question was put to a live
`flowable/flowable-rest` container:

| Probe | Result |
|---|---|
| `GET /flowable-rest/form-api/**` | **404** — no form REST module is mounted. |
| `GET /runtime/tasks/{id}/form` | `{"message":"Bad request","exception":"Form engine is not initialized"}` — the stock image does not even start a form engine. |
| `GET /flowable-rest/event-registry-api/event-registry-repository/event-definitions` | **200** — the event registry REST surface is mounted and works. |
| `POST …/event-registry-repository/deployments` with a `.zip` | Rejected. Only `.event` and `.channel` are accepted — **one file per call**, no archive, unlike the process and app engines. |
| Deploy a `.event`, then read it back | Round-trips losslessly; the stored model is byte-for-byte what was posted. |

So option (a) is not merely bigger — for forms it would mean building a REST module *and*
an engine that the reference distribution does not run. And neither engine offers a
pre-deployment draft repository regardless of which fork is taken.

## Decision

Take option (b), with the generic model repository as the draft store.

1. **Drafts live in `/repository/models`**, the same store already used for BPMN, CMMN and
   DMN drafts, under categories `togetherflow:form` and `togetherflow:event`. The endpoint
   stores opaque bytes, so JSON is as valid a payload as XML. This is what makes the
   "add a backend module" half of Open Question 7 unnecessary: the draft repository the
   question asked for already exists and is model-type agnostic.
2. **Forms deploy as part of an app** (§7.4.5). There is no form endpoint to post to, so
   the builder ships no Deploy button; it states the constraint on screen instead of
   offering an action that cannot succeed. The `.form` file is bundled by the app builder,
   and takes effect wherever a form engine is actually configured.
3. **Events and channels deploy directly** to `/event-registry-repository/deployments`, as
   separate calls — one `.event` and one `.channel` — because that endpoint takes a single
   file and accepts no archive.
4. **The form builder writes Flowable's own `SimpleFormModel` JSON**, the exact schema the
   Work app's renderer consumes (ADR 0007). Nothing is translated between authoring and
   rendering, which is the only way the two halves can be verified against each other.

## Consequences

- No engine-side work, and no new module to operate, version or secure.
- A form's round trip is only fully closed where a form engine is configured. The stock
  image is not such a deployment, so "authored form renders in Work" is verifiable against
  a properly configured engine, not against the reference container.
- An event model carrying both an event and a channel produces two deployments, not one.
  They are therefore independently versioned in the registry, and a partial failure leaves
  one deployed and the other not — the editor reports which, rather than claiming success.
- Because drafts are JSON in a store that also holds XML, the client must not interpret a
  source body by sniffing it. Reading a draft as parsed JSON instead of text silently
  emptied every app, form and event draft on reopen — caught only against a running engine,
  and now pinned by `ModelApi.getSource` reading with an explicit `responseType: "text"`
  plus a regression test.

## Alternatives rejected

- **Build `flowable-form-rest`.** Backend scope in a frontend roadmap, for an engine the
  reference distribution does not initialise. Nothing about the builder's design forecloses
  this later — if a form REST surface ever appears, only the deploy path changes.
- **A dedicated draft store for forms/events.** A second repository with its own schema,
  duplicating what `/repository/models` already does for three other model types.
