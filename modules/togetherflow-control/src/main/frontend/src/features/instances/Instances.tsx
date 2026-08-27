import { useCallback, useMemo, useState } from "react";
import {
  ApiError,
  AsyncBoundary,
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  NoResultsState,
  PageHeader,
  Pagination,
  SavedViews,
  displayValue,
  formatDateTime,
  toneForState,
  useAsync,
  useI18n,
  useDebouncedValue,
  useListState,
  useSavedViews,
  useToast,
  type ActivityInstanceResponse,
  type Column,
  type InstanceApi,
  type ProcessInstanceResponse,
} from "@togetherflow/common";

export interface InstancesProps {
  instanceApi: InstanceApi;
  /**
   * Id from `/instances/:instanceId`. This is the URL F1 argues for most in this app:
   * "support and ops cannot paste 'look at this instance' into a ticket."
   */
  selectedId?: string;
  onSelect?: (instanceId: string | undefined) => void;
}

/**
 * What a saved view captures (§14.4) — everything except which page you were on — and,
 * since W1.3, what the query string carries. Values are strings because a query string
 * holds strings; `suspendedOnly` is "true"/"" rather than a boolean for that reason.
 */
export interface InstancesView {
  [key: string]: string;
  search: string;
  suspendedOnly: string;
}

const DEFAULT_VIEW: InstancesView = { search: "", suspendedOnly: "" };

export function Instances({ instanceApi, selectedId, onSelect }: InstancesProps) {
  const { t, locale } = useI18n();
  const list = useListState<InstancesView>({
    defaults: DEFAULT_VIEW,
    defaultSort: { key: "startTime", order: "desc" },
    preferenceKey: "control.instances",
  });
  const view = list.filters;
  const setStart = list.setStart;
  const debounced = useDebouncedValue(view.search).trim();
  const [reloadToken, setReloadToken] = useState(0);
  const savedViews = useSavedViews<InstancesView>("control.instances");

  const update = list.setFilters;
  const applyView = list.replaceFilters;

  const query = useMemo(
    () => ({
      start: list.start,
      size: list.size,
      sort: list.sort?.key,
      order: list.sort?.order,
      ...(debounced ? { processInstanceNameLikeIgnoreCase: `%${debounced}%` } : {}),
      ...(view.suspendedOnly ? { suspended: true } : {}),
    }),
    [list.start, list.size, list.sort, debounced, view.suspendedOnly],
  );

  const { data, error, loading, refetch } = useAsync(
    (signal) => instanceApi.query(query, signal),
    [instanceApi, query, reloadToken],
  );

  const columns = useMemo<Column<ProcessInstanceResponse>[]>(
    () => [
      {
        key: "name",
        header: t("instances.column.instance"),
        required: true,
        sortKey: "processDefinitionId",
        render: (instance) => (
          <div className="tf-task-cell">
            <span className="tf-task-cell__name">
              {instance.name || instance.processDefinitionName || instance.id}
            </span>
            <span className="tf-task-cell__description">
              {instance.businessKey ? `${instance.businessKey} · ` : ""}
              {instance.id}
            </span>
          </div>
        ),
      },
      {
        key: "status",
        header: t("instances.column.status"),
        width: "120px",
        // C3: was a hand-rolled `.tf-badge--running` class defined in three stylesheets;
        // now the one Badge, with the tone read off the shared engine-state mapping.
        render: (instance) =>
          instance.suspended ? (
            <Badge tone={toneForState("suspended")}>{t("instances.status.suspended")}</Badge>
          ) : (
            <Badge tone={toneForState("running")} dot>
              {t("instances.status.running")}
            </Badge>
          ),
      },
      {
        key: "started",
        header: t("instances.column.started"),
        width: "180px",
        secondary: true,
        sortKey: "startTime",
        render: (instance) => formatDateTime(instance.startTime, locale),
      },
    ],
    [t, locale],
  );

  if (selectedId) {
    return (
      <InstanceDetail
        instanceApi={instanceApi}
        instanceId={selectedId}
        onBack={() => onSelect?.(undefined)}
        onChanged={() => setReloadToken((t) => t + 1)}
        onDeleted={() => {
          onSelect?.(undefined);
          setReloadToken((t) => t + 1);
        }}
      />
    );
  }

  return (
    <section className="tf-panel" aria-label={t("instances.label")}>
      <PageHeader
        title={t("instances.title")}
        description={t("instances.meta")}
        meta={
          data ? (
            <Badge tone="info" subtle srLabel={t("instances.countLabel", { count: data.total })}>
              {data.total}
            </Badge>
          ) : undefined
        }
      />

      <div className="tf-toolbar">
        <div className="tf-panel__search">
          <label className="tf-visually-hidden" htmlFor="tf-instance-search">
            {t("instances.searchLabel")}
          </label>
          <input
            id="tf-instance-search"
            className="tf-input"
            type="search"
            placeholder={t("instances.search")}
            value={view.search}
            onChange={(event) => update({ search: event.target.value })}
          />
        </div>
        <label className="tf-checkbox">
          <input
            type="checkbox"
            checked={view.suspendedOnly === "true"}
            onChange={(event) => update({ suspendedOnly: event.target.checked ? "true" : "" })}
          />
          {t("instances.suspendedOnly")}
        </label>
        {/*
          Saved filters (§14.4). Control is the app the requirement argues hardest for —
          an operator returning to the same "suspended, named like X" query every morning
          should not have to rebuild it every morning.
        */}
        <SavedViews
          views={savedViews.views}
          current={view}
          onApply={applyView}
          onSave={savedViews.save}
          onRemove={savedViews.remove}
        />
      </div>
      {savedViews.views.length > 0 ? (
        <p className="tf-filter-bar__note">{t("savedViews.note")}</p>
      ) : null}

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
              title={t("instances.empty.title")}
              description={t("instances.empty.description")}
            />
          )
        }
      >
        {(page) => (
          <>
            <DataTable
              caption={t("instances.caption")}
              preferenceKey="control.instances"
              columns={columns}
              rows={page.data}
              rowKey={(instance) => instance.id}
              onRowClick={(instance) => onSelect?.(instance.id)}
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
    </section>
  );
}

interface DetailProps {
  instanceApi: InstanceApi;
  instanceId: string;
  onBack: () => void;
  onChanged: () => void;
  onDeleted: () => void;
}

function InstanceDetail({ instanceApi, instanceId, onBack, onChanged, onDeleted }: DetailProps) {
  const { t, locale } = useI18n();
  const { push } = useToast();
  const [busy, setBusy] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [diagramFailed, setDiagramFailed] = useState(false);

  const detail = useAsync(
    async (signal) => {
      const [instance, variables, activities] = await Promise.all([
        instanceApi.get(instanceId, signal),
        instanceApi.listVariables(instanceId, signal).catch(() => []),
        instanceApi
          .listActivities(instanceId, signal)
          .then((page) => page.data)
          .catch(() => [] as ActivityInstanceResponse[]),
      ]);
      return { instance, variables, activities };
    },
    [instanceApi, instanceId, reloadToken],
  );

  const run = useCallback(
    async (message: string, action: () => Promise<unknown>, then?: () => void) => {
      setBusy(true);
      try {
        await action();
        push({ tone: "success", message });
        then?.();
      } catch (cause) {
        const apiError = cause instanceof ApiError ? cause : undefined;
        push({
          tone: "error",
          message: apiError?.message ?? t("action.failed"),
          reference: apiError?.correlationId,
        });
      } finally {
        setBusy(false);
      }
    },
    [push, t],
  );

  return (
    <section className="tf-panel" aria-label={t("instances.detail.label")}>
      <button type="button" className="tf-back" onClick={onBack}>
        ← Back to all instances
      </button>

      <AsyncBoundary
        loading={detail.loading}
        error={detail.error}
        data={detail.data}
        onRetry={() => setReloadToken((t) => t + 1)}
        skeletonRows={8}
      >
        {({ instance, variables, activities }) => (
          <>
            <header className="tf-panel__header">
              <div>
                <h1 className="tf-panel__title">
                  {instance.name || instance.processDefinitionName || instance.id}
                </h1>
                <p className="tf-panel__meta">
                  {instance.id}
                  {instance.businessKey ? ` · ${instance.businessKey}` : ""}
                  {instance.suspended ? " · suspended" : ""}
                </p>
              </div>
              <div className="tf-row-actions">
                <Button
                  variant="secondary"
                  loading={busy}
                  onClick={() =>
                    void run(
                      instance.suspended
                        ? t("instances.activated")
                        : t("instances.suspended"),
                      () => instanceApi.setSuspended(instance.id, !instance.suspended),
                      () => {
                        setReloadToken((t) => t + 1);
                        onChanged();
                      },
                    )
                  }
                >
                  {instance.suspended
                    ? t("instances.action.activate")
                    : t("instances.action.suspend")}
                </Button>
                <Button variant="danger" loading={busy} onClick={() => setConfirmDelete(true)}>
                  {t("action.delete")}
                </Button>
              </div>
            </header>

            <dl className="tf-facts">
              <Fact
                label={t("instances.fact.started")}
                value={formatDateTime(instance.startTime, locale)}
              />
              <Fact label={t("instances.fact.startedBy")} value={instance.startUserId || "—"} />
              <Fact
                label={t("instances.fact.definition")}
                value={instance.processDefinitionId || "—"}
              />
              <Fact label={t("instances.fact.activity")} value={instance.activityId || "—"} />
            </dl>

            <section className="tf-panel__section">
              <h2 className="tf-panel__section-title">{t("instances.diagram")}</h2>
              {diagramFailed ? (
                <p className="tf-muted">
                  No diagram is available for this instance — the deployment may not include
                  graphical information.
                </p>
              ) : (
                <img
                  className="tf-diagram"
                  src={instanceApi.diagramUrl(instance.id)}
                  alt={t("instances.diagram.alt", { id: instance.id })}
                  onError={() => setDiagramFailed(true)}
                />
              )}
            </section>

            <section className="tf-panel__section">
              <h2 className="tf-panel__section-title">
                Active activities ({activities.length})
              </h2>
              {activities.length === 0 ? (
                <p className="tf-muted">{t("instances.activities.none")}</p>
              ) : (
                <ul className="tf-activities">
                  {activities.map((activity) => (
                    <li className="tf-activities__item" key={activity.id}>
                      <span className="tf-activities__name">
                        {activity.activityName || activity.activityId}
                      </span>
                      <span className="tf-activities__meta">
                        {activity.activityType} ·{" "}
                        {t("instances.activityStarted", {
                          when: formatDateTime(activity.startTime ?? undefined, locale),
                        })}
                        {activity.endTime ? " · ended" : " · in progress"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="tf-panel__section">
              <h2 className="tf-panel__section-title">Variables ({variables.length})</h2>
              {variables.length === 0 ? (
                <p className="tf-muted">{t("instances.variables.none")}</p>
              ) : (
                <table className="tf-table">
                  <caption className="tf-visually-hidden">
                    {t("instances.variables.caption")}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">{t("instances.variables.name")}</th>
                      <th scope="col">{t("instances.variables.type")}</th>
                      <th scope="col">{t("instances.variables.value")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variables.map((variable) => (
                      <tr key={variable.name}>
                        <td>{variable.name}</td>
                        <td className="tf-muted">{variable.type ?? "—"}</td>
                        <td>{displayValue(variable)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <ConfirmDialog
              open={confirmDelete}
              title={t("instances.delete.title")}
              description={t("instances.delete.description", {
                name: instance.name || instance.id,
              })}
              confirmLabel={t("instances.delete.confirm")}
              destructive
              busy={busy}
              onCancel={() => setConfirmDelete(false)}
              onConfirm={() => {
                setConfirmDelete(false);
                void run(
                  t("instances.deleted"),
                  () => instanceApi.delete(instance.id, t("instances.deleteReason")),
                  onDeleted,
                );
              }}
            />
          </>
        )}
      </AsyncBoundary>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="tf-facts__item">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
