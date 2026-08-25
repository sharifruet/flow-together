# ADR 0007 — A Flowable-schema-native form renderer, not a form-js adapter

Status: Accepted
Relates to: REQUIREMENTS.md §7.1 (Forms), §7.4.6, §11.4, §11.7; IMPLEMENTATION_PLAN.md Phase 2

## Context

Phase 1 stood in a generic typed variable grid for task completion. Phase 2 required real
form rendering. REQUIREMENTS.md §11.4 left the choice open, and §7.4.6 noted that
`@bpmn-io/form-js` — the obvious off-the-shelf option — uses **Camunda's** form schema, not
Flowable's.

Two things were verified against this repo before deciding:

1. **The field-level form model is reachable over REST.** `GET /runtime/tasks/{taskId}/form`
   and `GET /repository/process-definitions/{id}/start-form` return a `FormModelResponse`
   carrying `fields[]` with type, required, placeholder, value, options and layout — plus
   CMMN and historic equivalents. Rendering is therefore possible without new backend work.
2. **There is no generic "fetch any deployed form by key" endpoint.** There is no
   `flowable-form-rest` module. `/repository/.../form-definitions` returns metadata only.

## Decision

Build the renderer natively against Flowable's own `SimpleFormModel` schema, in
`togetherflow-common/src/forms/`.

Notable details the schema forced, all verified against the Java model:

- `FormField` is **polymorphic** on a `fieldType` discriminator (`FormField`,
  `OptionFormField`, `FormContainer`, `ExpressionFormField`). `options` exists only on
  `OptionFormField`, and `FormContainer` nests `FormField[][]` — rows of columns — so the
  renderer recurses and the value/validation layer flattens.
- The field's declared `type` decides the **variable type** on submit (`integer` → integer,
  `amount`/`decimal` → double, `date` → ISO-8601). The engine rejects a variable whose
  value does not match its declared type, so guessing from the JavaScript value is wrong.
- Presentational types (`headline`, `spacer`, `horizontal-line`, `hyperlink`, `container`)
  carry no value, and `expression` fields are engine-computed — all are excluded from the
  submitted payload and rendered read-only.

## Alternatives considered

- **`@bpmn-io/form-js`** — mature and well-tested, but its schema is Camunda's. Using it
  means writing and maintaining a bidirectional adapter between two evolving third-party
  schemas, which is more code than the renderer itself and fails in subtler ways when either
  schema moves. Rejected.
- **Keep the variable grid** — honest but poor: business users should not be typing variable
  names and picking types to complete a task.

## Consequences

- Task forms and start forms render natively, with per-field validation, container layout,
  option fields, and outcome-free completion.
- **Graceful degradation is part of the design**: the form endpoint 400s when a task has no
  `formKey` and fails outright when no form engine is deployed, so `getForm` returns `null`
  rather than throwing, and the UI falls back to the variable grid with an explanation. The
  form is only requested at all when the task declares a `formKey`.
- **Not supported yet**: `upload` fields (they bind to the content store, which this phase
  does not wire up — the UI says so rather than rendering a dead control), and
  `optionsExpression`-driven option lists, which arrive unresolved and fall back to free text.
- **Outcomes are not yet used.** `FormModelResponse` carries `outcomes` and
  `outcomeVariableName`, and `TaskActionRequest` accepts an `outcome`. Rendering outcome
  buttons instead of a single "Complete task" is a natural follow-up.
- If a `FormHandlerRestApiInterceptor` bean is registered server-side, the endpoint returns
  whatever that interceptor produces rather than `FormModelResponse`. The renderer treats an
  unparseable or field-less response as "no form" and degrades to the grid.
