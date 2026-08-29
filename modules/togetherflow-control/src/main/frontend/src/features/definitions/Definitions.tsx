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
  Badge,
  Modal,
  ApiError,
  AsyncBoundary,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  TextInput,
  useAsync,
  useI18n,
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
  const { t } = useI18n();
  const [tab, setTab] = useState<DefinitionTab>("processes");

  return (
    <section className="tf-panel" aria-label={t("definitions.label")}>
      <header className="tf-panel__header">
        <div>
          <h1 className="tf-panel__title">{t("definitions.title")}</h1>
          <p className="tf-panel__meta">
            Control what can be started, and by whom.
          </p>
        </div>
      </header>

      <div className="tf-chips" role="tablist" aria-label={t("definitions.typeLabel")}>
        {(
          [
            ["processes", t("definitions.type.processes")],
            ["cases", t("definitions.type.cases")],
            ["signals", t("definitions.type.signals")],
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
  const { t } = useI18n();
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
        message: t("definitions.changed", {
          state: definition.suspended
            ? t("definitions.state.activatedPast")
            : t("definitions.state.suspendedPast"),
          name: definition.name ?? definition.key,
        }),
      });
      setRefresh((n) => n + 1);
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : undefined;
      push({
        tone: "error",
        message: apiError?.message ?? t("definitions.changeFailed"),
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
        header: t("definitions.column.process"),
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
        header: t("definitions.column.state"),
        width: "120px",
        render: (definition) =>
          definition.suspended ? (
            <Badge tone="danger">{t("definitions.state.suspended")}</Badge>
          ) : (
            <Badge tone="info">{t("definitions.state.active")}</Badge>
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
              {definition.suspended
                ? t("definitions.action.activate")
                : t("definitions.action.suspend")}
            </Button>
            <Button variant="ghost" onClick={() => setStarterFor(definition)}>
              {t("definitions.starters.action")}
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
            title={t("definitions.empty.process.title")}
            description={t("definitions.empty.process.description")}
          />
        }
      >
        {(page) => (
          <DataTable
            caption={t("definitions.caption.process")}
            columns={columns}
            rows={page.data}
            rowKey={(definition) => definition.id}
          />
        )}
      </AsyncBoundary>

      {starterFor ? (
        <StarterDialog
          title={t("definitions.starters.title", { name: starterFor.name ?? starterFor.key })}
          list={(signal) => repositoryApi.listStarters(starterFor.id, signal)}
          add={(identity) => repositoryApi.addStarter(starterFor.id, identity)}
          remove={(family, id) => repositoryApi.removeStarter(starterFor.id, family, id)}
          onClose={() => setStarterFor(null)}
        />
      ) : null}

      {pendingSuspend ? (
        <Modal
          open
          // `alertdialog`: this interrupts with something that must be resolved, which
          // screen readers announce differently from a dialog the user opened.
          role="alertdialog"
          title={t("definitions.suspend.title")}
          description={`No new instances of "${pendingSuspend.name ?? pendingSuspend.key}" can be started while it is suspended.`}
          size="sm"
          onClose={() => {
            setPendingSuspend(null);
            setCascade(false);
          }}
          actions={
            <>
              <Button
                variant="secondary"
                disabled={busy !== null}
                onClick={() => {
                  setPendingSuspend(null);
                  setCascade(false);
                }}
              >
                {t("dialog.cancel")}
              </Button>
              <Button
                variant="danger"
                loading={busy !== null}
                onClick={() => void toggle(pendingSuspend, cascade)}
              >
                {t("action.suspend")}
              </Button>
            </>
          }
        >
          <label className="tf-checkbox tf-checkbox--block">
            <input
              type="checkbox"
              checked={cascade}
              onChange={(event) => setCascade(event.target.checked)}
            />
            {t("definitions.suspend.cascadeLabel")}
          </label>
          <p className="tf-modal__warning" role="note">
            {cascade ? t("definitions.suspend.cascade") : t("definitions.suspend.noCascade")}
          </p>
        </Modal>
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
  const { t } = useI18n();
  const [starterFor, setStarterFor] = useState<CaseDefinitionResponse | null>(null);

  const { data, error, loading, refetch } = useAsync(
    (signal) => caseApi.listDefinitions({ latest: true, size: 200 }, signal),
    [caseApi],
  );

  const columns = useMemo<Column<CaseDefinitionResponse>[]>(
    () => [
      {
        key: "name",
        header: t("definitions.column.case"),
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
              {t("definitions.starters.action")}
            </Button>
          </div>
        ),
      },
    ],
    [t],
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
          <EmptyState
            title={t("definitions.empty.case.title")}
            description={t("definitions.empty.case.description")}
          />
        }
      >
        {(page) => (
          <DataTable
            caption={t("definitions.caption.case")}
            columns={columns}
            rows={page.data}
            rowKey={(definition) => definition.id}
          />
        )}
      </AsyncBoundary>

      {starterFor ? (
        <StarterDialog
          title={t("definitions.starters.title", { name: starterFor.name ?? starterFor.key })}
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
  const { t } = useI18n();
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
      push({ tone: "success", message: t("definitions.starters.granted", { who: value }) });
      setIdentity("");
      setRefresh((n) => n + 1);
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : undefined;
      push({
        tone: "error",
        message: apiError?.message ?? t("definitions.starters.grantFailed"),
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
      push({ tone: "success", message: t("definitions.starters.revoked") });
      setRefresh((n) => n + 1);
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : undefined;
      push({
        tone: "error",
        message: apiError?.message ?? t("definitions.starters.revokeFailed"),
        reference: apiError?.correlationId,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
        <Modal
      open
      title={title}
      description={
        "With no entries, anyone who can reach the engine may start it. Adding even one " +
        "entry restricts it to those listed."
      }
      size="md"
      onClose={onClose}
      actions={
        <>
<Button variant="secondary" onClick={onClose}>
            {t("action.done")}
          </Button>
        </>
      }
    >


        <AsyncBoundary
          loading={starters.loading}
          error={starters.error}
          data={starters.data}
          onRetry={starters.refetch}
          isEmpty={(rows) => rows.length === 0}
          empty={<p className="tf-muted">{t("definitions.starters.unrestricted")}</p>}
        >
          {(rows) => (
            <ul className="tf-starters">
              {rows.map((link) => (
                <li className="tf-starters__item" key={`${link.user ?? ""}:${link.group ?? ""}`}>
                  <Badge tone="info">
                    {link.user
                      ? t("definitions.starters.user")
                      : t("definitions.starters.group")}
                  </Badge>
                  <span className="tf-starters__name">{link.user ?? link.group}</span>
                  <Button variant="ghost" disabled={busy} onClick={() => void revoke(link)}>
                    {t("action.revoke")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </AsyncBoundary>

        <div className="tf-starters__add">
          <label className="tf-field">
            <span className="tf-field__label">{t("definitions.starters.grantTo")}</span>
            <select
              className="tf-input tf-select"
              value={kind}
              disabled={busy}
              onChange={(event) => setKind(event.target.value as "user" | "group")}
            >
              <option value="user">{t("definitions.starters.user")}</option>
              <option value="group">{t("definitions.starters.group")}</option>
            </select>
          </label>
          <TextInput
            label={
              kind === "user"
                ? t("definitions.starters.userId")
                : t("definitions.starters.groupId")
            }
            value={identity}
            disabled={busy}
            onChange={(event) => setIdentity(event.target.value)}
          />
          <Button loading={busy} disabled={!identity.trim()} onClick={() => void grant()}>
            {t("action.grant")}
          </Button>
        </div>
    </Modal>
  );
}

/* ── Signal broadcast ────────────────────────────────────────────────────── */

function SignalBroadcast({ systemApi }: { systemApi: SystemApi }) {
  const { t } = useI18n();
  const { push } = useToast();
  const [name, setName] = useState("");
  const [async, setAsync] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const broadcast = async () => {
    setBusy(true);
    try {
      await systemApi.broadcastSignal(name.trim(), { async });
      push({ tone: "success", message: t("definitions.signal.sent", { name: name.trim() }) });
      setName("");
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : undefined;
      push({
        tone: "error",
        message: apiError?.message ?? t("definitions.signal.failed"),
        reference: apiError?.correlationId,
      });
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  return (
    <div className="tf-signal">
      <p className="tf-note">{t("definitions.signal.warning")}</p>

      <TextInput
        label={t("definitions.signal.name")}
        value={name}
        disabled={busy}
        hint={t("definitions.signal.hint")}
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
        {t("definitions.signal.action")}
      </Button>

      <ConfirmDialog
        open={confirm}
        title={t("definitions.signal.confirmTitle")}
        description={t("definitions.signal.confirmDescription", { name: name.trim() })}
        confirmLabel={t("definitions.signal.confirm")}
        destructive
        busy={busy}
        onCancel={() => setConfirm(false)}
        onConfirm={() => void broadcast()}
      />
    </div>
  );
}
