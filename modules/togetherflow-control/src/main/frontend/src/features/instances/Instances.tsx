import { useCallback, useMemo, useState } from "react";
import {
  ApiError,
  AsyncBoundary,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  NoResultsState,
  Pagination,
  displayValue,
  formatDateTime,
  useAsync,
  useDebouncedValue,
  useToast,
  type ActivityInstanceResponse,
  type Column,
  type InstanceApi,
  type ProcessInstanceResponse,
} from "@togetherflow/common";

const PAGE_SIZE = 25;

export interface InstancesProps {
  instanceApi: InstanceApi;
}

export function Instances({ instanceApi }: InstancesProps) {
  const [selected, setSelected] = useState<ProcessInstanceResponse | null>(null);
  const [start, setStart] = useState(0);
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search).trim();
  const [suspendedOnly, setSuspendedOnly] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const query = useMemo(
    () => ({
      start,
      size: PAGE_SIZE,
      ...(debounced ? { processInstanceNameLikeIgnoreCase: `%${debounced}%` } : {}),
      ...(suspendedOnly ? { suspended: true } : {}),
    }),
    [start, debounced, suspendedOnly],
  );

  const { data, error, loading, refetch } = useAsync(
    (signal) => instanceApi.query(query, signal),
    [instanceApi, query, reloadToken],
  );

  const columns = useMemo<Column<ProcessInstanceResponse>[]>(
    () => [
      {
        key: "name",
        header: "Instance",
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
        header: "Status",
        width: "120px",
        render: (instance) =>
          instance.suspended ? (
            <span className="tf-badge tf-badge--warning">Suspended</span>
          ) : (
            <span className="tf-badge tf-badge--running">Running</span>
          ),
      },
      {
        key: "started",
        header: "Started",
        width: "180px",
        secondary: true,
        render: (instance) => formatDateTime(instance.startTime),
      },
    ],
    [],
  );

  if (selected) {
    return (
      <InstanceDetail
        instanceApi={instanceApi}
        instanceId={selected.id}
        onBack={() => setSelected(null)}
        onChanged={() => setReloadToken((t) => t + 1)}
        onDeleted={() => {
          setSelected(null);
          setReloadToken((t) => t + 1);
        }}
      />
    );
  }

  return (
    <section className="tf-panel" aria-label="Process instances">
      <header className="tf-panel__header">
        <div>
          <h1 className="tf-panel__title">Process instances</h1>
          <p className="tf-panel__meta">Running work, and what it's waiting on.</p>
        </div>
      </header>

      <div className="tf-toolbar">
        <div className="tf-panel__search">
          <label className="tf-visually-hidden" htmlFor="tf-instance-search">
            Search instances by name
          </label>
          <input
            id="tf-instance-search"
            className="tf-input"
            type="search"
            placeholder="Search by name…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setStart(0);
            }}
          />
        </div>
        <label className="tf-checkbox">
          <input
            type="checkbox"
            checked={suspendedOnly}
            onChange={(event) => {
              setSuspendedOnly(event.target.checked);
              setStart(0);
            }}
          />
          Suspended only
        </label>
      </div>

      <AsyncBoundary
        loading={loading}
        error={error}
        data={data}
        onRetry={refetch}
        isEmpty={(page) => page.data.length === 0}
        empty={
          debounced || suspendedOnly ? (
            <NoResultsState
              onClear={() => {
                setSearch("");
                setSuspendedOnly(false);
                setStart(0);
              }}
            />
          ) : (
            <EmptyState
              title="No running instances"
              description="Nothing is currently in flight. Completed work lives in history."
            />
          )
        }
      >
        {(page) => (
          <>
            <DataTable
              caption="Process instances"
              columns={columns}
              rows={page.data}
              rowKey={(instance) => instance.id}
              onRowClick={setSelected}
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
          message: apiError?.message ?? "That action could not be completed.",
          reference: apiError?.correlationId,
        });
      } finally {
        setBusy(false);
      }
    },
    [push],
  );

  return (
    <section className="tf-panel" aria-label="Instance detail">
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
                      instance.suspended ? "Instance activated." : "Instance suspended.",
                      () => instanceApi.setSuspended(instance.id, !instance.suspended),
                      () => {
                        setReloadToken((t) => t + 1);
                        onChanged();
                      },
                    )
                  }
                >
                  {instance.suspended ? "Activate" : "Suspend"}
                </Button>
                <Button variant="danger" loading={busy} onClick={() => setConfirmDelete(true)}>
                  Delete
                </Button>
              </div>
            </header>

            <dl className="tf-facts">
              <Fact label="Started" value={formatDateTime(instance.startTime)} />
              <Fact label="Started by" value={instance.startUserId || "—"} />
              <Fact label="Definition" value={instance.processDefinitionId || "—"} />
              <Fact label="Current activity" value={instance.activityId || "—"} />
            </dl>

            <section className="tf-panel__section">
              <h2 className="tf-panel__section-title">Diagram</h2>
              {diagramFailed ? (
                <p className="tf-muted">
                  No diagram is available for this instance — the deployment may not include
                  graphical information.
                </p>
              ) : (
                <img
                  className="tf-diagram"
                  src={instanceApi.diagramUrl(instance.id)}
                  alt={`Process diagram for instance ${instance.id}`}
                  onError={() => setDiagramFailed(true)}
                />
              )}
            </section>

            <section className="tf-panel__section">
              <h2 className="tf-panel__section-title">
                Active activities ({activities.length})
              </h2>
              {activities.length === 0 ? (
                <p className="tf-muted">No activity instances recorded.</p>
              ) : (
                <ul className="tf-activities">
                  {activities.map((activity) => (
                    <li className="tf-activities__item" key={activity.id}>
                      <span className="tf-activities__name">
                        {activity.activityName || activity.activityId}
                      </span>
                      <span className="tf-activities__meta">
                        {activity.activityType} · started {formatDateTime(activity.startTime ?? undefined)}
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
                <p className="tf-muted">No variables set.</p>
              ) : (
                <table className="tf-table">
                  <caption className="tf-visually-hidden">Instance variables</caption>
                  <thead>
                    <tr>
                      <th scope="col">Name</th>
                      <th scope="col">Type</th>
                      <th scope="col">Value</th>
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
              title="Delete this instance?"
              description={`Instance "${instance.name || instance.id}" will be deleted along with its tasks and variables. Work in progress is lost and cannot be recovered.`}
              confirmLabel="Delete instance"
              destructive
              busy={busy}
              onCancel={() => setConfirmDelete(false)}
              onConfirm={() => {
                setConfirmDelete(false);
                void run(
                  "Instance deleted.",
                  () => instanceApi.delete(instance.id, "Deleted from TogetherFlow Control"),
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
