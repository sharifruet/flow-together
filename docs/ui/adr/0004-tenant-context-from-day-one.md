# ADR 0004 — Thread tenant context through every query from Phase 1

Status: Accepted
Relates to: REQUIREMENTS.md §8 (multi-tenancy), §7.5, §11.9

## Context

Nearly every Flowable query/collection resource accepts a `tenantId` filter. REQUIREMENTS.md
§8 flags multi-tenancy as one of two things that are expensive to retrofit (the other being
i18n), because it touches every list component ever written.

It was not settled whether one logged-in user ever needs access to more than one tenant.

## Decision

Introduce `TenantContext` in Phase 1 and read the active tenant inside the API resource
wrappers, so call sites never pass it explicitly. The shell renders a tenant switcher only
when more than one tenant is available, so a single-tenant deployment shows no extra UI.

## Alternatives considered

- **Defer until multi-tenancy is actually required** — rejected. The cost is not the
  switcher; it is that every list/query component written without a tenant parameter has to
  be revisited. Building the seam now is cheap; adding it to four apps later is not.
- **Pass `tenantId` explicitly at each call site** — rejected as the thing most likely to be
  forgotten in exactly the query where it matters.

## Consequences

- Tenant filtering is applied centrally in `TaskApi` / `ProcessApi` / `HistoryApi`; a new
  resource wrapper must remember to include it, which is one place rather than many.
- The open question of whether a user spans tenants (§11.9) stays open without blocking
  anything: the context supports both shapes.
- Not yet verified against a genuinely multi-tenant engine. That verification belongs with
  the first real multi-tenant deployment.
