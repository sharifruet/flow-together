/**
 * "My history" (REQUIREMENTS.md §7.1): completed tasks and process instances the
 * signed-in user was involved in, from the historic query resources.
 */

import { useEffect, useMemo, useState } from "react";
import {
  AsyncBoundary,
  DataTable,
  EmptyState,
  NoResultsState,
  Pagination,
  formatDateTime,
  useAsync,
  type Column,
  type HistoricProcessInstanceResponse,
  type HistoricTaskInstanceResponse,
  type HistoryApi,
} from "@togetherflow/common";

type HistoryTab = "tasks" | "instances";

const PAGE_SIZE = 25;

export interface MyHistoryProps {
  historyApi: HistoryApi;
  userId: string;
}

export function MyHistory({ historyApi, userId }: MyHistoryProps) {
  const [tab, setTab] = useState<HistoryTab>("tasks");

  return (
    <section className="tf-history" aria-label="My history">
      <h1 className="tf-start__title">My history</h1>
      <p className="tf-start__meta">Work you've completed or been involved in.</p>

      <div className="tf-inbox__filters" role="tablist" aria-label="History type">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "tasks"}
          className={chipClass(tab === "tasks")}
          onClick={() => setTab("tasks")}
        >
          Completed tasks
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "instances"}
          className={chipClass(tab === "instances")}
          onClick={() => setTab("instances")}
        >
          Process instances
        </button>
      </div>

      {tab === "tasks" ? (
        <CompletedTasks historyApi={historyApi} userId={userId} />
      ) : (
        <MyInstances historyApi={historyApi} userId={userId} />
      )}
    </section>
  );
}

function CompletedTasks({ historyApi, userId }: MyHistoryProps) {
  const [start, setStart] = useState(0);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

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
        header: "Task",
        render: (task) => (
          <span className="tf-task-cell__name">{task.name ?? "(untitled task)"}</span>
        ),
      },
      {
        key: "completed",
        header: "Completed",
        width: "190px",
        render: (task) => formatDateTime(task.endTime ?? undefined),
      },
      {
        key: "duration",
        header: "Took",
        width: "120px",
        secondary: true,
        render: (task) => formatDuration(task.durationInMillis),
      },
    ],
    [],
  );

  return (
    <>
      <div className="tf-history__search">
        <label className="tf-visually-hidden" htmlFor="tf-history-search">
          Search completed tasks
        </label>
        <input
          id="tf-history-search"
          className="tf-input"
          type="search"
          placeholder="Search completed tasks…"
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
              title="Nothing completed yet"
              description="Tasks you finish will be listed here."
            />
          )
        }
      >
        {(page) => (
          <>
            <DataTable
              caption="Completed tasks"
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
        header: "Process",
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
        header: "Status",
        width: "120px",
        render: (instance) =>
          instance.endTime ? (
            <span className="tf-badge tf-badge--done">Completed</span>
          ) : (
            <span className="tf-badge tf-badge--running">Running</span>
          ),
      },
      {
        key: "started",
        header: "Started",
        width: "190px",
        secondary: true,
        render: (instance) => formatDateTime(instance.startTime ?? undefined),
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
          title="No process instances yet"
          description="Processes you start or take part in will be listed here."
        />
      }
    >
      {(page) => (
        <>
          <DataTable
            caption="My process instances"
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
