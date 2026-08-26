# TogetherFlow load testing

Phase 7 asks for "load testing at realistic history volume". This is that harness.

It exists because the queries the UI issues are all cheap against an empty database and
some of them are not cheap against a full one. `POST /query/tasks` with `involvedUser` —
Work's *default* inbox view — joins the identity-link table. Control's instance search is a
leading-wildcard `LIKE`, which no index helps. Neither shows up in a test that runs against
a fresh engine, which is why more than half of what is here is the seeder.

## Running it

```bash
./qa/load/run.sh --smoke            # ~2 minutes. Proves the harness works, not the system
./qa/load/run.sh                    # H2, 2000 + 2000 instances
./qa/load/run.sh --postgres --instances 20000 --completed 30000
./qa/load/run.sh --port 18080       # if something already holds 8080
./qa/load/run.sh --engine http://my-engine/flowable-rest/service   # your own deployment
```

Needs Docker and Node. k6 runs from its official image, so there is nothing to install.

The script starts an engine, seeds it, runs both scenarios, and tears down. Summaries land
in `qa/load/results/`. It exits non-zero if any threshold is breached — that is the point:
a load test with no thresholds is a graph nobody reads.

`--keep` leaves the engine up afterwards, which is what you want when a threshold failed
and you need to look at the data that caused it.

## Read this before believing a number

**The H2 default is a smoke test of the harness, not a measurement of your deployment.**
H2 is in-memory, runs in the same JVM, and has query-planner behaviour that will not match
Postgres, MySQL or Oracle. It answers "does the harness run and do the queries return
data". It does not answer "will this be fast in production". Use `--postgres`, or point
`--engine` at something that resembles what you actually run.

The scenarios also generate load through the REST API only. They do not render anything, so
they measure the engine and the network — not React, not bundle size, not Core Web Vitals.
Those are covered by the in-app RUM (§13.5) and the bundle budgets in CI.

## What is measured

Request shapes are copied from the screens that issue them, not invented — if `TaskInbox.tsx`
changes its query, this should change with it.

**`scenarios/work-inbox.js`** — the three inbox filter views (`involvedUser`, `assignee`,
`candidateUser` + `unassigned`), a filtered view combining definition and priority, and My
History. Kept separate because they are different queries with different costs; a single
blended number would hide which one regressed.

**`scenarios/control-ops.js`** — the instance list at page 1 and paged deep, name search,
finished-instance history, all four job queues, and the raw table browser. Control is the
app to worry about: Work's inbox is scoped to one person's tasks and stays small however
large the deployment gets, while Control queries across everything.

## Thresholds, and where they came from

| Metric | p95 | Reasoning |
|---|---|---|
| Inbox views | 1s | Past this a list stops feeling like it responded |
| Instance list, page 1 | 1s | Same |
| Deep paging, name search | 2s | Both are expected to be slower and both are things operators really do; a separate budget stops one masking the other |
| History queries | 2s | Scans history tables; nobody expects it to be instant |
| Error rate | <1% | The API client retries safe methods (ADR 0014), so a sustained error rate here is real |

For context, the UI's own client gives up at 30 seconds. A p95 anywhere near that is not a
slow screen, it is a broken one.

## Files

| | |
|---|---|
| `run.sh` | Orchestration: engine up, seed, both scenarios, teardown |
| `seed.mjs` | Populates an engine over its public REST API — works against any deployment you can reach, and cannot drift from the engine schema |
| `scenarios/work-inbox.js` | k6, Work |
| `scenarios/control-ops.js` | k6, Control |
| `results/` | Summary JSON per run (gitignored) |

## Status

The harness has been run end to end at the `--smoke` profile against a real engine —
starts, seeds, executes both scenarios, reports thresholds: 68,070 requests, zero failures,
every threshold met.

**That is a test of the harness, not a result.** It ran on H2 with 400 instances. **No
full-volume run has been done**, so there are no baseline numbers here and nothing in this
repository has been shown to be fast or slow at realistic volume. Producing that baseline —
on Postgres, at the volume your deployment actually carries — is the remaining Phase 7 work,
and it is a run rather than a build.

Three bugs were fixed by running it, which is the argument for running a harness before
trusting one:

- `run.sh`'s EXIT trap overwrote the script's exit status, so a **failed run reported
  success** — the worst possible failure mode for a test harness.
- The seeder called `response.json()` on task completion, which answers 200 with an empty
  body, and died with "Unexpected end of JSON input".
- k6 reached the engine through `host.docker.internal`, which on Docker Desktop produced a
  trickle of `dial: i/o timeout` under sustained load — harness noise arriving in the
  results as engine errors. k6 now joins the engine's own Docker network.
