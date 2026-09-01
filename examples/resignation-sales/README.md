# Resignation (Sales)

`docs/Resignation_Process.xlsx`, modelled: one CMMN case, five BPMN processes, fourteen forms,
an app definition and the twenty-two people the models assign work to.

**Content, not code.** There is no jar and no Java. Everything here deploys into a stock
`flowable-rest` through the engine's own repository APIs — the same ones the Design app posts to
when you press Deploy.

[USER_MANUAL.md](USER_MANUAL.md) is the walkthrough: fifteen steps, who does what, every form
field, and the rules for sending something back.

## Deploying it

```bash
./deploy.sh                                    # localhost:8080, admin/test
BASE=https://flowable.example.com/flowable-rest USER=me PASS=secret ./deploy.sh
./deploy.sh --no-identity                      # models only, leave the directory alone
```

Then start a case of `salesResignation` as a member of `sales-ase`, with these variables:

```
employeeId, employeeUserId, employeeName, employeeDesignation,
employeeTerritory, resignationLetterRef
```

The authenticated user becomes `aseUserId` — who the sales clearance is assigned to, and who a
returned record goes back to.

You can also deploy any single file by hand from Design, or with a plain `curl`:

```bash
curl -u admin:test -F "resignation-sales.cmmn=@case/resignation-sales.cmmn" \
  http://localhost:8080/flowable-rest/cmmn-repository/deployments
```

## Why there is no Java

An earlier version of this shipped as a Maven module with two Spring beans the models called by
name — a notifier and a document register. Both are gone. The thirteen places that called them
are now **Groovy script tasks**, which `flowable-app-rest` can already run: it ships
`groovy-jsr223` and `flowable-groovy-script-static-engine` at compile scope. Note the static
engine registers itself as `groovy-static`, so `scriptFormat="groovy"` resolves to the ordinary
JSR-223 engine, which is what these scripts want.

Two consequences worth knowing:

- **Notifications are recorded, not sent.** Each notification point stores a `notified…`
  variable holding `EVENT -> recipients`. That is a stand-in for mail, and a better one than the
  log line it replaces: the variable is persisted, so it survives the process instance that
  wrote it and shows up in Control's history rather than in a log nobody reads. Making these
  send real mail means turning them into `mailTask`s and configuring SMTP — a change to the
  models plus configuration, still no Java. (The one notification inside the case has to stay a
  script or become an HTTP task: the CMMN engine has no mail behaviour.)
- **Document references are computed inline.** `'doc:' + clearanceType + ':' + employeeId`,
  in Groovy. This cannot be a plain expression, because Flowable's EL maps `+` to
  `NumberOperations.add` and no `string:` function is registered.

## What was given up

The module carried thirty-five tests, including one that walked all fifteen spreadsheet rows on
a real engine and insisted exactly one task was open at each step, and three that held the
models, the sample identities and the Keycloak realm to each other. Those went with it — there
is no module left to run them in.

They still exist in git history at `modules/togetherflow-resignation` (commit `c751fe7653`), and
they all passed against these exact models after the Groovy conversion and before the module was
deleted. If this content starts changing, that harness is the thing worth bringing back.
