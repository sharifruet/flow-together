# ADR 0015 — Record inbound events in an optional module, on the processor seam

**Status**: Accepted
**Relates to**: REQUIREMENTS.md §7.2 (Event Registry runtime), §11.13, §13.7 (Compliance)

## Context

§7.2 asked Control to show "inbound event instances received on a channel
(`EventInstanceCollectionResource`)". Every companion document treated this as unbuilt
frontend work: §12 listed the "Control-side runtime views" as outstanding, and STATUS.md
inherited that framing.

It was never frontend work. Two facts, both confirmed by reading the engine:

1. **`EventInstanceCollectionResource` is `POST`-only.** Its single method is
   `createEventInstance` — it *sends* an event into the registry. There is no `GET`, and
   the name is the only thing suggesting otherwise.
2. **Nothing is recorded to read.** The event registry engine's persistence is entirely
   repository state: `EventDeploymentEntity`, `EventResourceEntity`,
   `EventDefinitionEntity`, `ChannelDefinitionEntity`. There is no runtime entity. Inbound
   events are routed to their subscriptions and forgotten, which is a reasonable design
   for something that may carry high-throughput broker traffic.

So the requirement could not be satisfied at any cost in the frontend, and the honest
options were to decline it or to add backend surface. Declining was defensible — Control
already offers the inverse, sending an event and watching what it starts. But it leaves a
real operational question unanswerable: *did it arrive?*

## Decision

**Build it, in a new optional module (`togetherflow-event-recorder`), not in the engine.**

Adding a runtime entity to the event registry engine was rejected. It would mean a create
script for six dialects, an upgrade step per dialect, and a `FlowableVersions` entry
gated by `SqlUpgradeValidationTest` — and, worse, it would diverge this fork's persistent
schema from upstream for a feature upstream does not have, making every future merge
harder. The module owns a table of its own (`TF_EVENT_RECORD`), created on first use in
the host's datasource, outside the engine's versioned schema entirely.

**Use the `InboundEventProcessor` seam, not `EventRegistryEventConsumer`.** This is the
part worth writing down, because the API makes the wrong choice look right.

`EventRegistryEventConsumer` is the seam the registry advertises for observers, and it
was the original plan. It cannot serve this requirement: a consumer receives an
`EventRegistryEvent` wrapping an `EventInstance`, and `EventInstance` exposes
`getEventKey`, `getTenantId`, payload, headers and correlation parameters — but **no
channel**. `DefaultInboundEventProcessor` knows the `InboundChannelModel` and discards it
before calling `sendEventToConsumers`. §7.2 asks for events received *on a channel*, so
channel attribution is the requirement rather than a nicety.

`EventRegistry#setInboundEventProcessor` is public API and is the earliest point that
sees the channel, the raw payload, and what the pipeline made of it. It also sees the two
outcomes a consumer never observes at all:

| Outcome | Visible to a consumer? |
|---|---|
| `RECEIVED` — resolved and dispatched | yes |
| `UNRESOLVED` — arrived, pipeline produced nothing | **no** |
| `FAILED` — pipeline threw, rejected before dispatch | **no** |

`UNRESOLVED` is the row that justifies the whole module. "Nothing happened" has two
causes an operator cannot otherwise separate — it never arrived, or it arrived and
matched nothing — and only this distinguishes them.

**Recording is best-effort and never blocks an event.** Every store failure is logged and
swallowed (§13.4): a recorder that cannot write loses a diagnostic, not an event. Rows are
written *before* dispatch, so a consumer that throws does not cost the evidence that the
event arrived.

**Off by default, at three gates**: the jar on the classpath, the event registry API
present with it, and `togetherflow.events.recorder.enabled=true`. A deployment that does
none of those carries no table, no endpoint, and no write on the inbound path.

**Control hides the view when the recorder is absent** rather than showing an empty table.
An absent feed and an empty feed mean different things, and conflating them would tell an
operator that no events arrived when in truth nothing was watching.

## Consequences

- The capability exists without the engine's schema moving, so upstream merges are
  unaffected and removing the feature is dropping one table.
- **It is a library, not a service.** Registry dispatch is an in-JVM callback, so unlike
  `togetherflow-attachment-gateway` this cannot be a separate container — it has to run
  inside the application hosting the engine, which means a deployment that wants it builds
  a thin image over the stock one. This is the main cost of the decision.
- **It replaces the inbound processor rather than wrapping it.** Dispatch is the stock
  three-line behaviour, but a deployment with its own `InboundEventProcessor` must not
  enable the recorder. The installer logs what it displaced so this is visible rather than
  silent. Wrapping was considered and rejected: a delegating wrapper cannot see the events
  the delegate produces, which is most of the value.
- **Events arriving during startup are not recorded** — the swap happens after all
  singletons are instantiated, because the engine installs its own processor while
  building itself. Small window, not zero.
- **A write is added to the busiest path in the system** when enabled. `store-payload:
  false` and a short `retention` blunt it; leaving it off until needed blunts it entirely.
- **Payloads are personal data** (§13.7). Retention defaults to seven days rather than
  forever, `store-payload: false` keeps the arrival without the contents, and the endpoint
  inherits the host application's authentication — it must not be exposed unauthenticated.
- **The endpoint has no tenant boundary, and its default is unfiltered.** `tenantId` is an
  optional parameter applied only when supplied — `JdbcEventRecordStore.query` skips a null
  filter — so a request that omits it returns **every tenant's rows**. Control always sends
  the active tenant, but §13.1 requires server-side enforcement behind UI-side scoping and
  this endpoint has none. The fix is therefore larger than validating a caller-supplied
  tenant: the leak is the request that supplies none, so enforcement has to *derive* the
  tenant from the authenticated principal and apply it unconditionally — which needs the
  host application's interceptor and is outside this module. Recorded as a known
  limitation rather than left to be discovered: a multi-tenant deployment that must not
  leak payloads across tenants should run `store-payload: false`, or leave the recorder
  undeployed until the scope is enforced. The query is parameter-bound throughout, so this
  is purely an authorization gap with no injection issue beside it.
- Not verified against a real broker. The tests drive the processor directly; that
  replacing the processor on a live engine records real JMS/Kafka/RabbitMQ traffic has not
  been exercised.

## Alternatives rejected

- **Decline the requirement** and move it to §9. Cheapest, and defensible given the
  send-an-event tool, but it leaves "did it arrive?" unanswerable.
- **A runtime entity in the event registry engine.** The only option that makes the log a
  first-class engine feature, at the cost of multi-dialect DDL, upgrade steps, a
  `FlowableVersions` entry, and permanent schema divergence from upstream.
- **A standalone service subscribing to the same broker topic.** Genuinely decoupled, but
  only works for broker-backed channels — not the HTTP inbound adapter, and not events
  injected through the REST send endpoint — and it would record what the broker carried
  rather than what the registry made of it.
- **A consumer plus a `ThreadLocal` carrying the channel** from the processor. Would have
  kept the advertised seam, but depends on the pipeline and consumer dispatch staying on
  one thread, and is far harder to explain than simply taking the seam that has the data.
