import { useCallback, useMemo, useState } from "react";
import {
  ApiError,
  AsyncBoundary,
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Icon,
  NoResultsState,
  PageHeader,
  Pagination,
  SavedViews,
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
  type RepositoryApi,
} from "@togetherflow/common";
import { ChangeStateDialog } from "./ChangeStateDialog";
import { InstanceFilters, decodeFilters, encodeFilters } from "./InstanceFilters";
import { MigrationDialog } from "./MigrationDialog";
import { VariableEditor } from "./VariableEditor";

export interface InstancesProps {
  instanceApi: InstanceApi;
  /** W2.1 needs definitions for migration targets and change-state activity lists. */
  repositoryApi: RepositoryApi;
  /** Degrades the screen to read-only rather than offering rejected actions (§13.1). */
  readOnly?: boolean;
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
  /** W2.1's rich filters. `vars` is the encoded variable-filter list — see InstanceFilters. */
  businessKey: string;
  startedAfter: string;
  startedBefore: string;
  vars: string;
}

const DEFAULT_VIEW: InstancesView = {
  search: "",
  suspendedOnly: "",
  businessKey: "",
  startedAfter: "",
  startedBefore: "",
  vars: "",
};

export function Instances({
  instanceApi,
  repositoryApi,
  readOnly = false,
  selectedId,
  onSelect,
}: InstancesProps) {
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
  /*
   * W2.1: "bulk actions beyond dead-letter jobs". W1.5's DataTable makes this a wiring
   * job rather than a rebuild — the checkbox column, select-all and bulk bar are the
   * component's.
   */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const { push } = useToast();
  const savedViews = useSavedViews<InstancesView>("control.instances");

  const update = list.setFilters;
  const applyView = list.replaceFilters;

  const variableFilters = useMemo(() => decodeFilters(view.vars), [view.vars]);

  const query = useMemo(
    () => ({
      start: list.start,
      size: list.size,
      sort: list.sort?.key,
      order: list.sort?.order,
      ...(debounced ? { processInstanceNameLikeIgnoreCase: `%${debounced}%` } : {}),
      ...(view.suspendedOnly ? { suspended: true } : {}),
      ...(view.businessKey ? { processBusinessKeyLike: `%${view.businessKey}%` } : {}),
      /*
       * The date inputs are days; the engine takes instants. Widened to the day's bounds
       * so "started before the 5th" includes everything that happened on the 4th, which is
       * what the words mean.
       */
      ...(view.startedAfter ? { startedAfter: `${view.startedAfter}T00:00:00.000Z` } : {}),
      ...(view.startedBefore ? { startedBefore: `${view.startedBefore}T23:59:59.999Z` } : {}),
      // Incomplete rows are dropped rather than sent: a filter with no name matches
      // nothing server-side and would silently empty the list while being typed.
      ...(variableFilters.length > 0
        ? { variables: variableFilters.filter((filter) => filter.name.trim() !== "") }
        : {}),
    }),
    [
      list.start,
      list.size,
      list.sort,
      debounced,
      view.suspendedOnly,
      view.businessKey,
      view.startedAfter,
      view.startedBefore,
      variableFilters,
    ],
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
        repositoryApi={repositoryApi}
        readOnly={readOnly}
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

      {/* W2.1: business key, date range and variable-value filters — all supported by the
          engine's query resource and none of them previously sent. */}
      <InstanceFilters
        businessKey={view.businessKey}
        startedAfter={view.startedAfter}
        startedBefore={view.startedBefore}
        variables={variableFilters}
        onChange={(patch) =>
          update({
            ...(patch.businessKey !== undefined ? { businessKey: patch.businessKey } : {}),
            ...(patch.startedAfter !== undefined ? { startedAfter: patch.startedAfter } : {}),
            ...(patch.startedBefore !== undefined ? { startedBefore: patch.startedBefore } : {}),
            ...(patch.variables !== undefined ? { vars: encodeFilters(patch.variables) } : {}),
          })
        }
      />
      {savedViews.views.length > 0 ? (
        <p className="tf-filter-bar__note">{t("savedViews.note")}</p>
      ) : null}

      <ConfirmDialog
        open={confirmBulkDelete}
        title={t("instances.bulkDelete.title", { count: selected.size })}
        description={t("instances.bulkDelete.description", { count: selected.size })}
        confirmLabel={t("instances.bulkDelete.confirm")}
        destructive
        busy={bulkBusy}
        onCancel={() => setConfirmBulkDelete(false)}
        onConfirm={() => {
          const ids = [...selected];
          setConfirmBulkDelete(false);
          setBulkBusy(true);
          void instanceApi
            .bulkDelete(ids, t("instances.deleteReason"))
            .then(() => {
              push({ tone: "success", message: t("instances.bulkDelete.done", { count: ids.length }) });
              setSelected(new Set());
              setReloadToken((token) => token + 1);
            })
            .catch((cause) => {
              const apiError = cause instanceof ApiError ? cause : undefined;
              push({
                tone: "error",
                message: apiError?.message ?? t("action.failed"),
                reference: apiError?.correlationId,
              });
            })
            .finally(() => setBulkBusy(false));
        }}
      />

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
              selection={readOnly ? undefined : selected}
              onSelectionChange={readOnly ? undefined : setSelected}
              selectionLabel={(instance) =>
                t("instances.select", { name: instance.name || instance.id })
              }
              selectAllLabel={t("instances.selectAll")}
              bulkActions={(ids) => (
                <Button variant="danger" loading={bulkBusy} onClick={() => setConfirmBulkDelete(true)}>
                  <Icon name="trash" size={16} />
                  {t("instances.bulkDelete.action", { count: ids.length })}
                </Button>
              )}
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
  /** Needed for W2.1's migration targets and change-state activity list. */
  repositoryApi: RepositoryApi;
  instanceId: string;
  /** Hides every mutating action rather than offering one the server will reject (§13.1). */
  readOnly?: boolean;
  onBack: () => void;
  onChanged: () => void;
  onDeleted: () => void;
}

function InstanceDetail({
  instanceApi,
  repositoryApi,
  instanceId,
  readOnly = false,
  onBack,
  onChanged,
  onDeleted,
}: DetailProps) {
  const { t, locale } = useI18n();
  const { push } = useToast();
  const [busy, setBusy] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [diagramFailed, setDiagramFailed] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [changingState, setChangingState] = useState(false);

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
              {readOnly ? null : (
                <div className="tf-row-actions">
                  <Button variant="secondary" onClick={() => setMigrating(true)}>
                    <Icon name="refresh" size={16} />
                    {t("instances.action.migrate")}
                  </Button>
                  <Button variant="secondary" onClick={() => setChangingState(true)}>
                    <Icon name="play" size={16} />
                    {t("instances.action.changeState")}
                  </Button>
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
              )}
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

            {/* W2.1: read-only before, editable now — a stuck instance is very often one
                variable away from moving. */}
            <section className="tf-panel__section">
              <VariableEditor
                instanceApi={instanceApi}
                instanceId={instance.id}
                variables={variables}
                readOnly={readOnly}
                onChanged={() => {
                  setReloadToken((token) => token + 1);
                  onChanged();
                }}
              />
            </section>

            {migrating ? (
              <MigrationDialog
                instanceApi={instanceApi}
                repositoryApi={repositoryApi}
                instance={instance}
                activities={activities}
                onClose={() => setMigrating(false)}
                onMigrated={() => {
                  setReloadToken((token) => token + 1);
                  onChanged();
                }}
              />
            ) : null}

            {changingState ? (
              <ChangeStateDialog
                instanceApi={instanceApi}
                repositoryApi={repositoryApi}
                instance={instance}
                activities={activities}
                onClose={() => setChangingState(false)}
                onChanged={() => {
                  setReloadToken((token) => token + 1);
                  onChanged();
                }}
              />
            ) : null}

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
