# TogetherFlow — Resignation (Sales)

`docs/Resignation_Process.xlsx`, modelled: one case, five processes, fourteen forms, an app
definition and twenty-two sample people — in the engine and in the identity provider.

A **content module**. Most of what it ships is not Java. `cases/` and `processes/` sit on
Flowable's own autodeployment paths, so adding this jar to an application deploys the models;
the Java is only the part the models cannot express.

This file is the developer-facing side: why the models are shaped as they are, and what it takes
to deploy them. **[USER_MANUAL.md](USER_MANUAL.md) is the other side** — the fifteen steps, the
form fields, the return rules and the nineteen positions, written for the people who hold a task
rather than for whoever builds the thing.

## What the spreadsheet says, and where it went

| Sheet | Who | Model |
|---|---|---|
| 1 | Employee / ASE | Case start + `aseClearance` (CMMN) |
| 2 | RSE → ZSI → SM → GM | `salesResignationApproval` |
| 3 | SSR (Sales Admin) | `salesAdminRouting` |
| 4 | SBM | `departmentClearance` (`SBM_CLEARANCE`) |
| 5 | FCA | `departmentClearance` (`FCA_CLEARANCE`) |
| 6 | GAD | `departmentClearance` (`MOTORCYCLE_CLEARANCE`) |
| 7 | HRM | `hrmVerifyDocuments` (CMMN) |
| 8 | HRM / Head of HR | `resignationAcceptance` |
| 9–14 | ACC, HRM, Head of HR | `finalSettlement` |
| 15 | HRM (ISJ) | `preserveEmployeeFile` (CMMN) |

The seven documents the sheet counts — resignation letter, sales clearance, SBM clearance,
motorcycle clearance, FCA clearance, acceptance of resignation, final settlement statement —
end up as case variables. `SalesResignationCaseTest` asserts all five of the generated ones.

## Why a case with processes inside it

What the spreadsheet actually tracks is a **folder**: seven documents from nine departments,
and a last row that reads "preserve in employee file". The sequencing is real but secondary,
and the folder outlives any one approval chain. So the case plan model owns the folder and the
four linear chains inside it are BPMN processes, reached through process tasks.

The case has four stages, matching the sheet's own grouping:

```
A. Sales approval and clearance   →  B. Departmental clearances  →  C. HR acceptance  →  D. Final settlement
   notify HRM/ACC/SSR                  SBM clearance    ┐             HRM checks 5 docs     ACC → HR → ACC
   ASE raises the sales clearance      motorcycle (GAD) ├ parallel    acceptance letter     HRM preserves file
   RSE → ZSI → SM → GM                 FCA clearance    ┘             ● milestone           ● milestone
   SSR routes both documents
```

The three departmental clearances are **one** process started three times, not three copies of
the same diagram. The case supplies the group, the name and the form as in-parameters.

## Things the spreadsheet does not say, decided here

These are judgement calls, not readings. Each is where you would push back first.

- **Rejection: it goes back to the requester.** The sheet describes only the happy path, and
  four approvals in a row with no way back is unusable. Every level in the sales chain, both
  ACC signatures and Head of HR's signature on the acceptance can **return** the item, and a
  returned item goes back to the person who submitted it — not to their team's queue:

  | Returned by | Goes back to |
  |---|---|
  | RSE, ZSI, SM, GM | the ASE who logged the resignation (`aseUserId`), then forward again from RSE |
  | Head of HR (acceptance letter) | the HRM officer who completed the document check (`hrmUserId`) |
  | ACC manager, ACC director | the ACC officer who drafted the statement (`settlementPreparedBy`) |

  The last two are remembered by a `complete` task listener on the submitting task, and both
  tasks keep their candidate group as a fallback: if nobody ever claimed the upstream task
  there is no individual requester, and the item lands back in the team queue rather than with
  no one. `SalesResignationReturnPathTest` covers every row and both fallbacks.
- **Silence is not consent.** Conditions read `${variables:equals(decision, 'approve')}` and
  every decision gateway has the *return* flow as its default, so a task completed with no
  decision at all returns. The obvious spelling, `${decision == 'approve'}`, throws on a
  missing variable instead.
- **Stage B waits for the whole of stage A.** GAD and FCA are arguably independent of SSR and
  could start earlier. They are gated on stage A because step 1.4 says all three departments
  are notified "of sales clearance and resignation acceptance", and because a CMMN sentry can
  only watch plan items in its own stage — starting them earlier means dissolving the stage
  boundary, which costs the stage overview in the Work app.
- **"HRM (ISJ)"** (steps 12 and 15) is read as a person's initials. `ismail.jamil` is that
  person. Those tasks go to the `hrm` **group**, not to him personally, so the model does not
  depend on the reading being right.
- **Mail is logged, not sent.** See below.

## The two beans the models call

Service tasks reach these by **bean name**, so renaming them breaks the models:

| Bean | What it does |
|---|---|
| `resignationNotifier` | Every "generates an email to…" in the sheet. Recipients are group ids, except the acceptance letter to the employee, which goes to `employeeUserId`. The default writes a log line. |
| `resignationDocuments` | Returns the reference under which a generated document is filed. |

Both are stand-ins, and deliberately visible ones — a demo should show *that* the notification
happened at the right point, not quietly mail twenty-two invented addresses at bpl.net. Sending
real mail means declaring your own `resignationNotifier` bean; the autoconfiguration backs off
and no model changes.

Outside Spring, put them in the engine configuration's `beans` map — on **both** engines, since
an expression in a case is resolved by the CMMN engine's expression manager and one in a
process by the process engine's. `ResignationEngineTest` shows the whole arrangement.

## Sample users

Twenty-two invented people across nineteen groups, in
`identity/resignation-sample-users.json` — one per role the spreadsheet names, plus:

- **two HRM officers**, because step 12 and step 15 say "HRM (ISJ)" and the rest say "HRM";
- **two ACC officers**, so claiming the settlement draft is a real choice — which is what makes
  "a returned statement goes back to whoever drafted it" mean anything;
- **two MPEs**, so a demo can run two cases side by side;
- **a reception desk**, the "Reception Box" of step 8.2. It holds no task; it is only notified.
  A notified recipient that nobody can be is not a recipient.

`ResignationModelConsistencyTest` holds the three sets of names to each other in both
directions: every group a model gives work to *or notifies* has users, and every group in the
file is reached by a model. Recipients matter as much as assignees here — a notification
addressed to a group that does not exist deploys, runs and reaches no one, which is how a
recipient of `acc` survived for a while against a group called `acc-officer`.

**Off by default.** Adding this jar deploys models; writing twenty-two people into an application's
directory is a different kind of act and somebody has to ask for it:

```properties
togetherflow.resignation.sample-users.enabled=true
togetherflow.resignation.sample-users.password=demo    # one weak password, for all of them
```

The seeder **never overwrites**: a user or group that already exists is left exactly as it is,
password included, so re-running is safe and a real `hrm` group that happens to share an id
with a sample one is not quietly redefined. Deleting them again is not automated.

If you would rather not run the seeder, the JSON is plain enough to POST to the IDM API.

### Signing in as them

The seeder puts these people in the *engine*. Under `TF_AUTH_MODE=oidc` — which
[OPERATIONS.md](../../docs/ui/OPERATIONS.md) makes the production default — that is only half
the job: the browser authenticates against the identity provider, not against Flowable, and a
person who exists in one store and not the other signs in fine and then finds an empty inbox.

So all twenty-two are also in the checked-in realm at
[`docker/config/keycloak-flowable.json`](../../docker/config/keycloak-flowable.json), each
under **exactly** their engine id as `username`, in a Keycloak group per position. `AuthContext`
maps the token's `preferred_username` onto the engine user id, so that spelling is the join
between the two stores and a single dot's difference breaks it silently.

`ResignationKeycloakRealmTest` holds the two files together — every sample user present and
enabled in the realm, addresses equal, and realm group membership covering the engine
memberships the models assign on. It reads a file outside the module, which is unusual; the
alternative is a realm that drifts from the identities it exists to authenticate, discovered
by a person clicking through a task list that should not be empty.

The realm password is `demo`, the same default the engine-side seeder uses, so the two agree
without anyone reconciling them. It is stored in plain text there — Keycloak hashes it on
import — which is the right shape for a demo realm and the wrong shape for anything else.

## Running it

### The short way: a REST app with the case already in it

`flowable-app-rest` has a `resignation` profile that adds this jar, so the whole thing builds
into the `flowable-rest` war the four TogetherFlow apps already talk to:

```bash
./mvnw install -Pdistro,resignation
```

That deploys the case, the five processes, the fourteen form models **and** the app definition
on startup. `resignation` rather than `togetherflow` because the latter also builds the five
frontends, each of which downloads a pinned Node - this profile is the content module alone.
A plain `-Pdistro` build is unchanged: the dependency is behind the profile, so it is not
merely unused there, it is not resolved there.

The twenty-two people are still off by default. To get them, and a case you can actually walk
through:

```properties
togetherflow.resignation.sample-users.enabled=true
```

### The general way

Add the jar to any application that runs the process **and** CMMN engines. The models deploy
themselves; then start a case as a member of `sales-ase`:

```
caseDefinitionKey  salesResignation
variables          employeeId, employeeUserId, employeeName, employeeDesignation,
                   employeeTerritory, resignationLetterRef
```

`employeeUserId` is the resigning employee's own sign-in id — who the acceptance letter is
sent to. It falls back to `employeeId` if it is left out, so a case started without it still
records who the letter was for rather than notifying nobody.

The authenticated user becomes `aseUserId`, which is who the sales clearance and any returned
record are assigned to.

```bash
./mvnw install -Presignation -pl modules/togetherflow-resignation
```

35 tests, and they run in CI (`togetherflow-ui.yml`, the `java` job).
`SalesResignationCaseTest` walks all fifteen rows of the spreadsheet on a real engine and
insists at every step that **exactly one** task with that key is open, so a step reached
early, late or twice fails there rather than looking like a passing test of a different
process.

## The app definition deploys itself

`FlowableAppProperties` scans `classpath*:/apps/` for `**.zip` and `**.bar` only, so a bare
`.app` sitting next to them is picked up by nothing. `ResignationAppDeployer` is the hand that
deploys it - registered by the autoconfiguration wherever an app engine is actually present,
with duplicate filtering on so a restart does not stack a second copy.

It is guarded by `@ConditionalOnClass` as well as `@ConditionalOnBean`, because the app engine
is a `provided` dependency: a host running only the process and CMMN engines has no
`AppRepositoryService` class at all, and must back off rather than fail to start. Turn it off
with `togetherflow.resignation.app-definition.deploy=false`.

## One thing that will not work out of the box

- **The forms will not render as forms.** This fork ships `flowable-form-api` and
  `flowable-form-model` but no form *engine*, so there is nothing to deploy a `.form` into and
  no endpoint to fetch one by key (ADR 0007 says as much). The tasks carry their `formKey`
  regardless, and the Work app falls back to its variable grid. The fourteen files in `forms/`
  are Flowable's own `SimpleFormModel` JSON, which is what Design imports and what the Work
  renderer consumes — so they are useful today as models and correct the day a form engine is
  there.
