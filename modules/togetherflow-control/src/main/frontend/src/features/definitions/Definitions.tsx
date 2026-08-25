/**
 * Definitions (REQUIREMENTS.md §7.2).
 *
 * Three admin capabilities that had REST wrappers but no screen:
 *
 * - **Suspend / activate a process definition.** Only BPMN supports this; §7.2 records
 *   that the CMMN and DMN REST layers expose no equivalent, so the case tab shows state
 *   but offers no toggle rather than presenting a control that always fails.
 * - **Authorized starters** — which users and groups may start a given process or case.
 *   Both engines expose the same identity-link shape on their own base URLs.
 * - **Broadcast a signal**, the escape hatch for an instance waiting on an event that
 *   never arrived from outside.
 */

import { useMemo, useState } from "react";
import {
  ApiError,
  AsyncBoundary,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  TextInput,
  useAsync,
  useToast,
  type CaseApi,
  type CaseDefinitionAccessApi,
  type CaseDefinitionResponse,
  type Column,
  type ProcessDefinitionResponse,
  type RepositoryApi,
  type RestIdentityLink,
  type SystemApi,
} from "@togetherflow/common";

type DefinitionTab = "processes" | "cases" | "signals";

export interface DefinitionsProps {
  repositoryApi: RepositoryApi;
  caseApi: CaseApi;
  caseAccessApi: CaseDefinitionAccessApi;
  systemApi: SystemApi;
}

export function Definitions({
  repositoryApi,
  caseApi,
  caseAccessApi,
  systemApi,
}: DefinitionsProps) {
  const [tab, setTab] = useState<DefinitionTab>("processes");

  return (
    <section className="tf-section" aria-label="Definitions">
      <header className="tf-section__header">
        <div>
          <h1 className="tf-section__title">Definitions</h1>
          <p className="tf-section__meta">
            Control what can be started, and by whom.
          </p>
        </div>
      </header>

      <div className="tf-chips" role="tablist" aria-label="Definition type">
        {(
          [
            ["processes", "Processes"],
            ["cases", "Cases"],
            ["signals", "Signals"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={["tf-chip", tab === value ? "tf-chip--active" : ""]
              .filter(Boolean)
              .join(" ")}
            onClick={() => setTab(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "processes" ? (
        <ProcessDefinitions repositoryApi={repositoryApi} />
      ) : tab === "cases" ? (
        <CaseDefinitions caseApi={caseApi} caseAccessApi={caseAccessApi} />
      ) : (
        <SignalBroadcast systemApi={systemApi} />
      )}
    </section>
  );
}

/* ── Process definitions ─────────────────────────────────────────────────── */

function ProcessDefinitions({ repositoryApi }: { repositoryApi: RepositoryApi }) {
  const { push } = useToast();
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [pendingSuspend, setPendingSuspend] = useState<ProcessDefinitionResponse | null>(null);
  const [cascade, setCascade] = useState(false);
  const [starterFor, setStarterFor] = useState<ProcessDefinitionResponse | null>(null);

  const { data, error, loading, refetch } = useAsync(
    // `suspended` is deliberately left unset: this screen must show both.
    (signal) => repositoryApi.listProcessDefinitions({ latest: true, size: 200 }, signal),
    [repositoryApi, refresh],
  );

  const toggle = async (definition: ProcessDefinitionResponse, includeInstances: boolean) => {
    setBusy(definition.id);
    try {
      await repositoryApi.setDefinitionSuspended(
        definition.id,
        !definition.suspended,
        includeInstances,
      );
      push({
        tone: "success",
        message: `${definition.suspended ? "Activated" : "Suspended"} "${definition.name ?? definition.key}".`,
      });
      setRefresh((n) => n + 1);
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : undefined;
      push({
        tone: "error",
        message: apiError?.message ?? "Could not change that definition.",
        reference: apiError?.correlationId,
      });
    } finally {
      setBusy(null);
      setPendingSuspend(null);
      setCascade(false);
    }
  };

  const columns = useMemo<Column<ProcessDefinitionResponse>[]>(
    () => [
      {
        key: "name",
        header: "Process",
        render: (definition) => (
          <div className="tf-task-cell">
            <span className="tf-task-cell__name">{definition.name ?? definition.key}</span>
            <span className="tf-task-cell__description">
              {definition.key} · v{definition.version}
            </span>
          </div>
        ),
      },
      {
        key: "state",
        header: "State",
        width: "120px",
        render: (definition) =>
          definition.suspended ? (
            <span className="tf-badge tf-badge--danger">Suspended</span>
          ) : (
            <span className="tf-badge tf-badge--running">Active</span>
          ),
      },
      {
        key: "actions",
        header: "",
        width: "260px",
        render: (definition) => (
          <div className="tf-row-actions">
            <Button
              variant="secondary"
              loading={busy === definition.id}
              onClick={() =>
                definition.suspended ? void toggle(definition, false) : setPendingSuspend(definition)
              }
            >
              {definition.suspended ? "Activate" : "Suspend"}
            </Button>
            <Button variant="ghost" onClick={() => setStarterFor(definition)}>
              Who can start
            </Button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busy],
  );

  return (
    <>
      <AsyncBoundary
        loading={loading}
        error={error}
        data={data}
        onRetry={refetch}
        isEmpty={(page) => page.data.length === 0}
        empty={
          <EmptyState
            title="No process definitions"
            description="Deploy a process to manage it here."
          />
        }
      >
        {(page) => (
          <DataTable
            caption="Process definitions"
            columns={columns}
            rows={page.data}
            rowKey={(definition) => definition.id}
          />
        )}
      </AsyncBoundary>

      {starterFor ? (
        <StarterDialog
          title={`Who can start "${starterFor.name ?? starterFor.key}"`}
          list={(signal) => repositoryApi.listStarters(starterFor.id, signal)}
          add={(identity) => repositoryApi.addStarter(starterFor.id, identity)}
          remove={(family, id) => repositoryApi.removeStarter(starterFor.id, family, id)}
          onClose={() => setStarterFor(null)}
        />
      ) : null}

      {pendingSuspend ? (
        <div
          className="tf-dialog-backdrop"
          onMouseDown={() => {
            setPendingSuspend(null);
            setCascade(false);
          }}
        >
          <div
            className="tf-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-label="Suspend process definition"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2 className="tf-dialog__title">Suspend this process definition?</h2>
            <p className="tf-dialog__description">
              No new instances of "{pendingSuspend.name ?? pendingSuspend.key}" can be
              started while it is suspended.
            </p>
            <label className="tf-checkbox tf-checkbox--block">
              <input
                type="checkbox"
                checked={cascade}
                onChange={(event) => setCascade(event.target.checked)}
              />
              Also suspend instances that are already running
            </label>
            <p className="tf-dialog__warning" role="note">
              {cascade
                ? "Running instances stop progressing until the definition is activated again."
                : "Instances already running keep going; only new ones are blocked."}
            </p>
            <div className="tf-dialog__actions">
              <Button
                variant="secondary"
                disabled={busy !== null}
                onClick={() => {
                  setPendingSuspend(null);
                  setCascade(false);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                loading={busy !== null}
                onClick={() => void toggle(pendingSuspend, cascade)}
              >
                Suspend
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

/* ── Case definitions ────────────────────────────────────────────────────── */

function CaseDefinitions({
  caseApi,
  caseAccessApi,
}: {
  caseApi: CaseApi;
  caseAccessApi: CaseDefinitionAccessApi;
}) {
  const [starterFor, setStarterFor] = useState<CaseDefinitionResponse | null>(null);

  const { data, error, loading, refetch } = useAsync(
    (signal) => caseApi.listDefinitions({ latest: true, size: 200 }, signal),
    [caseApi],
  );

  const columns = useMemo<Column<CaseDefinitionResponse>[]>(
    () => [
      {
        key: "name",
        header: "Case",
        render: (definition) => (
          <div className="tf-task-cell">
            <span className="tf-task-cell__name">{definition.name ?? definition.key}</span>
            <span className="tf-task-cell__description">
              {definition.key} · v{definition.version}
            </span>
          </div>
        ),
      },
      {
        key: "actions",
        header: "",
        width: "180px",
        render: (definition) => (
          <div className="tf-row-actions">
            <Button variant="ghost" onClick={() => setStarterFor(definition)}>
              Who can start
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <>
      <p className="tf-note">
        Case definitions cannot be suspended: this repo's CMMN REST layer exposes
        suspend/activate only for process definitions (§7.2).
      </p>

      <AsyncBoundary
        loading={loading}
        error={error}
        data={data}
        onRetry={refetch}
        isEmpty={(page) => page.data.length === 0}
        empty={
          <EmptyState title="No case definitions" description="Deploy a case to manage it here." />
        }
      >
        {(page) => (
          <DataTable
            caption="Case definitions"
            columns={columns}
            rows={page.data}
            rowKey={(definition) => definition.id}
          />
        )}
      </AsyncBoundary>

      {starterFor ? (
        <StarterDialog
          title={`Who can start "${starterFor.name ?? starterFor.key}"`}
          list={(signal) => caseAccessApi.listStarters(starterFor.id, signal)}
          add={(identity) => caseAccessApi.addStarter(starterFor.id, identity)}
          remove={(family, id) => caseAccessApi.removeStarter(starterFor.id, family, id)}
          onClose={() => setStarterFor(null)}
        />
      ) : null}
    </>
  );
}

/* ── Authorized starters ─────────────────────────────────────────────────── */

function StarterDialog({
  title,
  list,
  add,
  remove,
  onClose,
}: {
  title: string;
  list: (signal?: AbortSignal) => Promise<RestIdentityLink[]>;
  add: (identity: { user?: string; group?: string }) => Promise<unknown>;
  remove: (family: "users" | "groups", id: string) => Promise<void>;
  onClose: () => void;
}) {
  const { push } = useToast();
  const [refresh, setRefresh] = useState(0);
  const [kind, setKind] = useState<"user" | "group">("user");
  const [identity, setIdentity] = useState("");
  const [busy, setBusy] = useState(false);

  const starters = useAsync((signal) => list(signal), [refresh]);

  const grant = async () => {
    const value = identity.trim();
    if (!value) return;
    setBusy(true);
    try {
      await add(kind === "user" ? { user: value } : { group: value });
      push({ tone: "success", message: `${value} can now start it.` });
      setIdentity("");
      setRefresh((n) => n + 1);
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : undefined;
      push({
        tone: "error",
        message: apiError?.message ?? "Could not grant that.",
        reference: apiError?.correlationId,
      });
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (link: RestIdentityLink) => {
    setBusy(true);
    try {
      await remove(link.user ? "users" : "groups", (link.user ?? link.group)!);
      push({ tone: "success", message: "Access revoked." });
      setRefresh((n) => n + 1);
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : undefined;
      push({
        tone: "error",
        message: apiError?.message ?? "Could not revoke that.",
        reference: apiError?.correlationId,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tf-dialog-backdrop" onMouseDown={onClose}>
      <div
        className="tf-dialog tf-dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="tf-dialog__title">{title}</h2>
        <p className="tf-dialog__description">
          With no entries, anyone who can reach the engine may start it. Adding even one
          entry restricts it to those listed.
        </p>

        <AsyncBoundary
          loading={starters.loading}
          error={starters.error}
          data={starters.data}
          onRetry={starters.refetch}
          isEmpty={(rows) => rows.length === 0}
          empty={<p className="tf-muted">Unrestricted — no starters are listed.</p>}
        >
          {(rows) => (
            <ul className="tf-starters">
              {rows.map((link) => (
                <li className="tf-starters__item" key={`${link.user ?? ""}:${link.group ?? ""}`}>
                  <span className="tf-badge tf-badge--running">
                    {link.user ? "User" : "Group"}
                  </span>
                  <span className="tf-starters__name">{link.user ?? link.group}</span>
                  <Button variant="ghost" disabled={busy} onClick={() => void revoke(link)}>
                    Revoke
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </AsyncBoundary>

        <div className="tf-starters__add">
          <label className="tf-field">
            <span className="tf-field__label">Grant to</span>
            <select
              className="tf-input tf-select"
              value={kind}
              disabled={busy}
              onChange={(event) => setKind(event.target.value as "user" | "group")}
            >
              <option value="user">User</option>
              <option value="group">Group</option>
            </select>
          </label>
          <TextInput
            label={kind === "user" ? "User id" : "Group id"}
            value={identity}
            disabled={busy}
            onChange={(event) => setIdentity(event.target.value)}
          />
          <Button loading={busy} disabled={!identity.trim()} onClick={() => void grant()}>
            Grant
          </Button>
        </div>

        <div className="tf-dialog__actions">
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ── Signal broadcast ────────────────────────────────────────────────────── */

function SignalBroadcast({ systemApi }: { systemApi: SystemApi }) {
  const { push } = useToast();
  const [name, setName] = useState("");
  const [async, setAsync] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const broadcast = async () => {
    setBusy(true);
    try {
      await systemApi.broadcastSignal(name.trim(), { async });
      push({ tone: "success", message: `Broadcast "${name.trim()}".` });
      setName("");
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : undefined;
      push({
        tone: "error",
        message: apiError?.message ?? "Could not broadcast that signal.",
        reference: apiError?.correlationId,
      });
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  return (
    <div className="tf-signal">
      <p className="tf-note">
        Broadcasting reaches <strong>every</strong> instance waiting on this signal, across
        the whole engine. Use it to unblock instances waiting on an event that never
        arrived from outside.
      </p>

      <TextInput
        label="Signal name"
        value={name}
        disabled={busy}
        hint="Must match the signal name in the model exactly."
        onChange={(event) => setName(event.target.value)}
      />
      <label className="tf-checkbox tf-checkbox--block">
        <input
          type="checkbox"
          checked={async}
          disabled={busy}
          onChange={(event) => setAsync(event.target.checked)}
        />
        Deliver asynchronously (returns immediately; delivery happens in a job)
      </label>

      <Button loading={busy} disabled={!name.trim()} onClick={() => setConfirm(true)}>
        Broadcast signal
      </Button>

      <ConfirmDialog
        open={confirm}
        title="Broadcast this signal?"
        description={`Every instance in the engine waiting on "${name.trim()}" will receive it. This cannot be undone.`}
        confirmLabel="Broadcast"
        destructive
        busy={busy}
        onCancel={() => setConfirm(false)}
        onConfirm={() => void broadcast()}
      />
    </div>
  );
}
