# TogetherFlow Workspace

Workspaces and design-time permissions for TogetherFlow Design
([ADR 0017](../../docs/ui/adr/0017-workspaces-own-storage-and-enforcement.md),
ENTERPRISE_PARITY_PLAN.md W3.1).

**Most deployments do not need this yet.** Without it, Design behaves exactly as it does
today: one flat model library, no workspace switcher, and the shell's single privilege
check deciding who may open the app at all.

## Why it exists

Flowable Design organises everything as **Workspaces → Apps → Models**, with owner /
modeler / reader roles deciding who may edit, publish, delete and manage members.
TogetherFlow Design has one flat repository and one privilege check in the shell — so
anyone who can open Design can delete anything in it.

That is not only a parity gap. REQUIREMENTS.md §13.1 says in as many words that hiding a
button is never the security boundary, and until this module exists, hiding the button is
the entire boundary.

## What it does

- **Workspaces** with a key, name, description, visibility (private / public) and an
  optional **shared workspace** — one whose models this one may reference. The link is
  one level deep, matching Flowable Design: a workspace that already shares from another
  cannot be shared *from*, because a chain makes provenance a traversal and a cycle makes
  it a hang.
- **Members** by user *or* group, holding `READER`, `MODELER` or `OWNER`. Groups matter:
  an LDAP-backed identity store (§7.3) has groups nobody can edit, and per-user membership
  would mean re-granting by hand on every directory change.
- **A guarded model API**, mounted on Flowable's own paths (`/repository/models/**`).
  Design changes a base URL and nothing else. Every call resolves the model's workspace,
  checks the caller's role, and only then forwards — carrying the caller's own
  credentials, so Flowable still applies its own auth on top.

Roles are **additive and capability-shaped**: call sites test `Capability.DELETE`, never
`role == OWNER`. A role table will grow — Flowable Design layers custom roles on the
built-in three — and a check written against a role name is the one that silently excludes
a new role that should have passed.

## The limitation, stated rather than buried

**The guard holds only where `flowable-rest` is not itself reachable from the browser.**
A deployment that publishes both gives a determined user a way around it by calling the
engine directly.

That is a network-topology requirement, not an assumption this module can enforce: put the
engine behind the workspace service, or behind the same gateway, and publish only this.
Where that is not possible, the honest description of what you have is a UI that hides
actions the server still permits — which is what §13.1 says is not a boundary.

The migration path is recorded in ADR 0017: a Spring Security filter in front of
`flowable-rest`, with this module as its policy store.

### What is *not* guarded

Only `/repository/models` is proxied. **Deployments are not**: `POST /repository/deployments`
goes straight to the engine, so `Capability.PUBLISH` is enforced in the UI — Design hides
the action — and by Flowable's own auth, but not by this service.

That is deliberate rather than pending. A deployment request carries a file, not a model
id, so this service cannot tell which workspace it belongs to without parsing and matching
the payload, and a guard that decides by guessing is worse than one that says it does not
decide. Enforcing publishing properly means the engine knowing about workspaces, which is
the Spring Security filter path ADR 0017 records.

## Identity

The caller comes from credentials Spring Security validated — an OIDC token's
`preferred_username` (falling back to `sub`), or the HTTP Basic principal in local
development, on the same fencing [ADR 0006](../../docs/ui/adr/0006-oidc-authentication.md)
applies to the apps. Never from a header the client sets: an `X-User-Id` the caller
chooses would make every check here a formality.

The **tenant** is the deliberate exception. It arrives in the `X-Tenant-Id` header the
rest of TogetherFlow already sends, because the engine takes tenancy from the request too.
It scopes; it does not authenticate. The boundary is the role check.

## Storage

Three tables — `TF_WORKSPACE`, `TF_WORKSPACE_MEMBER`, `TF_WORKSPACE_MODEL` — created on
first use in the host's datasource by probing and then issuing `CREATE TABLE`. The same
mechanism, for the same reasons, as the event recorder's
([ADR 0015](../../docs/ui/adr/0015-inbound-event-log.md)): adding to an engine's own schema
would mean a create script and an upgrade step for six dialects, a `FlowableVersions`
entry gated by `SqlUpgradeValidationTest`, and a persistent-schema divergence from upstream
that every future merge would carry.

## Configuration

| Property | Default | Meaning |
|---|---|---|
| `togetherflow.workspace.flowable-base-url` | `http://localhost:8080/flowable-rest/service` | The engine this service guards. |
| `togetherflow.workspace.table-prefix` | `TF_` | Table name prefix. |
| `togetherflow.workspace.unassigned-models-visible` | `true` | What happens to a model in no workspace. |
| `togetherflow.workspace.groups-claim` | `groups` | OIDC claim carrying the caller's groups. |
| `spring.security.oauth2.resourceserver.jwt.issuer-uri` | *(unset)* | Set it for OIDC; unset falls back to Basic. |

### On `unassigned-models-visible`

Every model that exists before this module is first deployed belongs to no workspace, so
the default is **visible**. Failing closed would make an entire existing library vanish on
upgrade — an outage dressed as a security improvement. Turn it off once models are
assigned, and the guard becomes deny-by-default.
