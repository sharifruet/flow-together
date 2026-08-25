# ADR 0006 — OIDC Authorization Code + PKCE as the production auth mechanism

Status: Accepted
Supersedes: [ADR 0003](0003-http-basic-auth-for-v1.md)
Relates to: REQUIREMENTS.md §11.3, §13.1

## Context

ADR 0003 shipped HTTP Basic for v1 as an explicitly time-limited decision, with the
requirement that OIDC replace it before any production deployment. That deadline is now
being met.

The repo already had a Keycloak realm at `docker/config/keycloak-flowable.json`, but its
only client (`flowable-client`) is **confidential** — it holds a client secret. A browser
application cannot keep a secret, so that client could not be reused.

## Decision

Authorization Code flow with PKCE, against a **new public client** (`togetherflow-ui`)
added to the checked-in realm with `pkce.code.challenge.method = S256`, direct access
grants disabled, and implicit flow disabled.

Implemented with **`oidc-client-ts`** rather than hand-rolled. PKCE challenge generation,
`state`/`nonce` validation, token renewal and clock-skew handling are precisely the places
a bespoke OAuth implementation fails quietly and insecurely; this is not a place to save a
dependency.

Key properties:

- **Tokens live in memory.** `userStore` is left unset, so no access or refresh token is
  written to `localStorage` or `sessionStorage` where an XSS could read it. Only the
  short-lived PKCE verifier and nonce are persisted in `sessionStorage`, for the duration
  of one redirect round trip.
- **Silent renewal** is enabled with a 60-second pre-expiry window, so a long working
  session is not interrupted mid-task.
- **Sign-out ends the IdP session** via `signoutRedirect`, not just the local one —
  otherwise the next sign-in silently reuses the existing session and "sign out" appears
  broken.
- **Auth mode is runtime configuration**, not a build flag: `window.__TOGETHERFLOW_CONFIG__.auth.mode`,
  written by the container entrypoint from environment variables. One image is promoted
  across environments.
- **Misconfiguration fails loudly.** If mode is `oidc` and authority/clientId are absent,
  the app refuses to start rather than silently falling back to Basic — a deployment must
  not be able to quietly downgrade its own authentication. The container entrypoint applies
  the same check and exits non-zero.

## Basic auth is retained, but fenced in

`mode: "basic"` still exists for local development against a bare `flowable-rest`. It now
**throws at startup unless the page is served over HTTPS or from loopback**, because Basic
replays a reusable credential on every request. The login screen labels it as development
sign-in.

## Alternatives considered

- **Hand-rolled PKCE** — no dependency, but the failure modes are silent and security
  relevant. Rejected.
- **Reuse the confidential `flowable-client`** — impossible without either leaking the
  secret into the browser or introducing a backend-for-frontend to hold it.
- **A backend-for-frontend holding tokens in an httpOnly cookie** — arguably the strongest
  option, and it eliminates token-in-JS entirely. Rejected for now because it introduces a
  new server component to build, deploy and operate; in-memory tokens plus a strict CSP is
  a defensible position. This is the natural next step if the threat model tightens.

## Consequences

- SSO, central revocation, token expiry and refresh all work.
- A page reload no longer loses the session (an existing IdP session is picked up silently).
- The deployment now depends on an identity provider being reachable; if it is down, nobody
  can sign in. That is the normal trade for centralised identity.
- `redirectUris` and `webOrigins` in the realm config are localhost-scoped for development.
  **A real deployment must add its own origins** — this is deployment configuration, not
  something the checked-in realm can know.
- Tokens are in JS memory, so a successful XSS could exfiltrate the current access token
  (though not a refresh token from storage, and not across a reload). The strict CSP shipped
  in the container image is the mitigating control.
