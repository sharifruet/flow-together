# ADR 0014 — Retry only safe requests; report crashes through a transport-agnostic sink

**Status**: Accepted
**Relates to**: REQUIREMENTS.md §13.2 (Observability), §13.4 (Resilience)

## Context

Two production-readiness requirements had been recorded but not built.

§13.4: "retry-with-backoff on transient API failures (not on failed business operations —
don't retry a rejected task-completion), request timeouts surfaced to the user rather than
an indefinite spinner."

§13.2: "unhandled exceptions and API failures captured with enough context (route, user
role, request id) to debug without asking the user to reproduce it — not just a browser
console log."

Neither existed. `ApiClient` issued a single `fetch` with no deadline, so a connection
that hung produced a spinner that never resolved and an error nobody could describe. And
a single render throw unmounted the whole tree, leaving a white page — the failure mode a
user genuinely cannot report.

## Decision

**Retry is scoped by method, not by status.** Only GET/HEAD/OPTIONS retry by default,
because the engine's action endpoints are not idempotent: completing a task twice
completes two tasks. A caller may force it per request for something genuinely
idempotent, and a `FormData` body never replays regardless — it is a one-shot stream.
Retryable failures are the ones that say nothing about the request itself: no response at
all, a timeout, or 408/425/429/502/503/504. Backoff is exponential with full jitter, and
honours `Retry-After` when the server sends one.

**Every request carries a deadline**, defaulting to 30s, composed with the caller's own
`AbortSignal` by a small helper rather than `AbortSignal.any`/`AbortSignal.timeout` —
those lose the distinction between "the user navigated away" and "the server never
answered", and reporting a cancelled request to the user as a timeout is wrong.

**One correlation id spans all attempts of a logical request**, so an operator chasing the
reference a user quoted finds every try rather than only the last.

**Error reporting is transport-agnostic.** `configureErrorReporting` takes an optional
endpoint; reports are delivered with `navigator.sendBeacon` (which survives the page
closing, exactly when a crash report is most likely to be lost) and fall back to
`fetch(keepalive)`. With no endpoint configured, reports still reach the console.

**A React error boundary sits inside every app**, mounted by `AppRoot`, reporting the
crash and rendering a recovery screen with retry and reload.

## Alternatives weighed

- **Sentry's SDK.** The obvious choice for §13.2, and it would bring session replay,
  breadcrumbs and release health for free. Rejected as a *default*: it is a substantial
  dependency in every bundle, it requires a DSN to be useful at all, and a fresh install
  of this product would then either carry dead weight or ship telemetry nobody asked for.
  The endpoint hook means a deployment that wants Sentry points at a Sentry tunnel and
  gets it, without every other deployment paying for it.
- **Retrying on status alone, mutations included.** Simpler to implement and strictly
  worse: §13.4 names a rejected task-completion specifically, and duplicate side effects
  are the failure a resilience feature must not introduce.
- **A global fetch wrapper outside `ApiClient`.** Would have caught calls that bypass the
  client. There are none — every call goes through it — and a monkey-patched global is
  harder to reason about in tests than a constructor option.

## Consequences

- **A retried GET can still be served stale by an intermediary.** Acceptable: these are
  list and detail reads that the UI refetches anyway.
- **Timeouts are a per-attempt deadline, not a total budget.** Three attempts against a
  server that hangs can take 90s before failing. A total budget would be tighter, but it
  makes the failure message harder to write honestly — "the server took too long" is true
  of one attempt in a way it is not of a sum.
- **401/403/404 are never reported.** They are the auth layer working and stale links
  respectively; reporting them buries real faults in volume.
- **Reports are capped and deduplicated per session** (25 reports, 10s dedupe window), so
  a render loop cannot turn one fault into a request flood.
- **Nothing in the reporting path may throw.** Every entry point is wrapped: a failure
  inside error reporting that surfaces to the caller turns one fault into two.
