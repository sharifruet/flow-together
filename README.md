TogetherFlow
============

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

A workflow platform built on [Flowable](https://github.com/flowable/flowable-engine): the
BPMN, CMMN, DMN, App and IDM engines, plus **four React applications** that give business
users, operators, administrators and modellers a product to work in.

The engines are Flowable's, unchanged in shape. What this repository adds is everything
above them.

## The four applications

| App | What it is for | Talks to |
|---|---|---|
| **Work** | Task and case inbox — the screen a business user lives in | process, CMMN |
| **Control** | Runtime operations: instances, jobs, deployments, migration | process, CMMN, DMN, event registry |
| **Identity** | Users, groups and privileges | process, IDM |
| **Design** | Model authoring across BPMN, CMMN, DMN, apps, forms and events | process, CMMN, DMN, app, event registry |

They share `togetherflow-common` — a typed REST client, auth and tenant context, the design
system, i18n, the app shell and the cross-cutting production concerns. Nothing is generated
from a vendor SDK; the shared library is the product's own.

**1,265 frontend tests** pass across the five modules (common 433, design 591, control 103,
work 97, identity 41).

---

## Running TogetherFlow locally

The engine plus all four apps. Each app's own README goes deeper; this is the whole stack in
one place.

### Prerequisites

- **JDK 17+** for the engine (25 works).
- **Node 22** for the apps. Node 20 is *not* enough — Vitest fails to start on it with
  `SyntaxError: ... does not provide an export named 'styleText'`. If your system Node is
  older, the Maven build downloads a pinned `v22.14.0` you can borrow:

  ```bash
  export PATH="$PWD/modules/togetherflow-design/target/node:$PATH"
  ```

### 1. The backend

**No Docker and no database server needed.** The war embeds H2 and creates the database on
first run, so two commands get you a working engine:

```bash
./mvnw install -Pdistro,quick                              # -Pquick skips tests + checkstyle
java -jar modules/flowable-app-rest/target/flowable-rest.war
```

It starts in a few seconds at **http://localhost:8080/flowable-rest**; sign in as
**`rest-admin` / `test`**. The war already contains six demo processes, so the screens are
not empty before you deploy anything.

On the *first* run against an empty database the admin user is created a moment after the
`Started FlowableRestApplication` line, so a request fired immediately can still come back
401. Give it a second and try again.

The database is a **file**, at `~/flowable-db/ossdb.mv.db` — it survives restarts, which is
what you want while developing, and is also the thing to delete when you want a clean slate:

```bash
# a different port, and a database of its own
java -jar modules/flowable-app-rest/target/flowable-rest.war \
  --server.port=8081 \
  --spring.datasource.url='jdbc:h2:~/flowable-db/scratch;DB_CLOSE_DELAY=-1'

rm -rf ~/flowable-db          # start over from an empty engine
```

One H2 file takes one engine: a second instance pointed at the same URL fails on the lock.
Give each its own `--spring.datasource.url`, as above.

H2 is the only driver in the war (`WEB-INF/lib/h2-2.4.240.jar`). To run against Postgres or
MySQL, put that driver on the classpath and pass `--spring.datasource.url`,
`--spring.datasource.username` and `--spring.datasource.password` the same way.

**Docker instead**, if you would rather not build:

```bash
docker run -d --name tf-engine -p 8080:8080 flowable/flowable-rest
```

#### The engine's REST layout

This app does not use Flowable's default servlet paths, which matters whenever you call it
by hand or point an app somewhere new: BPMN is mounted at `/service`, every other engine
under its own prefix.

| Engine | Path |
|---|---|
| BPMN | `/flowable-rest/service` |
| CMMN | `/flowable-rest/cmmn-api` |
| App | `/flowable-rest/app-api` |
| DMN | `/flowable-rest/dmn-api` |
| IDM | `/flowable-rest/idm-api` |

```bash
curl -u rest-admin:test http://localhost:8080/flowable-rest/service/repository/process-definitions
```

### 2. The four apps

From each module's `src/main/frontend`, `npm install` once and then:

```bash
cd modules/togetherflow-work/src/main/frontend && npm run dev
```

| App | Module | Dev URL |
|---|---|---|
| Work | `modules/togetherflow-work` | http://localhost:5273 |
| Identity | `modules/togetherflow-identity` | http://localhost:5274 |
| Control | `modules/togetherflow-control` | http://localhost:5275 |
| Design | `modules/togetherflow-design` | http://localhost:5276 |

All four at once, from the repository root:

```bash
for m in work identity control design; do
  (cd "modules/togetherflow-$m/src/main/frontend" && npm run dev &)
done
```

In development the apps use **basic** auth (`public/config.js`), so you get a sign-in form —
use `rest-admin` / `test`, or any engine user. Production uses OIDC instead; see
[docs/ui/OPERATIONS.md](docs/ui/OPERATIONS.md).

Each dev server proxies to the engine and rewrites to the layout above, so the apps' own
paths stay deployment-neutral. Point them somewhere else with `TF_API_TARGET` (host) and
`TF_API_CONTEXT` (context path):

```bash
TF_API_TARGET=http://engine.internal:8080 npm run dev
```

The app switcher in the header expects all four ports, so start the ones you want to move
between.

### 3. Something to look at (optional)

An empty engine gives you empty screens. The Resignation (Sales) example deploys a real
case, five processes and twenty-two people over REST — no jar, no rebuild:

```bash
examples/resignation-sales/deploy.sh
```

Then, in Work, open **Start work**, switch the toggle from *Process* to **Case**, and start
*Resignation (Sales)*. Start the **case**, not one of its five sub-processes: those are
started by the case, which supplies their variables, and starting one by hand either fails
or creates a task with nothing in it. [examples/resignation-sales/README.md](examples/resignation-sales/README.md)
has the detail, and `USER_MANUAL.md` beside it walks all fifteen steps.

### Troubleshooting

| Symptom | Cause |
|---|---|
| `Port 8080 was already in use` | An engine is already running — reuse it, or pass `--server.port=8081` |
| `Database may be already in use` | Another engine holds that H2 file. Give this one its own `--spring.datasource.url` |
| 401 on every REST call | Wrong credentials: this app's admin is `rest-admin`, not `admin` |
| 401 only on the very first run | The admin user is still being created — retry in a second |
| 403 after a successful sign-in | The user has no `access-rest-api` privilege. Grant it in Identity → Privileges |
| Vitest exits with `styleText` | Node is older than 22 — see Prerequisites |
| Apps load but every request 404s | The engine is mounted somewhere else; set `TF_API_CONTEXT` |

---

## Building

The UI modules sit behind an opt-in profile, so an engine-only build never downloads Node:

```bash
./mvnw install -DskipTests                  # engines only
./mvnw install -Ptogetherflow               # engines + the apps
./mvnw install -Pdistro,quick               # + the REST app war, no tests or checkstyle
```

Per-app scripts, from any `src/main/frontend`:

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with the REST proxy |
| `npm run build` | Typecheck, then production build into `dist/` |
| `npm test` | Component tests (Vitest + Testing Library) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run e2e` | Playwright golden path — needs a real backend |

## Repository layout

```
modules/flowable-*              the engines, from upstream Flowable
modules/flowable-app-rest       the deployable REST app (flowable-rest.war)
modules/togetherflow-common     shared library for the four apps
modules/togetherflow-{work,control,identity,design}
                                the four React applications
examples/resignation-sales      a complete worked process, deployable over REST
docs/ui                         requirements, operations, status, ADRs
k8s/                            Helm chart and plain manifests
```

Three optional backend modules, none part of a default install:

- `togetherflow-attachment-gateway` — attachment storage when the engine's own database is
  not where the bytes should live.
- `togetherflow-event-recorder` — a jar for the application hosting the event registry,
  giving Control a log of inbound events the engine does not itself keep.
- `togetherflow-workspace` — workspaces and design-time permissions for Design. Absent,
  Design shows one flat model library, which is the supported default.

## Documentation

| Document | What it covers |
|---|---|
| [docs/ui/REQUIREMENTS.md](docs/ui/REQUIREMENTS.md) | What is required, and why |
| [docs/ui/OPERATIONS.md](docs/ui/OPERATIONS.md) | Running it in production: config, health, failure modes |
| [docs/ui/STATUS.md](docs/ui/STATUS.md) | What is built, what is verified, what is not |
| [docs/ui/adr/](docs/ui/adr/) | Architecture decisions, 0001–0018 |
| [CLAUDE.md](CLAUDE.md) | Engine internals: the command pattern, persistence, the agenda |

## Upstream

This is a fork of [flowable/flowable-engine](https://github.com/flowable/flowable-engine).
The engine modules track upstream; `modules/togetherflow-*`, `examples/` and `docs/ui/` are
this repository's own. Flowable's own documentation is at
[flowable.org](https://www.flowable.org/) and its downloads at
[flowable.org/downloads.html](https://www.flowable.org/downloads.html).

## License

Apache License 2.0 — see [LICENSE](LICENSE). Flowable is Apache 2.0 licensed, and this fork
keeps that license unchanged.
