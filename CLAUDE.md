# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A fork of [flowable-engine](https://github.com/flowable/flowable-engine) — the Flowable BPMN / CMMN / DMN engine suite. Multi-module Maven build, `org.flowable:flowable-root`, currently `8.1.0-SNAPSHOT`, Java 17+ (CI also runs 21 and 25).

## Build & test

Use the wrapper (`./mvnw`, or `mvnw.cmd` on Windows).

```bash
# Full install of the core reactor, no tests (do this first — OSGi tests need installed artifacts)
./mvnw install -DskipTests=true

# Everything the CI main build runs (tests + checkstyle + the distro/spring-boot modules)
./mvnw verify -Pdistro,errorLogging,include-spring-boot-samples

# Fast local build: skips tests AND checkstyle
./mvnw install -Pquick

# Single module (-am builds its dependencies too)
./mvnw test -pl modules/flowable-engine -am

# Single test class / single method
./mvnw test -pl modules/flowable-engine -Dtest=ProcessInstanceQueryTest
./mvnw test -pl modules/flowable-engine -Dtest=ProcessInstanceQueryTest#testQueryByBusinessKey
```

Surefire has `redirectTestOutputToFile=true`, so test stdout lands in `target/surefire-reports/*-output.txt`, not the console.

### Module reactor caveat

The root `pom.xml` `<modules>` list only holds the core engines/services. Spring, REST, Spring Boot, CDI, OSGi, LDAP, Camel, CXF and the flowable5 compatibility modules live in the **`distro`** (and `deploy`) profile. If a module you are editing seems to be ignored by the build, add `-Pdistro`.

Other profiles: `flowable5-test` (v5 compatibility reactor), `coverage` (JaCoCo), `cleanDb` (Liquibase drop-all before the run).

### Running against a real database

Tests default to in-memory H2. Each supported DB has a profile in `modules/flowable-parent/pom.xml` that pulls the JDBC driver: `postgresql`, `mysql`, `mariadb`, `mssql`, `db2`, `oracle`. Connection details are `-D` properties, mirroring `.github/workflows/<db>.yml`:

```bash
./mvnw clean install -PcleanDb,postgresql,distro \
  -Djdbc.url=jdbc:postgresql://localhost:5432/flowable \
  -Djdbc.username=flowable -Djdbc.password=flowable -Djdbc.driver=org.postgresql.Driver \
  -Dspring.datasource.url=jdbc:postgresql://localhost:5432/flowable
```

Those properties are consumed by `src/test/resources/flowable.cfg.xml` in each module (Spring bean definitions with `${jdbc.*:default}` placeholders).

### Checkstyle

Bound to the `verify` phase in `flowable-parent`, config in `build-tools/src/main/resources/build-config/`. Two rules bite in practice:

- **No star imports.**
- **`import-control.xml`**: `com.fasterxml.jackson.databind` / `.core` may only be imported from classes matching `*Jackson2*` or in `org.flowable.common.engine.impl.json.jackson2`. Elsewhere use the engine's own `FlowableJsonNode` / `FlowableObjectNode` / `FlowableArrayNode` abstraction (`flowable-engine-common`, with `jackson2` and `jackson3` implementations). `org.activiti.*` is only importable from `*.compatibility` packages.

## Architecture

### Engines and the configurator mechanism

Five engines share one runtime: **process (BPMN)** `flowable-engine`, **CMMN**, **DMN**, **App**, **IDM**, plus the **Event Registry**. Each has the same shape — `XxxEngineConfiguration` (extends `AbstractEngineConfiguration`) builds an `XxxEngine` that exposes service interfaces (`RuntimeService`, `TaskService`, `CmmnRuntimeService`, …).

Engines compose via `EngineConfigurator` (`flowable-*-engine-configurator` modules, e.g. `flowable-cmmn-engine-configurator`). A configurator registered on one engine's configuration bootstraps a second engine sharing the first engine's datasource, command executor, session factories and transaction context. That is how a process engine can call CMMN/DMN and vice-versa. The `flowable-*-spring-configurator` variants do the same under Spring.

### Command / session pattern

Every operation is a `Command<T>` run through a `CommandExecutor` with an interceptor chain (`LogInterceptor` → `TransactionContextInterceptor` → `CommandContextInterceptor` → retry → `CommandInvoker`), all in `org.flowable.common.engine.impl.interceptor`. The `CommandContext` is a per-command unit of work holding lazily created `Session`s (built by `SessionFactory`), most importantly the MyBatis `DbSqlSession`, which acts as first-level cache and flushes inserts/updates/deletes at command close. Service impls (`RuntimeServiceImpl` etc.) are thin: they wrap arguments in a `*Cmd` class under `impl/cmd/` and hand it to the command executor.

### Persistence layering

Three layers, consistently named, per entity:

`XxxEntity` (interface) / `XxxEntityImpl` → `XxxEntityManager` / `XxxEntityManagerImpl` (business logic, event dispatch, cascade) → `XxxDataManager` / `MybatisXxxDataManager` (SQL only).

MyBatis mappings are XML under `src/main/resources/org/flowable/db/mapping/entity/`, aggregated by `mappings.xml`. Entities extending `AbstractEntity` carry a `revision` column for optimistic locking.

DDL is hand-written SQL, **not** Liquibase, under `src/main/resources/org/flowable/db/{create,drop,upgrade}/` per module and per database dialect, aggregated into `distro/sql/`. Adding a schema change means: new `flowable.<db>.upgrade.step.<version>.<engine>.sql` for every dialect, matching edits to the `create` scripts, and a new entry in `FlowableVersions`. `SqlUpgradeValidationTest` (in `flowable-app-rest`) fails the build if a version lacks its upgrade scripts.

### Shared services

`flowable-{task,variable,identitylink,entitylink,job,batch,eventsubscription}-service` are engine-agnostic persistence services used by all engines — a task or a variable is the *same* row whether it came from a process or a case. Each has an `-api` module. When adding a field to a task/variable/job, expect to touch the service module, its API module, mapping XML and DDL for every dialect.

### Process execution: the agenda

BPMN execution is not a recursive call stack; it is an operation queue. `DefaultFlowableEngineAgenda` (`flowable-engine/impl/agenda/`) holds `Runnable` operations — `ContinueProcessOperation`, `TakeOutgoingSequenceFlowsOperation`, `EndExecutionOperation`, `TriggerExecutionOperation`, `ContinueMultiInstanceOperation`, … — that `CommandInvoker` drains until empty. Activity semantics live in `ActivityBehavior` implementations (`impl/bpmn/behavior/`). CMMN has its own agenda with `CmmnOperation`s driving plan-item lifecycle transitions.

### Model / converter / validation split

Per language: `*-model` (POJO object model) ← `*-converter` (XML/JSON ↔ model) ← `*-validation` (`flowable-process-validation`, `flowable-case-validation`) ← engine (deployment, parsing, behavior). `*-image-generator` and `flowable-bpmn-layout` render diagrams. Editing BPMN/CMMN XML support usually means changes in both the model and converter modules plus a round-trip converter test.

### REST and Spring Boot

`flowable-common-rest` holds shared JAX-RS/Spring-MVC infrastructure; `flowable-{rest,cmmn-rest,dmn-rest,idm-rest,app-rest,event-registry-rest,external-job-rest}` are per-engine resource layers. `flowable-app-rest` assembles the deployable REST app (and hosts cross-cutting persistence validation tests). Spring Boot lives in `modules/flowable-spring-boot/` — one autoconfigure module plus a starter per engine, with samples under `flowable-spring-boot-samples`. OpenAPI/Swagger specs and their generators are in `docs/public-api/`.

### Flowable 5 compatibility

`flowable5-*` modules embed the v5 engine so v5 deployments keep running inside a v7/v8 engine. Only relevant when touching that bridge; `org.activiti` imports are confined there.
