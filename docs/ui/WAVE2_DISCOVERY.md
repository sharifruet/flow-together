# Wave 2 — discovery findings (E2.0, E3.0)

**As of**: 2026-08-27. Read from this fork's own REST sources, not from Flowable's
documentation — the question these steps answer is what *this* engine exposes.

[ENTERPRISE_PARITY_PLAN.md](ENTERPRISE_PARITY_PLAN.md) makes W2.1 and W2.2 open with a
discovery step and says what to do with the result: "Each that is supported becomes scope;
each that is not becomes a documented gap." This is that record, so the scope decisions
below do not have to be re-derived.

---

## E2.0 — Control

All four capabilities the plan asked about are supported. Scope stands as written.

### ✅ Instance migration with a mapping definition

`POST /runtime/process-instances/{id}/migrate` takes a **migration document** as its body,
and `POST /runtime/process-instances/{id}/migrate/validate` dry-runs it and returns a
`ProcessInstanceMigrationValidationResponse`. Validate-then-migrate is therefore a real
two-step flow, not something the UI has to simulate.

The document's shape is fixed by `ProcessInstanceMigrationDocumentConstants`:

| Property | Meaning |
|---|---|
| `toProcessDefinitionId` \| `toProcessDefinitionKey` + `toProcessDefinitionVersion` | target definition |
| `activityMappings` | the mapping editor's subject |
| `processInstanceVariables`, `localVariables` | variables to set as part of the migration |
| `preUpgradeScript` / `postUpgradeScript`, `…JavaDelegate`, `…JavaDelegateExpression` | hooks |

`ProcessInstanceMigrationDocumentConverter` registers three mapping kinds:
**one-to-one** (`fromActivityId` → `toActivityId`), **one-to-many** (`fromActivityId` →
`toActivityIds`) and **many-to-one** (`fromActivityIds` → `toActivityId`). A one-to-one
mapping may also carry `newAssignee`, `newOwner`, `newDueDate`, `newPriority`, `newName`,
`newCategory`, `newFormKey`, `newCandidateUsers`, `newCandidateGroups`.

**Scoped in**, with one deliberate narrowing: the editor authors *one-to-one activity
mappings* and the target definition. One-to-many and many-to-one are expressible in the
document and the client sends whatever it is given, but no UI is built for them — they are
for multi-instance and parallel-gateway reshapes that need a diagram-level editor to be
comprehensible, and a half-built version would be worse than none. The pre/post-upgrade
script hooks are **out**: they execute arbitrary code on the server, and offering a
free-text script box in an operations UI is a privilege-escalation surface, not a feature.

### ✅ Editing a running instance's variables

`/runtime/process-instances/{id}/variables` supports `GET`, `POST` (create),
`PUT` (create-or-update, whole collection), `DELETE` (all), and
`/variables/{name}` supports `GET`, `PUT`, `DELETE`. **Scoped in**, all of it.

### ✅ Moving execution state

`POST /runtime/process-instances/{id}/change-state`, body
`ExecutionChangeActivityStateRequest` — `cancelActivityIds` and `startActivityIds`, both
lists. **Scoped in**, presented as "cancel these activities, start those", which is what
the request literally is; anything more abstract would be inventing a model the engine
does not have.

### ✅ Rich filtering

`ProcessInstanceQueryRequest` carries far more than the UI uses:

- **Business key**: `processBusinessKey`, `…Like`, `…LikeIgnoreCase` (and the same trio
  for `processBusinessStatus`).
- **Date ranges**: `startedBefore`, `startedAfter`.
- **Variable values**: `variables: List<QueryVariable>`, each with a name, a value and an
  operation. Twelve operations: `equals`, `notEquals`, `equalsIgnoreCase`,
  `notEqualsIgnoreCase`, `like`, `likeIgnoreCase`, `greaterThan`, `greaterThanOrEquals`,
  `lessThan`, `lessThanOrEquals`, `exists`, `notExists`.

**Scoped in.** Note this is a `POST /query/process-instances` body, not query parameters —
so a variable filter cannot be a URL query string in the naive way, and the UI encodes it
compactly instead (see W2.1's notes).

---

## E3.0 — Work

Most of the phase is supported. **One item is not, and is documented as a gap rather than
faked.**

### ✅ Ad-hoc task creation

`POST /runtime/tasks` with a `TaskRequest`: `name`, `description`, `assignee`, `owner`,
`dueDate`, `priority`, `category`, `parentTaskId`, `formKey`, `tenantId`. Everything the
plan's "New → Task" needs. **Scoped in.**

### ✅ Filter-set parity

- **For me** — `assignee`
- **Unassigned** — `unassigned: Boolean` on the runtime query
- **Open** — the runtime query itself (a runtime task is by definition open)
- **Completed** — the *historic* query: `finished: Boolean`, plus `taskCompletedAfter` /
  `taskCompletedBefore` / `taskCompletedOn`
- **All** — the historic query with `finished` unset

**Scoped in.** Completed and All are served by `HistoricTaskInstanceQueryResource`, not the
runtime one, so those two filters change which resource the inbox queries. That is a real
structural difference and the inbox is built to switch rather than to pretend.

### ✅ Editable due date, People tab, Documents metadata

`PUT /runtime/tasks/{id}` accepts `dueDate` (with the `duedateSet` flag pattern, so
clearing it is expressible). Identity links are a full collection resource; attachments
carry `name`, `description` and `type`. **All scoped in.**

### ❌ Their three-level sort order — *not supported, documented as a gap*

The plan asks for Flowable Work's ordering: "due date ascending, then priority descending,
then created descending". **The REST layer cannot express it.**

`TaskBaseResource` exposes a single `sort` property chosen from a fixed map (`id`, `name`,
`description`, `dueDate`, `createTime`, `priority`, `executionId`, `processInstanceId`,
`tenantId`, `assignee`, `owner`), and `HistoricTaskInstanceBaseResource` the same shape.
There is no list form and no secondary key — one column, one direction.

The tempting workaround is to sort the fetched page in the browser. **That is not done**,
for the same reason `DataTable` refuses client-side sorting: a page of 25 rows re-ordered
locally is a lie about the other 4,000, and it would put the *wrong* 25 rows on page one
in the first place.

So Work ships the single-column server sort W1.5 already wired, defaulting to due date
ascending — the primary key of Flowable's order, correctly applied across the whole result
set — with the column headers letting an operator re-key it. Closing the gap properly means
a multi-sort parameter on the query resources, which is engine work and belongs with the
backend chunks, not here.
