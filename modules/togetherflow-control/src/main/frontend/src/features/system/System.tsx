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
  useI18n,
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

/** Order only; each label comes from the catalogue as `system.tab.<id>`. */
const TABS: Tab[] = ["engine", "tables", "subscriptions", "batches", "decisions", "workers"];

export interface SystemProps {
  systemApi: SystemApi;
  decisionHistoryApi: DecisionHistoryApi;
  externalWorkerApi: ExternalWorkerApi;
}

export function System({ systemApi, decisionHistoryApi, externalWorkerApi }: SystemProps) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("engine");

  return (
    <section className="tf-panel" aria-label={t("system.label")}>
      <header className="tf-panel__header">
        <div>
          <h1 className="tf-panel__title">{t("system.title")}</h1>
          <p className="tf-panel__meta">{t("system.meta")}</p>
        </div>
      </header>

      <div className="tf-inbox__filters" role="tablist" aria-label={t("system.sectionLabel")}>
        {TABS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={["tf-chip", tab === id ? "tf-chip--active" : ""].filter(Boolean).join(" ")}
            onClick={() => setTab(id)}
          >
            {t(`system.tab.${id}`)}
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
  const { t } = useI18n();
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
              <dt>{t("system.engine.name")}</dt>
              <dd>{info.name || "—"}</dd>
            </div>
            <div className="tf-facts__item">
              <dt>{t("system.engine.version")}</dt>
              <dd>{info.version || "—"}</dd>
            </div>
            {info.exception ? (
              <div className="tf-facts__item">
                <dt>{t("system.engine.exception")}</dt>
                <dd className="tf-danger-text">{info.exception}</dd>
              </div>
            ) : null}
          </dl>
        )}
      </AsyncBoundary>

      {/*
        Data retention (REQUIREMENTS.md §13.7): "the UI should make retention policy
        visible/configurable, not just executable". Visible is what this engine's REST
        layer allows — history cleanup is engine configuration, with no endpoint to
        change it — so this surfaces the settings that are readable and says plainly
        where the rest lives, rather than implying an operator can set policy here.
      */}
      <section className="tf-panel__section">
        <h2 className="tf-panel__section-title">{t("system.retention.title")}</h2>
        <p className="tf-panel__meta">{t("system.retention.blurb")}</p>
        <AsyncBoundary
          loading={properties.loading}
          error={properties.error}
          data={properties.data}
          onRetry={properties.refetch}
          isEmpty={(props) => retentionProperties(props).length === 0}
          empty={
            <EmptyState
              title={t("system.retention.empty.title")}
              description={t("system.retention.empty.description")}
            />
          }
        >
          {(props) => (
            <table className="tf-table">
              <caption className="tf-visually-hidden">{t("system.retention.caption")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("system.properties.name")}</th>
                  <th scope="col">{t("system.properties.value")}</th>
                </tr>
              </thead>
              <tbody>
                {retentionProperties(props).map(([name, value]) => (
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

      <section className="tf-panel__section">
        <h2 className="tf-panel__section-title">{t("system.properties.title")}</h2>
        <AsyncBoundary
          loading={properties.loading}
          error={properties.error}
          data={properties.data}
          onRetry={properties.refetch}
          isEmpty={(props) => Object.keys(props).length === 0}
          empty={
            <EmptyState
              title={t("system.properties.empty.title")}
              description={t("system.properties.empty.description")}
            />
          }
        >
          {(props) => (
            <table className="tf-table">
              <caption className="tf-visually-hidden">{t("system.properties.caption")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("system.properties.name")}</th>
                  <th scope="col">{t("system.properties.value")}</th>
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
  const { t } = useI18n();
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
          {t("system.tables.back")}
        </button>
        <h2 className="tf-panel__section-title tf-mono">{selected}</h2>
        <p className="tf-panel__meta">
          {t("system.tables.readOnly")}
        </p>
        <AsyncBoundary
          loading={rows.loading}
          error={rows.error}
          data={rows.data}
          onRetry={rows.refetch}
          isEmpty={(page) => !page || page.data.length === 0}
          empty={
            <EmptyState
              title={t("system.tables.rows.empty.title")}
              description={t("system.tables.rows.empty.description")}
            />
          }
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
      empty={
        <EmptyState
          title={t("system.tables.empty.title")}
          description={t("system.tables.empty.description")}
        />
      }
    >
      {(list) => (
        <ul className="tf-cards">
          {list.map((table) => (
            <li key={table.name}>
              <button type="button" className="tf-card" onClick={() => setSelected(table.name)}>
                <span className="tf-card__title tf-mono">{table.name}</span>
                <span className="tf-card__meta">
                  {t("system.tables.rowCount", { count: table.count ?? 0 })}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </AsyncBoundary>
  );
}

function Subscriptions({ systemApi }: { systemApi: SystemApi }) {
  const { t, locale } = useI18n();
  const [start, setStart] = useState(0);
  const { data, error, loading, refetch } = useAsync(
    (signal) => systemApi.listEventSubscriptions({ start, size: PAGE_SIZE }, signal),
    [systemApi, start],
  );

  const columns = useMemo<Column<EventSubscriptionResponse>[]>(
    () => [
      {
        key: "event",
        header: t("system.subscriptions.column.event"),
        render: (sub) => (
          <div className="tf-task-cell">
            <span className="tf-task-cell__name">{sub.eventName || sub.eventType || sub.id}</span>
            <span className="tf-task-cell__description">{sub.eventType}</span>
          </div>
        ),
      },
      {
        key: "activity",
        header: t("system.subscriptions.column.activity"),
        secondary: true,
        render: (sub) => sub.activityId || "—",
      },
      {
        key: "created",
        header: t("system.subscriptions.column.created"),
        width: "180px",
        secondary: true,
        render: (sub) => formatDateTime(sub.created ?? undefined, locale),
      },
    ],
    [locale, t],
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
          title={t("system.subscriptions.empty.title")}
          description={t("system.subscriptions.empty.description")}
        />
      }
    >
      {(page) => (
        <>
          <DataTable
            caption={t("system.subscriptions.caption")}
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
  const { t, locale } = useI18n();
  const [start, setStart] = useState(0);
  const { data, error, loading, refetch } = useAsync(
    (signal) => systemApi.listBatches({ start, size: PAGE_SIZE }, signal),
    [systemApi, start],
  );

  const columns = useMemo<Column<BatchResponse>[]>(
    () => [
      {
        key: "type",
        header: t("system.batches.column.batch"),
        render: (batch) => (
          <div className="tf-task-cell">
            <span className="tf-task-cell__name">{batch.batchType || batch.id}</span>
            <span className="tf-task-cell__description">{batch.id}</span>
          </div>
        ),
      },
      {
        key: "status",
        header: t("system.batches.column.status"),
        width: "140px",
        render: (batch) => <span className="tf-badge tf-badge--running">{batch.status || "—"}</span>,
      },
      {
        key: "created",
        header: t("system.batches.column.created"),
        width: "180px",
        secondary: true,
        render: (batch) => formatDateTime(batch.createTime ?? undefined, locale),
      },
    ],
    [locale, t],
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
          title={t("system.batches.empty.title")}
          description={t("system.batches.empty.description")}
        />
      }
    >
      {(page) => (
        <>
          <DataTable
            caption={t("system.batches.caption")}
            columns={columns}
            rows={page.data}
            rowKey={(b) => b.id}
          />
          <Pagination start={page.start} size={page.size || PAGE_SIZE} total={page.total} onChange={setStart} />
        </>
      )}
    </AsyncBoundary>
  );
}

function Decisions({ api }: { api: DecisionHistoryApi }) {
  const { t, locale } = useI18n();
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
        header: t("system.decisions.column.decision"),
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
        header: t("system.decisions.column.outcome"),
        width: "120px",
        render: (row) =>
          row.failed ? (
            <span className="tf-badge tf-badge--danger">{t("system.decisions.failed")}</span>
          ) : (
            <span className="tf-badge tf-badge--done">OK</span>
          ),
      },
      {
        key: "when",
        header: t("system.decisions.column.executed"),
        width: "180px",
        secondary: true,
        render: (row) => formatDateTime(row.startTime ?? undefined, locale),
      },
    ],
    [locale, t],
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
          {t("jobs.failedOnly")}
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
            title={t("system.decisions.empty.title")}
            description={t("system.decisions.empty.description")}
          />
        }
      >
        {(page) => (
          <>
            <DataTable
              caption={t("system.decisions.caption")}
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
  const { t, locale } = useI18n();
  const [start, setStart] = useState(0);
  const { data, error, loading, refetch } = useAsync(
    (signal) => api.list({ start, size: PAGE_SIZE }, signal),
    [api, start],
  );

  const columns = useMemo<Column<ExternalWorkerJobResponse>[]>(
    () => [
      {
        key: "job",
        header: t("system.workers.column.job"),
        render: (job) => (
          <div className="tf-task-cell">
            <span className="tf-task-cell__name">{job.elementName || job.elementId || job.id}</span>
            <span className="tf-task-cell__description">{job.id}</span>
          </div>
        ),
      },
      {
        key: "lock",
        header: t("system.workers.column.lock"),
        width: "160px",
        render: (job) =>
          job.lockOwner ? (
            <span
              title={t("system.workers.lockedUntil", {
                when: formatDateTime(job.lockExpirationTime ?? undefined, locale),
              })}
            >
              {job.lockOwner}
            </span>
          ) : (
            <span className="tf-muted">{t("system.workers.available")}</span>
          ),
      },
      {
        key: "retries",
        header: t("system.workers.column.retries"),
        width: "90px",
        secondary: true,
        render: (job) => job.retries ?? "—",
      },
    ],
    [locale, t],
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
          title={t("system.workers.empty.title")}
          description={t("system.workers.empty.description")}
        />
      }
    >
      {(page) => (
        <>
          <DataTable
            caption={t("system.workers.caption")}
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

/**
 * The engine properties that describe how long data is kept. Matched by name because
 * the engine exposes properties as a flat map with no schema — a deployment that names
 * things differently simply shows nothing here, which is the honest outcome.
 */
export function retentionProperties(properties: Record<string, string>): [string, string][] {
  // Deliberately not matching a bare "ttl": it catches `cache.ttl` and similar, and a
  // retention table padded with unrelated settings is harder to trust than a short one.
  return Object.entries(properties).filter(([name]) =>
    /history|cleanup|retention/i.test(name),
  );
}

export function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
