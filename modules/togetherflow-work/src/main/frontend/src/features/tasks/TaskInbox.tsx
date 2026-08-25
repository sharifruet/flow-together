import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AsyncBoundary,
  Button,
  DataTable,
  EmptyState,
  NoResultsState,
  Pagination,
  dueState,
  formatDate,
  priorityLabel,
  useAsync,
  type Column,
  type TaskApi,
  type TaskQueryRequest,
  type TaskResponse,
} from "@togetherflow/common";

export type InboxFilter = "mine" | "claimable" | "involved";

const PAGE_SIZE = 25;

const FILTER_LABELS: Record<InboxFilter, string> = {
  mine: "Assigned to me",
  claimable: "Available to claim",
  involved: "Involving me",
};

export interface TaskInboxProps {
  taskApi: TaskApi;
  userId: string;
  selectedTaskId?: string;
  onSelectTask: (task: TaskResponse) => void;
  /** Bumped by the parent after a completed action so the list refetches. */
  refreshToken: number;
  onStartWork: () => void;
}

export function TaskInbox({
  taskApi,
  userId,
  selectedTaskId,
  onSelectTask,
  refreshToken,
  onStartWork,
}: TaskInboxProps) {
  const [filter, setFilter] = useState<InboxFilter>("mine");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [start, setStart] = useState(0);

  // Type-ahead filtering rather than submit-and-wait (§14.4).
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const request = useMemo<TaskQueryRequest>(() => {
    const base: TaskQueryRequest = {
      start,
      size: PAGE_SIZE,
      sort: "dueDate",
      order: "asc",
      active: true,
      ...(debouncedSearch ? { nameLikeIgnoreCase: `%${debouncedSearch}%` } : {}),
    };
    if (filter === "mine") return { ...base, assignee: userId };
    if (filter === "claimable") return { ...base, candidateUser: userId, unassigned: true };
    return { ...base, involvedUser: userId };
  }, [filter, debouncedSearch, start, userId]);

  const { data, error, loading, refetch } = useAsync(
    (signal) => taskApi.query(request, signal),
    [taskApi, request, refreshToken],
  );

  const columns = useMemo<Column<TaskResponse>[]>(
    () => [
      {
        key: "name",
        header: "Task",
        render: (task) => (
          <div className="tf-task-cell">
            <span className="tf-task-cell__name">{task.name ?? "(untitled task)"}</span>
            {task.description ? (
              <span className="tf-task-cell__description">{task.description}</span>
            ) : null}
          </div>
        ),
      },
      {
        key: "assignee",
        header: "Assignee",
        secondary: true,
        render: (task) =>
          task.assignee ? task.assignee : <span className="tf-muted">Unassigned</span>,
      },
      {
        key: "due",
        header: "Due",
        width: "150px",
        render: (task) => {
          const due = dueState(task.dueDate);
          return (
            <span className={`tf-due tf-due--${due.tone}`} title={formatDate(task.dueDate)}>
              {due.label}
            </span>
          );
        },
      },
      {
        key: "priority",
        header: "Priority",
        width: "100px",
        secondary: true,
        render: (task) => priorityLabel(task.priority),
      },
    ],
    [],
  );

  const clearFilters = useCallback(() => {
    setSearch("");
    setFilter("mine");
    setStart(0);
  }, []);

  const hasSearch = debouncedSearch !== "";

  return (
    <section className="tf-inbox" aria-label="Task inbox">
      <header className="tf-inbox__header">
        <div className="tf-inbox__filters" role="tablist" aria-label="Task filter">
          {(Object.keys(FILTER_LABELS) as InboxFilter[]).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              className={[
                "tf-chip",
                filter === key ? "tf-chip--active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => {
                setFilter(key);
                setStart(0);
              }}
            >
              {FILTER_LABELS[key]}
            </button>
          ))}
        </div>
        <div className="tf-inbox__search">
          <label className="tf-visually-hidden" htmlFor="tf-task-search">
            Search tasks by name
          </label>
          <input
            id="tf-task-search"
            className="tf-input"
            type="search"
            placeholder="Search tasks…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              // Reset paging as soon as the query changes, not after the debounce,
              // so the user never sees page 3 of a search they just replaced.
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
          hasSearch ? (
            <NoResultsState onClear={clearFilters} />
          ) : (
            <EmptyState
              title={emptyTitle(filter)}
              description={emptyDescription(filter)}
              action={
                filter === "mine" ? (
                  <Button onClick={onStartWork}>Start something new</Button>
                ) : undefined
              }
            />
          )
        }
      >
        {(page) => (
          <>
            <DataTable
              caption="Tasks"
              columns={columns}
              rows={page.data}
              rowKey={(task) => task.id}
              selectedKey={selectedTaskId}
              onRowClick={onSelectTask}
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

function emptyTitle(filter: InboxFilter): string {
  switch (filter) {
    case "mine":
      return "No tasks assigned to you";
    case "claimable":
      return "Nothing available to claim";
    case "involved":
      return "You're not involved in any open tasks";
  }
}

function emptyDescription(filter: InboxFilter): string {
  switch (filter) {
    case "mine":
      return "You're all caught up. Tasks assigned to you will appear here.";
    case "claimable":
      return "When a task is offered to one of your groups, it'll show up here to claim.";
    case "involved":
      return "Tasks where you're an owner, candidate or participant will appear here.";
  }
}
