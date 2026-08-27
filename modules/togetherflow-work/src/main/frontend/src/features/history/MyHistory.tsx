/**
 * "My history" (REQUIREMENTS.md §7.1): completed tasks and process instances the
 * signed-in user was involved in, from the historic query resources.
 */

import { useMemo, useState } from "react";
import {
  Badge,
  AsyncBoundary,
  DataTable,
  EmptyState,
  NoResultsState,
  Pagination,
  formatDateTime,
  useAsync,
  useDebouncedValue,
  useI18n,
  useT,
  type Column,
  type HistoricProcessInstanceResponse,
  type HistoricTaskInstanceResponse,
  type CaseApi,
  type CaseInstanceResponse,
  type HistoryApi,
} from "@togetherflow/common";

type HistoryTab = "tasks" | "instances" | "cases";

const PAGE_SIZE = 25;

export interface MyHistoryProps {
  historyApi: HistoryApi;
  userId: string;
}

export interface MyHistoryScreenProps extends MyHistoryProps {
  caseApi: CaseApi;
}

export function MyHistory({ historyApi, caseApi, userId }: MyHistoryScreenProps) {
  const t = useT();
  const [tab, setTab] = useState<HistoryTab>("tasks");

  return (
    <section className="tf-history" aria-label={t("history.label")}>
      <h1 className="tf-start__title">{t("history.title")}</h1>
      <p className="tf-start__meta">{t("history.subtitle")}</p>

      <div className="tf-inbox__filters" role="tablist" aria-label={t("history.typeLabel")}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "tasks"}
          className={chipClass(tab === "tasks")}
          onClick={() => setTab("tasks")}
        >
          {t("history.tab.tasks")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "instances"}
          className={chipClass(tab === "instances")}
          onClick={() => setTab("instances")}
        >
          {t("history.tab.instances")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "cases"}
          className={chipClass(tab === "cases")}
          onClick={() => setTab("cases")}
        >
          {t("history.tab.cases")}
        </button>
      </div>

      {tab === "tasks" ? (
        <CompletedTasks historyApi={historyApi} userId={userId} />
      ) : tab === "instances" ? (
        <MyInstances historyApi={historyApi} userId={userId} />
      ) : (
        <MyCaseHistory caseApi={caseApi} userId={userId} />
      )}
    </section>
  );
}

function CompletedTasks({ historyApi, userId }: MyHistoryProps) {
  const { t, locale } = useI18n();
  const [start, setStart] = useState(0);
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search.trim(), 250);

  const request = useMemo(
    () => ({
      start,
      size: PAGE_SIZE,
      sort: "endTime",
      order: "desc" as const,
      taskAssignee: userId,
      finished: true,
      ...(debounced ? { taskNameLikeIgnoreCase: `%${debounced}%` } : {}),
    }),
    [start, userId, debounced],
  );

  const { data, error, loading, refetch } = useAsync(
    (signal) => historyApi.queryTasks(request, signal),
    [historyApi, request],
  );

  const columns = useMemo<Column<HistoricTaskInstanceResponse>[]>(
    () => [
      {
        key: "name",
        header: t("history.tasks.column.task"),
        render: (task) => (
          <span className="tf-task-cell__name">{task.name ?? t("inbox.untitled")}</span>
        ),
      },
      {
        key: "completed",
        header: t("history.tasks.column.completed"),
        width: "190px",
        render: (task) => formatDateTime(task.endTime ?? undefined, locale),
      },
      {
        key: "duration",
        header: t("history.tasks.column.took"),
        width: "120px",
        secondary: true,
        render: (task) => formatDuration(task.durationInMillis),
      },
    ],
    [t, locale],
  );

  return (
    <>
      <div className="tf-history__search">
        <label className="tf-visually-hidden" htmlFor="tf-history-search">
          {t("history.tasks.searchLabel")}
        </label>
        <input
          id="tf-history-search"
          className="tf-input"
          type="search"
          placeholder={t("history.tasks.search")}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setStart(0);
          }}
        />
      </div>

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
              title={t("history.tasks.empty.title")}
              description={t("history.tasks.empty.description")}
            />
          )
        }
      >
        {(page) => (
          <>
            <DataTable
              caption={t("history.tasks.caption")}
              columns={columns}
              rows={page.data}
              rowKey={(task) => task.id}
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
    </>
  );
}

function MyInstances({ historyApi, userId }: MyHistoryProps) {
  const { t, locale } = useI18n();
  const [start, setStart] = useState(0);

  const request = useMemo(
    () => ({
      start,
      size: PAGE_SIZE,
      sort: "startTime",
      order: "desc" as const,
      involvedUser: userId,
    }),
    [start, userId],
  );

  const { data, error, loading, refetch } = useAsync(
    (signal) => historyApi.queryProcessInstances(request, signal),
    [historyApi, request],
  );

  const columns = useMemo<Column<HistoricProcessInstanceResponse>[]>(
    () => [
      {
        key: "name",
        header: t("history.instances.column.process"),
        render: (instance) => (
          <div className="tf-task-cell">
            <span className="tf-task-cell__name">
              {instance.name ?? instance.processDefinitionName ?? instance.id}
            </span>
            {instance.businessKey ? (
              <span className="tf-task-cell__description">{instance.businessKey}</span>
            ) : null}
          </div>
        ),
      },
      {
        key: "status",
        header: t("history.instances.column.status"),
        width: "120px",
        render: (instance) =>
          instance.endTime ? (
            <Badge tone="success">{t("history.status.completed")}</Badge>
          ) : (
            <Badge tone="info">{t("history.status.running")}</Badge>
          ),
      },
      {
        key: "started",
        header: t("history.instances.column.started"),
        width: "190px",
        secondary: true,
        render: (instance) => formatDateTime(instance.startTime ?? undefined, locale),
      },
    ],
    [t, locale],
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
          title={t("history.instances.empty.title")}
          description={t("history.instances.empty.description")}
        />
      }
    >
      {(page) => (
        <>
          <DataTable
            caption={t("history.instances.caption")}
            columns={columns}
            rows={page.data}
            rowKey={(instance) => instance.id}
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
  );
}

function chipClass(active: boolean): string {
  return ["tf-chip", active ? "tf-chip--active" : ""].filter(Boolean).join(" ");
}

export function formatDuration(millis: number | null | undefined): string {
  if (millis === null || millis === undefined) return "—";
  const seconds = Math.round(millis / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

/**
 * Cases the user took part in.
 *
 * Uses the historic query rather than the runtime one: a finished case is gone from the
 * runtime tables, and "my history" is mostly about finished work. Running cases are
 * included too (the historic tables hold both), so this stays a complete record rather
 * than silently omitting anything still open.
 */
function MyCaseHistory({ caseApi, userId }: { caseApi: CaseApi; userId: string }) {
  const { t, locale } = useI18n();
  const [start, setStart] = useState(0);

  const request = useMemo(
    () => ({ start, size: PAGE_SIZE, involvedUser: userId }),
    [start, userId],
  );

  const { data, error, loading, refetch } = useAsync(
    (signal) => caseApi.queryHistoric(request, signal),
    [caseApi, request],
  );

  const columns = useMemo<Column<CaseInstanceResponse>[]>(
    () => [
      {
        key: "name",
        header: t("history.cases.column.case"),
        render: (instance) => (
          <div className="tf-task-cell">
            <span className="tf-task-cell__name">
              {instance.name || instance.caseDefinitionName || instance.id}
            </span>
            {instance.businessKey ? (
              <span className="tf-task-cell__description">{instance.businessKey}</span>
            ) : null}
          </div>
        ),
      },
      {
        key: "status",
        header: t("history.instances.column.status"),
        width: "120px",
        render: (instance) =>
          instance.endTime ? (
            <Badge tone="success">{t("history.status.completed")}</Badge>
          ) : (
            <Badge tone="info">{t("history.status.running")}</Badge>
          ),
      },
      {
        key: "started",
        header: t("history.instances.column.started"),
        width: "190px",
        secondary: true,
        render: (instance) => formatDateTime(instance.startTime ?? undefined, locale),
      },
    ],
    [t, locale],
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
          title={t("history.cases.empty.title")}
          description={t("history.cases.empty.description")}
        />
      }
    >
      {(page) => (
        <>
          <DataTable
            caption={t("history.cases.caption")}
            columns={columns}
            rows={page.data}
            rowKey={(instance) => instance.id}
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
  );
}
