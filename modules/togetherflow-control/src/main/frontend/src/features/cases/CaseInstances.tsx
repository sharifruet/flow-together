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
  Modal,
  AsyncBoundary,
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  NoResultsState,
  PageHeader,
  Pagination,
  availablePlanItemActions,
  formatDateTime,
  useAsync,
  useI18n,
  useDebouncedValue,
  useListState,
  useToast,
  type CaseApi,
  type CaseInstanceResponse,
  type Column,
  type PlanItemAction,
  type PlanItemInstanceResponse,
} from "@togetherflow/common";


/** Message keys per action; Control's wording differs from Work's on purpose (ADR 0011). */
const ACTION_KEYS: Record<PlanItemAction, string> = {
  start: "cases.action.start",
  enable: "cases.action.enable",
  disable: "cases.action.disable",
  trigger: "cases.action.trigger",
};

/** What the query string carries for this list (W1.3, F1). */
interface CaseInstancesView {
  [key: string]: string;
  q: string;
}

const DEFAULT_VIEW: CaseInstancesView = { q: "" };

export interface CaseInstancesProps {
  caseApi: CaseApi;
  /** Id from `/cases/:caseId`, so an inspected case is a link. */
  selectedId?: string;
  onSelect?: (caseId: string | undefined) => void;
}

export function CaseInstances({ caseApi, selectedId, onSelect }: CaseInstancesProps) {
  const { t, locale } = useI18n();
  const list = useListState<CaseInstancesView>({
    defaults: DEFAULT_VIEW,
    defaultSort: { key: "startTime", order: "desc" },
    preferenceKey: "control.cases",
  });
  const search = list.filters.q;
  const setStart = list.setStart;
  const debounced = useDebouncedValue(search).trim();
  const [reloadToken, setReloadToken] = useState(0);

  const query = useMemo(
    () => ({
      start: list.start,
      size: list.size,
      sort: list.sort?.key,
      order: list.sort?.order,
      ...(debounced ? { businessKey: debounced } : {}),
    }),
    [list.start, list.size, list.sort, debounced],
  );

  const { data, error, loading, refetch } = useAsync(
    (signal) => caseApi.query(query, signal),
    [caseApi, query, reloadToken],
  );

  /** The row for the id in the URL, once the page holding it has loaded. */
  const selectedInstance = useMemo(
    () => (selectedId ? (data?.data ?? []).find((instance) => instance.id === selectedId) : undefined),
    [selectedId, data],
  );

  const columns = useMemo<Column<CaseInstanceResponse>[]>(
    () => [
      {
        key: "name",
        header: t("cases.column.case"),
        render: (instance) => (
          <div className="tf-task-cell">
            <span className="tf-task-cell__name">
              {instance.name || instance.caseDefinitionName || instance.id}
            </span>
            <span className="tf-task-cell__description">
              {instance.businessKey
                ? `${t("cases.ref", { businessKey: instance.businessKey })} · `
                : ""}
              {instance.id.slice(0, 8)}
            </span>
          </div>
        ),
      },
      {
        key: "state",
        header: t("cases.column.state"),
        width: "110px",
        render: (instance) => (
          <Badge tone="info">{instance.state ?? "active"}</Badge>
        ),
      },
      {
        key: "started",
        header: t("cases.column.started"),
        width: "180px",
        secondary: true,
        render: (instance) => formatDateTime(instance.startTime, locale),
      },
      {
        key: "actions",
        header: "",
        width: "110px",
        render: (instance) => (
          <Button variant="ghost" onClick={() => onSelect?.(instance.id)}>
            {t("cases.inspect")}
          </Button>
        ),
      },
    ],
    [locale, t, onSelect],
  );

  return (
    <section className="tf-panel" aria-label={t("cases.label")}>
      <PageHeader
        title={t("cases.title")}
        description={t("cases.meta")}
        meta={
          data ? (
            <Badge tone="info" subtle srLabel={t("cases.countLabel", { count: data.total })}>
              {data.total}
            </Badge>
          ) : undefined
        }
      />

      <div className="tf-toolbar">
        <div className="tf-panel__search">
          <label className="tf-visually-hidden" htmlFor="tf-case-instance-search">
            {t("cases.searchLabel")}
          </label>
          <input
            id="tf-case-instance-search"
            className="tf-input"
            type="search"
            placeholder={t("cases.search")}
            value={search}
            onChange={(event) => list.setFilters({ q: event.target.value })}
          />
        </div>
      </div>

      <AsyncBoundary
        loading={loading}
        error={error}
        data={data}
        onRetry={refetch}
        isEmpty={(page) => page.data.length === 0}
        empty={
          list.isFiltered ? (
            <NoResultsState onClear={list.clearFilters} />
          ) : (
            <EmptyState
              illustration="nothing-deployed"
              title={t("cases.empty.title")}
              description={t("cases.empty.description")}
            />
          )
        }
      >
        {(page) => (
          <>
            <DataTable
              caption={t("cases.caption")}
              preferenceKey="control.cases"
              columns={columns}
              rows={page.data}
              rowKey={(instance) => instance.id}
              onRowClick={(instance) => onSelect?.(instance.id)}
              selectedKey={selectedId}
              sort={list.sort}
              onSortChange={list.setSort}
              busy={loading}
            />
            <Pagination
              start={page.start}
              size={page.size || list.size}
              total={page.total}
              onChange={setStart}
              onSizeChange={list.setSize}
            />
          </>
        )}
      </AsyncBoundary>

      {selectedInstance ? (
        <CaseInspector
          caseApi={caseApi}
          instance={selectedInstance}
          onClose={() => onSelect?.(undefined)}
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
  const { t, locale } = useI18n();
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
      push({
        tone: "success",
        message: t("cases.action.done", {
          action: t(ACTION_KEYS[action]),
          name: item.name ?? item.id,
        }),
      });
      setRefresh((n) => n + 1);
      onChanged();
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : undefined;
      push({
        tone: "error",
        message: apiError?.message ?? t("cases.action.rejected"),
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
        message: mode === "terminate" ? t("cases.terminated") : t("cases.deletedInstance"),
      });
      onChanged();
      onClose();
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : undefined;
      push({
        tone: "error",
        message: apiError?.message ?? t(`cases.end.failed.${mode}`),
        reference: apiError?.correlationId,
      });
    } finally {
      setBusy(null);
      setPendingEnd(null);
    }
  };

  return (
    <>
    <Modal
      open
      title={instance.name || instance.caseDefinitionName || t("cases.fallbackName")}
      description={
        <>
          {instance.businessKey
            ? `${t("cases.ref", { businessKey: instance.businessKey })} · `
            : ""}
          {instance.id} ·{" "}
          {t("cases.startedAt", { when: formatDateTime(instance.startTime, locale) })}
          {instance.startUserId ? t("cases.startedBy", { userId: instance.startUserId }) : ""}
        </>
      }
      size="lg"
      onClose={onClose}
      actions={
        <>
          {/* The destructive pair sits left of the close button — see
              `.tf-modal__actions > .tf-row-actions` in the theme. */}
          <div className="tf-row-actions">
            <Button
              variant="danger"
              disabled={busy !== null}
              onClick={() => setPendingEnd("terminate")}
            >
              {t("action.terminate")}
            </Button>
            <Button variant="danger" disabled={busy !== null} onClick={() => setPendingEnd("delete")}>
              {t("action.delete")}
            </Button>
          </div>
          <Button variant="secondary" onClick={onClose}>
            {t("action.close")}
          </Button>
        </>
      }
    >

        <h3 className="tf-detail__section-title">{t("cases.section.progress")}</h3>
        <AsyncBoundary
          loading={stages.loading}
          error={stages.error}
          data={stages.data}
          onRetry={stages.refetch}
          isEmpty={(rows) => rows.length === 0}
          empty={<p className="tf-muted">{t("cases.progress.none")}</p>}
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

        <h3 className="tf-detail__section-title">{t("cases.section.planItems")}</h3>
        <AsyncBoundary
          loading={planItems.loading}
          error={planItems.error}
          data={planItems.data}
          onRetry={planItems.refetch}
          isEmpty={(rows) => rows.length === 0}
          empty={<p className="tf-muted">{t("cases.planItems.none")}</p>}
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
                      <Badge tone="info">{item.state}</Badge>
                      <span className="tf-planitems__actions">
                        {actions.map((action) => (
                          <Button
                            key={action}
                            variant="secondary"
                            loading={busy === item.id}
                            onClick={() => setPending({ item, action })}
                          >
                            {t(ACTION_KEYS[action])}
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

        <h3 className="tf-detail__section-title">{t("cases.section.variables")}</h3>
        <AsyncBoundary
          loading={variables.loading}
          error={variables.error}
          data={variables.data}
          onRetry={variables.refetch}
          isEmpty={(rows) => rows.length === 0}
          empty={<p className="tf-muted">{t("cases.variables.none")}</p>}
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
    </Modal>

      <ConfirmDialog
        open={pending !== null}
        title={
          pending?.action === "trigger"
            ? t("cases.confirm.force.title")
            : t("cases.confirm.action.title", {
                action: pending ? t(ACTION_KEYS[pending.action]) : "",
              })
        }
        description={
          pending?.action === "trigger" &&
          (pending.item.planItemDefinitionType ?? "").toLowerCase() === "humantask"
            ? t("cases.confirm.force.description", { name: pending.item.name ?? "" })
            : t("cases.confirm.action.description", {
                name: pending?.item.name ?? "",
                action: pending?.action ?? "chang",
              })
        }
        confirmLabel={pending ? t(ACTION_KEYS[pending.action]) : undefined}
        destructive={pending?.action === "trigger" || pending?.action === "disable"}
        busy={busy !== null}
        onCancel={() => setPending(null)}
        onConfirm={() => pending && void run(pending.item, pending.action)}
      />

      <ConfirmDialog
        open={pendingEnd !== null}
        title={
          pendingEnd === "delete"
            ? t("cases.deleteInstance.title")
            : t("cases.terminate.title")
        }
        description={
          pendingEnd === "delete"
            ? t("cases.deleteInstance.description", { name: instance.name ?? instance.id })
            : t("cases.terminate.description", { name: instance.name ?? instance.id })
        }
        confirmLabel={
          pendingEnd === "delete"
            ? t("cases.deleteInstance.confirm")
            : t("cases.terminate.confirm")
        }
        destructive
        busy={busy !== null}
        onCancel={() => setPendingEnd(null)}
        onConfirm={() => pendingEnd && void endCase(pendingEnd)}
      />
    </>
  );
}
