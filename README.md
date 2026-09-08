Flowable
========

[![Maven Central](https://img.shields.io/maven-central/v/org.flowable/flowable-engine?label=Maven%20Central)](https://central.sonatype.com/search?q=g:org.flowable%20%26%26%20%28a:flowable-engine%20a:flowable-cmmn-engine%20a:flowable-dmn-engine%29)
[![Docker](https://shields.io/docker/pulls/flowable/flowable-rest)](https://hub.docker.com/r/flowable/flowable-rest)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://github.com/flowable/flowable-engine/blob/main/LICENSE)

![Flowable Actions CI](https://github.com/flowable/flowable-engine/actions/workflows/main.yml/badge.svg?branch=main)

Homepage: https://www.flowable.org/

**This fork** also carries the TogetherFlow apps (Work, Control, Identity, Design). To run the engine and those four React apps on your machine, see [Running TogetherFlow locally](#running-togetherflow-locally) at the bottom of this file.

## flowable / flowəb(ə)l /
* a compact and highly efficient workflow and Business Process Management (BPM) platform for developers, system admins and business users.
* a lightning fast, tried and tested BPMN process engine, CMMN case engine and DMN rule engine written in Java.  It is Apache 2.0 licensed open source, with a committed community.
* can run embedded in a Java application, or as a service on a server, a cluster, and in the cloud.  It integrates perfectly with Spring.  With a rich Java and REST API, it is the ideal engine for orchestrating human or system activities.

## Introduction

### License

Flowable is distributed under the Apache V2 license (http://www.apache.org/licenses/LICENSE-2.0.html).

### Download

The Flowable downloads can be found on https://www.flowable.org/downloads.html.

### Sources

The distribution contains most of the sources as jar files. The source code of Flowable can be found on https://github.com/flowable/flowable-engine.

### JDK 17+

Flowable V7 runs on a Java higher than or equal to version 17. Use the JDK packaged with your Linux distribution or go to [adoptium.net](https://adoptium.net/) and click on the *Latest LTS Release* button. There are installation instructions on that page as well. To verify that your installation was successful, run `java -version` on the command line. That should print the installed version of your JDK.

[Flowable V6](https://github.com/flowable/flowable-engine/tree/flowable6.x) is still maintained and supports Java 8+.

### Flowable Design

Flowable offers a free to use Flowable Cloud Design application, which you can use to model CMMN, BPMN, DMN and other model types. You can register via the Flowable account registration page to get started https://www.flowable.com/account/open-source.

### Contributing

Contributing to Flowable: https://github.com/flowable/flowable-engine/wiki.

### Reporting problems

Every self-respecting developer should have read this link on how to ask smart questions: http://www.catb.org/~esr/faqs/smart-questions.html.

After you've done that you can post questions and comments on https://forum.flowable.org and create issues in https://github.com/flowable/flowable-engine/issues.


---

## Running TogetherFlow locally

The engine plus the four React apps — Work, Control, Identity and Design. Each app's own
README covers it in more depth; this is the whole stack in one place.

### Prerequisites

- **JDK 17+** for the engine (25 works).
- **Node 22** for the apps. Node 20 is *not* enough — Vitest fails to start on it with
  `SyntaxError: ... does not provide an export named 'styleText'`. If your system Node is
  older, the Maven build downloads a pinned `v22.14.0` you can borrow:

  ```bash
  export PATH="$PWD/modules/togetherflow-design/target/node:$PATH"
  ```

### 1. The backend

Build the REST app once, then run the war directly:

```bash
./mvnw install -Pdistro,quick                              # -Pquick skips tests + checkstyle
java -jar modules/flowable-app-rest/target/flowable-rest.war
```

Or skip the build and use the published image:

```bash
docker run -d --name tf-engine -p 8080:8080 flowable/flowable-rest
```

Either way the engine is at **http://localhost:8080/flowable-rest**, and you sign in as
**`rest-admin` / `test`**.

Its servlet layout is not the Flowable default, which matters whenever you call it by hand:
BPMN is mounted at `/service`, and every other engine under its own prefix.

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
| 401 on every REST call | Wrong credentials: this app's admin is `rest-admin`, not `admin` |
| 403 after a successful sign-in | The user has no `access-rest-api` privilege. Grant it in Identity → Privileges |
| Vitest exits with `styleText` | Node is older than 22 — see Prerequisites |
| Apps load but every request 404s | The engine is mounted somewhere else; set `TF_API_CONTEXT` |
