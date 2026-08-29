# ADR 0018 — Git connectivity lives in the workspace service, and syncs a workspace

**Status**: Accepted
**Relates to**: ENTERPRISE_PARITY_PLAN.md E6 / W3.2, UI_POLISH_BACKLOG.md §I.12,
[ADR 0017](0017-workspaces-own-storage-and-enforcement.md)

## Context

Flowable Design connects an **app** to a Git repository and offers commit, pull, revert,
branch, PR, stash and a per-model diff. TogetherFlow has no source-control story at all:
models live only in the engine's database, and the only way out is a per-model file
download.

The parity plan made W3.2 depend on W3.1 for a reason — "apps must be a real container
before they can be a repository unit". After W3.1 the container exists, but it is a
**workspace**, not an app: this fork's "app" is a deployable bundle assembled from models
(§7.4.5), created and republished, whereas a workspace is the durable grouping people
actually work in.

## Decision

**Git syncs a workspace, and lives in `togetherflow-workspace` rather than in a service
of its own.**

The unit is the workspace because that is what has stable membership, a stable identity
and a stable set of models. Syncing an app would mean re-deriving the file set every time
a bundle changed its contents, and two apps sharing a model would each claim it.

It lives in the existing service because every Git operation needs the
workspace→model mapping and the role check that already live there. A separate service
would have to duplicate both, or call back into this one for every file it writes.

**One working copy per workspace, on disk, owned by the service.** Operations are
export-commit-push and pull-import; the engine's database stays the source of truth for
what Design edits, and the checkout is a materialisation of it.

**Files are named from the model key, not its id.** `invoice-approval.bpmn20.xml`, not
`f8a1c2…`. A repository full of UUIDs is unreviewable, and review is most of the point.
A `togetherflow-manifest.json` beside them carries the id, name and category, so a pull
knows which model a file belongs to without parsing it.

## Alternatives rejected

**A separate `togetherflow-git` service.** Rejected on the duplication above. Revisit if
Git work ever needs to scale independently of permission checks, which it does not today.

**Syncing per app.** Rejected above: apps are bundles, not containers.

**Committing the engine's export format.** The deployment bundle (§7.4.5) carries no
keys, versions or draft metadata, so a round trip through it loses exactly what an author
cares about — the same reason W2.3 gave for not reusing it for app export/import.

## Consequences

- **Credentials are service-level, not per workspace.** One username/token pair from
  configuration applies to every remote. Per-workspace credentials would mean storing
  other people's tokens in this service's database, which is a materially larger thing to
  get wrong than a config value; a deployment that genuinely needs several identities
  runs several instances, the same answer W2.3's SharePoint scoping gave.
- **Pull rewrites drafts.** Importing a branch replaces the source of every model whose
  key it carries. That is what pulling means, and the editors' concurrent-edit guard (I1)
  will refuse a save made against the pre-pull content rather than silently clobbering it.
- **No pull requests, and no stash.** A PR is provider API surface — GitHub's, GitLab's,
  Bitbucket's, each different — and this fork has no provider abstraction to hang it on.
  Stash is expressible in JGit but earns little next to committing on a branch. Both are
  listed as not built rather than half-built.
- **The remote is whatever JGit can reach**, including a `file://` path — which is what
  makes the whole thing testable here without a hosted service.

## Revisit when

A deployment needs per-workspace credentials, or a provider integration (PR creation)
becomes worth a provider abstraction.
