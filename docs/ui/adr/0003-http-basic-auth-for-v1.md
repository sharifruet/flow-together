# ADR 0003 — HTTP Basic for v1 behind a swappable seam; OIDC required before production

Status: **Superseded** by [ADR 0006](0006-oidc-authentication.md) — OIDC is now implemented
and is the default mode. Basic remains available for local development only, and now refuses
to run over plain HTTP outside loopback.
Relates to: REQUIREMENTS.md §11.3, §13.1; IMPLEMENTATION_PLAN.md Phase 0, Phase 7

> This record is kept for the reasoning it captures about why Basic was acceptable as a
> temporary v1 measure, and what constrained it. Do not treat it as current guidance.

## Context

REQUIREMENTS.md §13.1 is explicit that production deployments should authenticate with OIDC,
not HTTP Basic, and that this repo already has the pieces: the `flowable-spring-security`
module and a checked-in Keycloak realm config at `docker/config/keycloak-flowable.json`
targeting `flowable-rest`.

Phase 1 needed a working sign-in to demonstrate the golden path end to end. Standing up
Keycloak, wiring the authorization-code flow, handling token refresh and configuring the
engine as a resource server is materially more work than Basic, and none of it changes what
the rest of the UI looks like.

## Decision

Ship HTTP Basic for v1, with the auth mechanism isolated behind a single seam so replacing
it does not touch feature code:

- `ApiClient` takes a `getAuthHeaders` callback; it knows nothing about how credentials are
  obtained.
- `AuthProvider` owns the credential lifecycle and exposes only `session` / `signIn` /
  `signOut`. No component reads credentials directly.
- Credentials are held **in memory only** — never `localStorage`, never a cookie — so an XSS
  cannot read them back out of storage. The cost is that a page reload requires signing in
  again; that is accepted for v1 and disappears with OIDC.

**This decision is time-limited. OIDC must replace it before the first production
deployment** — it is a Phase 7 gate item (IMPLEMENTATION_PLAN.md), not an optional
improvement.

## Alternatives considered

- **OIDC from day one** — correct end state, and the repo has prior art for it. Deferred
  because it would have blocked Phase 1's golden path on infrastructure work with no effect
  on any screen. The seam above is what makes deferring safe rather than reckless.
- **Basic with credentials in `localStorage`** — would survive reloads, and was rejected:
  it puts long-lived credentials somewhere script-readable, which is precisely the §13.1
  failure mode.

## Consequences

- Sign-in works today; the golden path is demonstrable end to end.
- **Basic auth sends reusable credentials on every request.** Over plain HTTP that is
  trivially interceptable, so any deployment beyond a local developer machine must terminate
  TLS in front of the app. This is a genuine limitation of the current state, not a
  theoretical one.
- No SSO, no token expiry, no refresh, no central revocation. A signed-in session ends only
  when the tab is closed or the user signs out.
- A page reload loses the session.
- Migration cost is contained to `AuthProvider` plus whatever obtains tokens; `ApiClient`
  and every feature component are unaffected by design.

## Revisit when

Before any deployment that is not a local developer machine — and no later than Phase 7's
security review. The migration should start from the existing
`flowable-spring-security` / Keycloak integration rather than a new design.
