/**
 * Case instances (REQUIREMENTS.md §7.2).
 *
 * The operator's view of a running case, as opposed to Work's participant view:
 *
 * - **Every plan item action the engine accepts is offered here**, including triggering
 *   an active human task. Verified against a running engine: that completes the task,
 *   bypassing its form and assignee. In Work that would be a way to skip your own form;
 *   here it is the intended escape hatch for a case stuck on a task nobody can action,
 *   so this screen opts in explicitly and labels it as forcing.
 * - **Terminate and delete are different things** and both are offered. Terminate ends
 *   the case and keeps its history; delete removes it outright.
 * - The diagram is only shown when the definition actually carries CMMNDI. Hand-written
 *   `.cmmn` files usually do not, and the engine answers 400 for those.
 */

import { useMemo, useState } from "react";
import {
  ApiError,
  AsyncBoundary,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  NoResultsState,
  Pagination,
  availablePlanItemActions,
  formatDateTime,
  useAsync,
  useDebouncedValue,
  useToast,
  type CaseApi,
  type CaseInstanceResponse,
  type Column,
  type PlanItemAction,
  type PlanItemInstanceResponse,
} from "@togetherflow/common";

const PAGE_SIZE = 25;

const ACTION_LABELS: Record<PlanItemAction, string> = {
  start: "Start",
  enable: "Enable",
  disable: "Disable",
  trigger: "Force complete",
};

export interface CaseInstancesProps {
  caseApi: CaseApi;
}

export function CaseInstances({ caseApi }: CaseInstancesProps) {
  const [start, setStart] = useState(0);
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search).trim();
  const [selected, setSelected] = useState<CaseInstanceResponse | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const query = useMemo(
    () => ({ start, size: PAGE_SIZE, ...(debounced ? { businessKey: debounced } : {}) }),
    [start, debounced],
  );

  const { data, error, loading, refetch } = useAsync(
    (signal) => caseApi.query(query, signal),
    [caseApi, query, reloadToken],
  );

  const columns = useMemo<Column<CaseInstanceResponse>[]>(
    () => [
      {
        key: "name",
        header: "Case",
        render: (instance) => (
          <div className="tf-task-cell">
            <span className="tf-task-cell__name">
              {instance.name || instance.caseDefinitionName || instance.id}
            </span>
            <span className="tf-task-cell__description">
              {instance.businessKey ? `Ref ${instance.businessKey} · ` : ""}
              {instance.id.slice(0, 8)}
            </span>
          </div>
        ),
      },
      {
        key: "state",
        header: "State",
        width: "110px",
        render: (instance) => (
          <span className="tf-badge tf-badge--running">{instance.state ?? "active"}</span>
        ),
      },
      {
        key: "started",
        header: "Started",
        width: "180px",
        secondary: true,
        render: (instance) => formatDateTime(instance.startTime),
      },
      {
        key: "actions",
        header: "",
        width: "110px",
        render: (instance) => (
          <Button variant="ghost" onClick={() => setSelected(instance)}>
            Inspect
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <section className="tf-section" aria-label="Case instances">
      <header className="tf-section__header">
        <div>
          <h1 className="tf-section__title">Case instances</h1>
          <p className="tf-section__meta">Running cases across the engine.</p>
        </div>
        <div className="tf-section__search">
          <label className="tf-visually-hidden" htmlFor="tf-case-instance-search">
            Search cases by reference
          </label>
          <input
            id="tf-case-instance-search"
            className="tf-input"
            type="search"
            placeholder="Search by reference…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setStart(0);
            }}
          />
        </div>
      </header>

      <AsyncBoundary
        loading={loading}
        error={error}
        data={data}
        onRetry={refetch}
        isEmpty={(page) => page.data.length === 0}
        empty={
          debounced ? (
            <NoResultsState
              onClear={() => {
                setSearch("");
                setStart(0);
              }}
            />
          ) : (
            <EmptyState
              title="No running cases"
              description="Cases started from a deployed case definition appear here."
            />
          )
        }
      >
        {(page) => (
          <>
            <DataTable
              caption="Case instances"
              columns={columns}
              rows={page.data}
              rowKey={(instance) => instance.id}
              onRowClick={setSelected}
              selectedKey={selected?.id}
            />
            <Pagination
              start={page.start}
              size={page.size || PAGE_SIZE}
              total={page.total}
              onChange={setStart}
            />
          </>
        )}
      </AsyncBoundary>

      {selected ? (
        <CaseInspector
          caseApi={caseApi}
          instance={selected}
          onClose={() => setSelected(null)}
          onChanged={() => setReloadToken((n) => n + 1)}
        />
      ) : null}
    </section>
  );
}

/* ── Inspector ───────────────────────────────────────────────────────────── */

function CaseInspector({
  caseApi,
  instance,
  onClose,
  onChanged,
}: {
  caseApi: CaseApi;
  instance: CaseInstanceResponse;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { push } = useToast();
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<
    { item: PlanItemInstanceResponse; action: PlanItemAction } | null
  >(null);
  const [pendingEnd, setPendingEnd] = useState<"terminate" | "delete" | null>(null);

  const planItems = useAsync(
    async (signal) => (await caseApi.listPlanItems(instance.id, signal)).data,
    [caseApi, instance.id, refresh],
  );
  const stages = useAsync(
    (signal) => caseApi.stageOverview(instance.id, signal),
    [caseApi, instance.id, refresh],
  );
  const variables = useAsync(
    (signal) => caseApi.listVariables(instance.id, signal),
    [caseApi, instance.id, refresh],
  );

  const run = async (item: PlanItemInstanceResponse, action: PlanItemAction) => {
    setBusy(item.id);
    try {
      await caseApi.performPlanItemAction(item.id, action);
      push({ tone: "success", message: `${ACTION_LABELS[action]}: ${item.name ?? item.id}.` });
      setRefresh((n) => n + 1);
      onChanged();
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : undefined;
      push({
        tone: "error",
        message: apiError?.message ?? "That action was rejected.",
        reference: apiError?.correlationId,
      });
    } finally {
      setBusy(null);
      setPending(null);
    }
  };

  const endCase = async (mode: "terminate" | "delete") => {
    setBusy("case");
    try {
      await (mode === "terminate" ? caseApi.terminate(instance.id) : caseApi.delete(instance.id));
      push({
        tone: "success",
        message: mode === "terminate" ? "Case terminated." : "Case deleted.",
      });
      onChanged();
      onClose();
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : undefined;
      push({
        tone: "error",
        message: apiError?.message ?? `Could not ${mode} that case.`,
        reference: apiError?.correlationId,
      });
    } finally {
      setBusy(null);
      setPendingEnd(null);
    }
  };

  return (
    <div className="tf-dialog-backdrop" onMouseDown={onClose}>
      <div
        className="tf-dialog tf-dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-label={`Case ${instance.name ?? instance.id}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="tf-dialog__title">
          {instance.name || instance.caseDefinitionName || "Case instance"}
        </h2>
        <p className="tf-dialog__description">
          {instance.businessKey ? `Ref ${instance.businessKey} · ` : ""}
          {instance.id} · started {formatDateTime(instance.startTime)}
          {instance.startUserId ? ` by ${instance.startUserId}` : ""}
        </p>

        <h3 className="tf-detail__section-title">Progress</h3>
        <AsyncBoundary
          loading={stages.loading}
          error={stages.error}
          data={stages.data}
          onRetry={stages.refetch}
          isEmpty={(rows) => rows.length === 0}
          empty={<p className="tf-muted">No stages or milestones defined.</p>}
        >
          {(rows) => (
            <ul className="tf-stage-chips">
              {rows.map((stage) => (
                <li
                  key={stage.id}
                  className={[
                    "tf-stage-chip",
                    stage.ended ? "is-done" : "",
                    stage.current ? "is-current" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {stage.name || stage.id}
                </li>
              ))}
            </ul>
          )}
        </AsyncBoundary>

        <h3 className="tf-detail__section-title">Plan items</h3>
        <AsyncBoundary
          loading={planItems.loading}
          error={planItems.error}
          data={planItems.data}
          onRetry={planItems.refetch}
          isEmpty={(rows) => rows.length === 0}
          empty={<p className="tf-muted">No plan items are active.</p>}
        >
          {(rows) => (
            <ul className="tf-planitems">
              {rows.map((item) => {
                // Control opts in to forcing a human task: this screen exists to
                // unblock instances, and the engine allows it.
                const actions = availablePlanItemActions(item.state, {
                  planItemDefinitionType: item.planItemDefinitionType,
                  allowTriggeringHumanTasks: true,
                });
                return (
                  <li className="tf-planitems__item" key={item.id}>
                    <div className="tf-planitems__row">
                      <span className="tf-planitems__name">{item.name || item.elementId}</span>
                      <span className="tf-planitems__type">{item.planItemDefinitionType}</span>
                      <span className="tf-badge tf-badge--running">{item.state}</span>
                      <span className="tf-planitems__actions">
                        {actions.map((action) => (
                          <Button
                            key={action}
                            variant="secondary"
                            loading={busy === item.id}
                            onClick={() => setPending({ item, action })}
                          >
                            {ACTION_LABELS[action]}
                          </Button>
                        ))}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </AsyncBoundary>

        <h3 className="tf-detail__section-title">Variables</h3>
        <AsyncBoundary
          loading={variables.loading}
          error={variables.error}
          data={variables.data}
          onRetry={variables.refetch}
          isEmpty={(rows) => rows.length === 0}
          empty={<p className="tf-muted">No variables.</p>}
        >
          {(rows) => (
            <dl className="tf-variables">
              {rows.map((variable) => (
                <div className="tf-variables__row" key={variable.name}>
                  <dt className="tf-variables__name">{variable.name}</dt>
                  <dd className="tf-variables__value">
                    {variable.value === null || variable.value === undefined
                      ? "—"
                      : String(variable.value)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </AsyncBoundary>

        <div className="tf-dialog__actions tf-dialog__actions--split">
          <div className="tf-row-actions">
            <Button
              variant="danger"
              disabled={busy !== null}
              onClick={() => setPendingEnd("terminate")}
            >
              Terminate
            </Button>
            <Button variant="danger" disabled={busy !== null} onClick={() => setPendingEnd("delete")}>
              Delete
            </Button>
          </div>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={pending !== null}
        title={
          pending?.action === "trigger"
            ? "Force this plan item to complete?"
            : `${pending ? ACTION_LABELS[pending.action] : ""} this plan item?`
        }
        description={
          pending?.action === "trigger" &&
          (pending.item.planItemDefinitionType ?? "").toLowerCase() === "humantask"
            ? `"${pending.item.name}" will be completed without anyone filling in its form. Use this only to unblock a case nobody can action.`
            : `"${pending?.item.name}" will be ${pending?.action ?? "changed"}ed.`
        }
        confirmLabel={pending ? ACTION_LABELS[pending.action] : "Confirm"}
        destructive={pending?.action === "trigger" || pending?.action === "disable"}
        busy={busy !== null}
        onCancel={() => setPending(null)}
        onConfirm={() => pending && void run(pending.item, pending.action)}
      />

      <ConfirmDialog
        open={pendingEnd !== null}
        title={pendingEnd === "delete" ? "Delete this case?" : "Terminate this case?"}
        description={
          pendingEnd === "delete"
            ? `"${instance.name ?? instance.id}" will be removed completely, history included. This cannot be undone.`
            : `"${instance.name ?? instance.id}" will stop immediately and its open tasks will be cancelled. Its history is kept.`
        }
        confirmLabel={pendingEnd === "delete" ? "Delete case" : "Terminate case"}
        destructive
        busy={busy !== null}
        onCancel={() => setPendingEnd(null)}
        onConfirm={() => pendingEnd && void endCase(pendingEnd)}
      />
    </div>
  );
}
