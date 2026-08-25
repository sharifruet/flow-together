/**
 * System: engine info, database tables, event subscriptions, batches, decision
 * executions and external worker jobs (REQUIREMENTS.md §7.2).
 *
 * These are lower-traffic diagnostic screens, grouped behind one nav item rather
 * than each claiming top-level space.
 */

import { useMemo, useState } from "react";
import {
  AsyncBoundary,
  DataTable,
  EmptyState,
  Pagination,
  formatDateTime,
  useAsync,
  type BatchResponse,
  type Column,
  type DecisionHistoryApi,
  type EventSubscriptionResponse,
  type ExternalWorkerApi,
  type ExternalWorkerJobResponse,
  type HistoricDecisionExecutionResponse,
  type SystemApi,
} from "@togetherflow/common";

const PAGE_SIZE = 25;

type Tab = "engine" | "tables" | "subscriptions" | "batches" | "decisions" | "workers";

const TABS: { id: Tab; label: string }[] = [
  { id: "engine", label: "Engine" },
  { id: "tables", label: "Database" },
  { id: "subscriptions", label: "Event subscriptions" },
  { id: "batches", label: "Batches" },
  { id: "decisions", label: "Decisions" },
  { id: "workers", label: "External workers" },
];

export interface SystemProps {
  systemApi: SystemApi;
  decisionHistoryApi: DecisionHistoryApi;
  externalWorkerApi: ExternalWorkerApi;
}

export function System({ systemApi, decisionHistoryApi, externalWorkerApi }: SystemProps) {
  const [tab, setTab] = useState<Tab>("engine");

  return (
    <section className="tf-panel" aria-label="System">
      <header className="tf-panel__header">
        <div>
          <h1 className="tf-panel__title">System</h1>
          <p className="tf-panel__meta">Engine state and diagnostics.</p>
        </div>
      </header>

      <div className="tf-inbox__filters" role="tablist" aria-label="System section">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={["tf-chip", tab === t.id ? "tf-chip--active" : ""].filter(Boolean).join(" ")}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "engine" ? <Engine systemApi={systemApi} /> : null}
      {tab === "tables" ? <Tables systemApi={systemApi} /> : null}
      {tab === "subscriptions" ? <Subscriptions systemApi={systemApi} /> : null}
      {tab === "batches" ? <Batches systemApi={systemApi} /> : null}
      {tab === "decisions" ? <Decisions api={decisionHistoryApi} /> : null}
      {tab === "workers" ? <Workers api={externalWorkerApi} /> : null}
    </section>
  );
}

function Engine({ systemApi }: { systemApi: SystemApi }) {
  const engine = useAsync((signal) => systemApi.engine(signal), [systemApi]);
  const properties = useAsync((signal) => systemApi.properties(signal), [systemApi]);

  return (
    <>
      <AsyncBoundary
        loading={engine.loading}
        error={engine.error}
        data={engine.data}
        onRetry={engine.refetch}
        skeletonRows={3}
      >
        {(info) => (
          <dl className="tf-facts">
            <div className="tf-facts__item">
              <dt>Engine</dt>
              <dd>{info.name || "—"}</dd>
            </div>
            <div className="tf-facts__item">
              <dt>Version</dt>
              <dd>{info.version || "—"}</dd>
            </div>
            {info.exception ? (
              <div className="tf-facts__item">
                <dt>Exception</dt>
                <dd className="tf-danger-text">{info.exception}</dd>
              </div>
            ) : null}
          </dl>
        )}
      </AsyncBoundary>

      <section className="tf-panel__section">
        <h2 className="tf-panel__section-title">Properties</h2>
        <AsyncBoundary
          loading={properties.loading}
          error={properties.error}
          data={properties.data}
          onRetry={properties.refetch}
          isEmpty={(props) => Object.keys(props).length === 0}
          empty={<EmptyState title="No properties" description="The engine reported none." />}
        >
          {(props) => (
            <table className="tf-table">
              <caption className="tf-visually-hidden">Engine properties</caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Value</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(props).map(([name, value]) => (
                  <tr key={name}>
                    <td>{name}</td>
                    <td className="tf-mono">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </AsyncBoundary>
      </section>
    </>
  );
}

function Tables({ systemApi }: { systemApi: SystemApi }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [start, setStart] = useState(0);

  const tables = useAsync((signal) => systemApi.listTables(signal), [systemApi]);
  const rows = useAsync(
    async (signal) =>
      selected ? systemApi.tableData(selected, { start, size: PAGE_SIZE }, signal) : null,
    [systemApi, selected, start],
  );

  if (selected) {
    return (
      <>
        <button
          type="button"
          className="tf-back"
          onClick={() => {
            setSelected(null);
            setStart(0);
          }}
        >
          ← Back to all tables
        </button>
        <h2 className="tf-panel__section-title tf-mono">{selected}</h2>
        <p className="tf-panel__meta">
          Read-only view of the engine's own tables. Nothing here can be edited.
        </p>
        <AsyncBoundary
          loading={rows.loading}
          error={rows.error}
          data={rows.data}
          onRetry={rows.refetch}
          isEmpty={(page) => !page || page.data.length === 0}
          empty={<EmptyState title="No rows" description="This table is empty." />}
        >
          {(page) =>
            page ? (
              <>
                <div className="tf-table-wrap">
                  <table className="tf-table tf-table--dense">
                    <caption className="tf-visually-hidden">{selected} rows</caption>
                    <thead>
                      <tr>
                        {Object.keys(page.data[0] ?? {}).map((column) => (
                          <th scope="col" key={column}>
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {page.data.map((row, index) => (
                        <tr key={index}>
                          {Object.keys(page.data[0] ?? {}).map((column) => (
                            <td key={column} className="tf-mono">
                              {formatCell(row[column])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  start={page.start}
                  size={page.size || PAGE_SIZE}
                  total={page.total}
                  onChange={setStart}
                />
              </>
            ) : null
          }
        </AsyncBoundary>
      </>
    );
  }

  return (
    <AsyncBoundary
      loading={tables.loading}
      error={tables.error}
      data={tables.data}
      onRetry={tables.refetch}
      isEmpty={(list) => list.length === 0}
      empty={<EmptyState title="No tables" description="The engine reported no tables." />}
    >
      {(list) => (
        <ul className="tf-cards">
          {list.map((table) => (
            <li key={table.name}>
              <button type="button" className="tf-card" onClick={() => setSelected(table.name)}>
                <span className="tf-card__title tf-mono">{table.name}</span>
                <span className="tf-card__meta">{table.count ?? 0} rows</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </AsyncBoundary>
  );
}

function Subscriptions({ systemApi }: { systemApi: SystemApi }) {
  const [start, setStart] = useState(0);
  const { data, error, loading, refetch } = useAsync(
    (signal) => systemApi.listEventSubscriptions({ start, size: PAGE_SIZE }, signal),
    [systemApi, start],
  );

  const columns = useMemo<Column<EventSubscriptionResponse>[]>(
    () => [
      {
        key: "event",
        header: "Event",
        render: (sub) => (
          <div className="tf-task-cell">
            <span className="tf-task-cell__name">{sub.eventName || sub.eventType || sub.id}</span>
            <span className="tf-task-cell__description">{sub.eventType}</span>
          </div>
        ),
      },
      { key: "activity", header: "Activity", secondary: true, render: (sub) => sub.activityId || "—" },
      {
        key: "created",
        header: "Created",
        width: "180px",
        secondary: true,
        render: (sub) => formatDateTime(sub.created ?? undefined),
      },
    ],
    [],
  );

  return (
    <AsyncBoundary
      loading={loading}
      error={error}
      data={data}
      onRetry={refetch}
      isEmpty={(page) => page.data.length === 0}
      empty={
        <EmptyState
          title="No event subscriptions"
          description="Nothing is currently waiting on a signal or message."
        />
      }
    >
      {(page) => (
        <>
          <DataTable
            caption="Event subscriptions"
            columns={columns}
            rows={page.data}
            rowKey={(sub) => sub.id}
          />
          <Pagination start={page.start} size={page.size || PAGE_SIZE} total={page.total} onChange={setStart} />
        </>
      )}
    </AsyncBoundary>
  );
}

function Batches({ systemApi }: { systemApi: SystemApi }) {
  const [start, setStart] = useState(0);
  const { data, error, loading, refetch } = useAsync(
    (signal) => systemApi.listBatches({ start, size: PAGE_SIZE }, signal),
    [systemApi, start],
  );

  const columns = useMemo<Column<BatchResponse>[]>(
    () => [
      {
        key: "type",
        header: "Batch",
        render: (batch) => (
          <div className="tf-task-cell">
            <span className="tf-task-cell__name">{batch.batchType || batch.id}</span>
            <span className="tf-task-cell__description">{batch.id}</span>
          </div>
        ),
      },
      {
        key: "status",
        header: "Status",
        width: "140px",
        render: (batch) => <span className="tf-badge tf-badge--running">{batch.status || "—"}</span>,
      },
      {
        key: "created",
        header: "Created",
        width: "180px",
        secondary: true,
        render: (batch) => formatDateTime(batch.createTime ?? undefined),
      },
    ],
    [],
  );

  return (
    <AsyncBoundary
      loading={loading}
      error={error}
      data={data}
      onRetry={refetch}
      isEmpty={(page) => page.data.length === 0}
      empty={
        <EmptyState title="No batches" description="No bulk operations have been run." />
      }
    >
      {(page) => (
        <>
          <DataTable caption="Batches" columns={columns} rows={page.data} rowKey={(b) => b.id} />
          <Pagination start={page.start} size={page.size || PAGE_SIZE} total={page.total} onChange={setStart} />
        </>
      )}
    </AsyncBoundary>
  );
}

function Decisions({ api }: { api: DecisionHistoryApi }) {
  const [start, setStart] = useState(0);
  const [failedOnly, setFailedOnly] = useState(false);
  const { data, error, loading, refetch } = useAsync(
    (signal) => api.list({ start, size: PAGE_SIZE, ...(failedOnly ? { failed: true } : {}) }, signal),
    [api, start, failedOnly],
  );

  const columns = useMemo<Column<HistoricDecisionExecutionResponse>[]>(
    () => [
      {
        key: "decision",
        header: "Decision",
        render: (row) => (
          <div className="tf-task-cell">
            <span className="tf-task-cell__name">{row.decisionName || row.decisionKey || row.id}</span>
            <span className="tf-task-cell__description">
              {row.decisionKey}
              {row.decisionVersion ? ` · v${row.decisionVersion}` : ""}
            </span>
          </div>
        ),
      },
      {
        key: "outcome",
        header: "Outcome",
        width: "120px",
        render: (row) =>
          row.failed ? (
            <span className="tf-badge tf-badge--danger">Failed</span>
          ) : (
            <span className="tf-badge tf-badge--done">OK</span>
          ),
      },
      {
        key: "when",
        header: "Executed",
        width: "180px",
        secondary: true,
        render: (row) => formatDateTime(row.startTime ?? undefined),
      },
    ],
    [],
  );

  return (
    <>
      <div className="tf-toolbar">
        <label className="tf-checkbox">
          <input
            type="checkbox"
            checked={failedOnly}
            onChange={(event) => {
              setFailedOnly(event.target.checked);
              setStart(0);
            }}
          />
          Failed only
        </label>
      </div>
      <AsyncBoundary
        loading={loading}
        error={error}
        data={data}
        onRetry={refetch}
        isEmpty={(page) => page.data.length === 0}
        empty={
          <EmptyState
            title="No decision executions"
            description="No DMN decisions have been evaluated, or the decision engine isn't deployed."
          />
        }
      >
        {(page) => (
          <>
            <DataTable
              caption="Decision executions"
              columns={columns}
              rows={page.data}
              rowKey={(row) => row.id}
            />
            <Pagination start={page.start} size={page.size || PAGE_SIZE} total={page.total} onChange={setStart} />
          </>
        )}
      </AsyncBoundary>
    </>
  );
}

function Workers({ api }: { api: ExternalWorkerApi }) {
  const [start, setStart] = useState(0);
  const { data, error, loading, refetch } = useAsync(
    (signal) => api.list({ start, size: PAGE_SIZE }, signal),
    [api, start],
  );

  const columns = useMemo<Column<ExternalWorkerJobResponse>[]>(
    () => [
      {
        key: "job",
        header: "Job",
        render: (job) => (
          <div className="tf-task-cell">
            <span className="tf-task-cell__name">{job.elementName || job.elementId || job.id}</span>
            <span className="tf-task-cell__description">{job.id}</span>
          </div>
        ),
      },
      {
        key: "lock",
        header: "Lock",
        width: "160px",
        render: (job) =>
          job.lockOwner ? (
            <span title={`Until ${formatDateTime(job.lockExpirationTime ?? undefined)}`}>
              {job.lockOwner}
            </span>
          ) : (
            <span className="tf-muted">Available</span>
          ),
      },
      {
        key: "retries",
        header: "Retries",
        width: "90px",
        secondary: true,
        render: (job) => job.retries ?? "—",
      },
    ],
    [],
  );

  return (
    <AsyncBoundary
      loading={loading}
      error={error}
      data={data}
      onRetry={refetch}
      isEmpty={(page) => page.data.length === 0}
      empty={
        <EmptyState
          title="No external worker jobs"
          description="Nothing is waiting to be picked up by an external worker."
        />
      }
    >
      {(page) => (
        <>
          <DataTable
            caption="External worker jobs"
            columns={columns}
            rows={page.data}
            rowKey={(job) => job.id}
          />
          <Pagination start={page.start} size={page.size || PAGE_SIZE} total={page.total} onChange={setStart} />
        </>
      )}
    </AsyncBoundary>
  );
}

export function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
