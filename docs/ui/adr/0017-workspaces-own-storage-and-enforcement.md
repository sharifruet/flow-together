# ADR 0017 — Workspaces own their storage and enforce access server-side

**Status**: Accepted
**Relates to**: ENTERPRISE_PARITY_PLAN.md E0.3 / E5 (W3.1), UI_POLISH_BACKLOG.md §I.10 and
§I.11, REQUIREMENTS.md §13.1 (AuthZ defence in depth), §8 (Multi-tenancy)

## Context

Flowable Design organises everything as **Workspaces → Apps → Models**: a default
workspace per user, a shared workspace of reusable models, public/private visibility, and
workspace- and app-scoped roles (owner, modeler, reader) that decide who may edit,
publish, delete and manage members. TogetherFlow Design has one flat model repository and
a single privilege check in the shell — anyone who can open Design can edit or delete
anything in it.

This is the largest structural difference between the two products (§I.10), and the
permission half of it (§I.11) is a live violation of REQUIREMENTS §13.1: the UI is the
only thing standing between a reader and a delete, and §13.1 says explicitly that
UI-side hiding is never the security boundary.

The plan (E0.3) framed the decision as *"a `metaInfo` convention or new engine surface"*
and refused to estimate E5 until it was answered.

## Decision

**Workspaces are a first-class concept with their own storage and their own server-side
enforcement, in a new optional module — `togetherflow-workspace`.**

Three parts:

1. **Its own tables** (`TF_WORKSPACE`, `TF_WORKSPACE_MEMBER`, `TF_WORKSPACE_MODEL`),
   created on first use in the host's datasource by probing and then issuing
   `CREATE TABLE` — the same mechanism, for the same reasons, as
   [ADR 0015](0015-inbound-event-log.md)'s `TF_EVENT_RECORD`.
2. **A guarded model API.** Design talks to this module for model reads and writes; it
   resolves the caller, checks the workspace role, and only then forwards to
   `flowable-rest` carrying the caller's own credentials. Flowable still applies its own
   auth on top — this adds a check, it does not replace one.
3. **Roles are additive and capability-shaped** — `READER` < `MODELER` < `OWNER` — with
   the capability, not the role name, tested at each call site.

## Alternatives rejected

**A `metaInfo` convention.** Model templates (W2.3) are exactly this, and they work
*because* the engine never reads `metaInfo` — a template flag nobody enforces is
harmless. Workspaces are the opposite case: the entire point is that a reader cannot
delete a model, and a convention the server never checks delivers none of it. W2.3's own
write-up flagged this in advance. Rejected on the grounds that it would look like the
feature while being, precisely, the thing §13.1 forbids.

**Adding to the engine's own schema.** A `Workspace` entity in `flowable-engine` means a
create script for six dialects, an upgrade step per dialect, and a `FlowableVersions`
entry gated by `SqlUpgradeValidationTest` — and it would diverge this fork's *persistent
schema* from upstream for a concept upstream does not have, making every future merge
harder. Same reasoning as ADR 0015, and it applies more strongly here because a workspace
table would be permanent rather than optional.

**A Spring Security filter in front of `flowable-rest`.** Enforces in the right place, but
it would have to re-implement Flowable's URL semantics to know which model a request
touches, and it would apply to every client of the REST API rather than to Design. Kept
as the migration path if this module's limitation below becomes unacceptable.

## Consequences

- **Optional, like the other two side modules.** A deployment that does not run it has
  today's behaviour exactly: one flat library, no workspaces, and Design says so rather
  than showing an empty switcher.
- **The enforcement is real but not absolute, and this is stated plainly rather than
  buried.** It holds only where `flowable-rest` is not independently reachable by the
  browser. A deployment that exposes both gives a determined user a way around it — the
  same shape of caveat as [the attachment gateway's](../../../modules/togetherflow-attachment-gateway/README.md)
  app-only SharePoint auth. The module's README says so, and the network topology that
  makes it true is an operations requirement, not an assumption.
- **Identity comes from the token, not from a header the client sets.** The module
  validates OIDC bearer tokens against the configured issuer (ADR 0006's Keycloak realm)
  and accepts HTTP Basic only for local development, on the same fencing as ADR 0006.
  Trusting a `X-User-Id` header would make the whole check ornamental.
- **Tenancy is not replaced.** `tenantId` still scopes what an engine returns; a workspace
  scopes what a *person* may do inside a tenant. A workspace never spans tenants.

## Revisit when

Upstream Flowable grows a model-authorization concept of its own, or a deployment needs
the guard to hold with `flowable-rest` publicly reachable — at which point the rejected
Spring Security filter becomes the right answer and this module becomes its policy store.
