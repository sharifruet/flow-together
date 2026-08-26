# TogetherFlow Event Recorder

An inbound event log for the Flowable event registry (REQUIREMENTS.md §7.2,
[ADR 0015](../../docs/ui/adr/0015-inbound-event-log.md)).

**Most deployments do not need this.** Nothing else in TogetherFlow depends on it, and
without it Control's Event Registry screen still shows deployed event and channel
definitions and can send an event through a channel to prove the path works.

## Why it exists

Ask an operator's question — *"did that order event actually reach us?"* — and the engine
has no answer. The event registry persists repository state only: deployments, resources,
event definitions, channel definitions. Nothing records what arrived.

`EventInstanceCollectionResource` sounds like the answer and is not: it is `POST`-only,
and it *sends* an event. There is no `GET`. REQUIREMENTS.md §7.2 asked for a feed of
received events for a long time before anyone noticed that no endpoint could serve it.

This module records inbound events as they are processed and exposes them over its own
`GET`. Control shows the result as a **Received** tab, which appears only where this is
deployed — an absent feed and an empty feed mean very different things.

## What a row tells you

| Outcome | Means |
|---|---|
| `RECEIVED` | Resolved to an event definition and dispatched to the engines |
| `UNRESOLVED` | Arrived, but the pipeline produced no event — an unrecognised key, or a filter that dropped it |
| `FAILED` | The pipeline threw; the payload was rejected before dispatch |

`UNRESOLVED` is the one that earns the module its keep. "Nothing happened" has two causes
— the event never arrived, or it arrived and matched nothing — and from outside the JVM
they look identical. This is the only thing that tells them apart.

## A library, not a service

Unlike `togetherflow-attachment-gateway`, this cannot be a standalone container. The
event registry dispatches in-process, so a recorder has to run **inside the application
hosting the event registry engine** — normally `flowable-rest`.

That means a deployment using it builds a thin image from the stock one:

```dockerfile
FROM flowable/flowable-rest:latest
COPY togetherflow-event-recorder-8.1.0-SNAPSHOT.jar /app/WEB-INF/lib/
```

...or adds the dependency to whatever application it already builds.

```bash
./mvnw -Ptogetherflow -pl modules/togetherflow-event-recorder package
```

## Configuration

Everything is under `togetherflow.events.recorder`, and **`enabled` defaults to `false`**:
being on the classpath is not consent.

| Property | Default | Notes |
|---|---|---|
| `enabled` | `false` | Nothing is wired until this is `true` |
| `table-name` | `TF_EVENT_RECORD` | Must be a plain SQL identifier; validated, because it is interpolated into SQL and a table name cannot be a bind parameter |
| `store-payload` | `true` | `false` keeps the arrival record but not the contents — see Data protection |
| `max-payload-length` | `4000` | Longer payloads are truncated and the row says so |
| `retention` | `7d` | Rows older than this are purged |
| `purge-interval` | `1h` | Floored at 60s |

Then point Control at it with `TF_EVENT_RECORDER_BASE` (its container) or
`eventRecorder` in `window.__TOGETHERFLOW_CONFIG__`. Unset, the tab does not appear.

## Storage

Its own table, created on first use, in the datasource the host application already has.

Deliberately **not** part of the event registry engine's schema. That schema is versioned:
adding to it means a create script per dialect, an upgrade step per dialect and a
`FlowableVersions` entry, and it would diverge this fork from upstream for a feature
upstream does not have. Dropping `TF_EVENT_RECORD` costs nothing but the history in it.

Column types are the intersection of what every dialect in this repo accepts — `VARCHAR`,
`TIMESTAMP`, `SMALLINT`; no `CLOB`, no `BOOLEAN`. That is why the payload column is a
bounded `VARCHAR` rather than unbounded text.

## Which seam, and why not the obvious one

The obvious hook is `EventRegistryEventConsumer`, which the registry already invites
callers to register. **It cannot serve this feature.** A consumer receives an
`EventRegistryEvent` wrapping an `EventInstance`, and `EventInstance` carries the event
key, tenant and payload but *not the channel*. The channel is known to
`DefaultInboundEventProcessor` and discarded before consumers are called. Since §7.2 asks
for events "received on a channel", that is disqualifying.

So the recorder installs itself as the `InboundEventProcessor`
(`EventRegistry#setInboundEventProcessor`, public API). That seam sees the channel, the
raw payload and the outcome — including the two cases a consumer never sees at all, an
event that resolved to nothing and one the pipeline rejected.

## Limitations — read these before enabling

- **It replaces the inbound event processor rather than wrapping it.** Dispatch is the
  stock behaviour (run the channel's pipeline, hand each event to the consumers, in
  order), but a deployment that has installed its own `InboundEventProcessor` **must not
  enable the recorder** — its processor would be displaced. The installer logs the class
  it replaced at `INFO` so this is visible rather than silent.
- **Events arriving during startup are not recorded.** The engine installs its own
  processor while building itself, so the swap happens after all singletons are
  instantiated. That window is small and is not zero.
- **It adds a write to the path of every inbound event.** This is exactly the cost the
  engine's own design avoids. On a high-throughput channel, consider `store-payload:
  false` and a short retention, or leave it off and switch it on to investigate.
- **A recorder that cannot write loses a diagnostic, never an event.** Every failure to
  record is logged and swallowed (§13.4); event processing continues regardless.
- **No security model of its own.** The endpoint mounts alongside the host application's
  and inherits whatever authentication that enforces. It must sit behind the same ingress
  and the same auth as the engine's own REST API. Do not expose it unauthenticated:
  payloads are readable through it, and an inbound payload is often the least redacted
  data in the system.
- **The endpoint has no tenant boundary, and its default is unfiltered.** `tenantId` is an
  optional query parameter that is applied only when supplied: `JdbcEventRecordStore.query`
  skips a null or blank filter, so `GET /event-recorder/events` with no parameters returns
  **every tenant's rows**. Control always sends the active tenant, but the UI is not the
  boundary — §13.1 is explicit that server-side enforcement must sit behind UI-side
  scoping, and here there is none.

  Note what that means for a fix: it is not enough to validate a caller-supplied
  `tenantId`, because the leak is the request that supplies none. Whatever enforces this
  has to **derive** the tenant from the authenticated principal and apply it whether or
  not the caller asked, which needs the host application's interceptor and is outside this
  module.

  Single-tenant deployments are unaffected. In a multi-tenant one where tenants must not
  read each other's payloads, run `store-payload: false` or leave the recorder undeployed
  until the scope is enforced. (The query is parameter-bound throughout, so this is purely
  an authorization gap — there is no injection issue alongside it.)

## Data protection

Event payloads routinely carry personal data (§13.7). Two controls:
`store-payload: false` records that something arrived on a channel, and when, without
retaining what it said; and `retention` bounds how long anything is kept. Both are
deployment configuration, neither requires a code change, and the default retention is
seven days rather than forever.

## Tests

```bash
./mvnw -Ptogetherflow -pl modules/togetherflow-event-recorder verify
```

21 tests: the JDBC store against H2 (table creation, idempotent restart, paging across
boundaries, deterministic ordering when timestamps collide, filters, retention purge,
that an injected table name is refused, and — pinning the limitation above — that an
unfiltered query returns every tenant), the recording processor (channel
attribution, dispatch order, unresolved and failed payloads, truncation, payload
suppression, and that a broken store does not stop event processing), and the controller's
parameter binding and page-size cap.

**Not verified against a real broker.** Every test drives the processor directly. The
seam itself — that replacing `InboundEventProcessor` on a live engine records real
traffic — has not been exercised against a running Flowable instance with a JMS, Kafka or
RabbitMQ channel attached. Do that before relying on it.
