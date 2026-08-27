import { useCallback, useMemo } from "react";
import {
  AsyncBoundary,
  Badge,
  Button,
  DataTable,
  EmptyState,
  Icon,
  NoResultsState,
  PageHeader,
  Pagination,
  SavedViews,
  UserChip,
  dueState,
  formatDate,
  priorityLabel,
  toneForPriority,
  useAsync,
  useDebouncedValue,
  useI18n,
  useListState,
  useRegisterShortcuts,
  useSavedViews,
  type Column,
  type ProcessApi,
  type TaskApi,
  type TaskQueryRequest,
  type Shortcut,
  type TaskResponse,
} from "@togetherflow/common";

export type InboxFilter = "mine" | "claimable" | "involved";

/** §7.1 asks for a due-date filter; these are the bands an inbox is actually triaged by. */
export type DueFilter = "any" | "overdue" | "today" | "week" | "none";

/** Matches the bands `priorityLabel` reports, so the filter and the column agree. */
export type PriorityFilter = "any" | "high" | "normal" | "low";

const FILTERS: InboxFilter[] = ["mine", "claimable", "involved"];
const DUE_FILTERS: DueFilter[] = ["any", "overdue", "today", "week", "none"];
const PRIORITY_FILTERS: PriorityFilter[] = ["any", "high", "normal", "low"];

/**
 * What a saved view captures (§14.4) — everything except which page you were on — and,
 * since W1.3, what the query string carries.
 *
 * The index signature is what `useListState` needs: a query string holds strings, so a
 * filter set has to be readable as one. The named members keep the call sites typed.
 */
export interface InboxView {
  [key: string]: string;
  filter: InboxFilter;
  search: string;
  definitionKey: string;
  due: DueFilter;
  priority: PriorityFilter;
}

const DEFAULT_VIEW: InboxView = {
  filter: "mine",
  search: "",
  definitionKey: "",
  due: "any",
  priority: "any",
};

export interface TaskInboxProps {
  taskApi: TaskApi;
  /** Populates the definition filter (§7.1). Omitted, the filter is simply not offered. */
  processApi?: ProcessApi;
  userId: string;
  selectedTaskId?: string;
  onSelectTask: (task: TaskResponse) => void;
  /** Bumped by the parent after a completed action so the list refetches. */
  refreshToken: number;
  onStartWork: () => void;
}

export function TaskInbox({
  taskApi,
  processApi,
  userId,
  selectedTaskId,
  onSelectTask,
  refreshToken,
  onStartWork,
}: TaskInboxProps) {
  const { t, locale } = useI18n();
  /*
   * Filters, sort and page live in the URL since W1.3 (F1). A filtered inbox is now a
   * link an operator can paste into a ticket, and a refresh no longer clears it.
   */
  const list = useListState<InboxView>({
    defaults: DEFAULT_VIEW,
    defaultSort: { key: "dueDate", order: "asc" },
    preferenceKey: "work.inbox",
  });
  const view = list.filters;
  const { setStart } = list;
  const savedViews = useSavedViews<InboxView>("work.inbox");

  // Type-ahead filtering rather than submit-and-wait (§14.4).
  const debouncedSearch = useDebouncedValue(view.search.trim(), 250);

  const update = list.setFilters;
  const applyView = list.replaceFilters;

  const definitions = useAsync(
    (signal) =>
      processApi
        ? processApi.listDefinitions({ latest: true, size: 200 }, signal)
        : Promise.resolve(undefined),
    [processApi],
  );

  const request = useMemo<TaskQueryRequest>(() => {
    const base: TaskQueryRequest = {
      start: list.start,
      size: list.size,
      // Sortable headers wired to the query (C1); before this it was hardcoded to dueDate.
      sort: (list.sort?.key ?? "dueDate") as TaskQueryRequest["sort"],
      order: list.sort?.order ?? "asc",
      active: true,
      ...(debouncedSearch ? { nameLikeIgnoreCase: `%${debouncedSearch}%` } : {}),
      ...(view.definitionKey ? { processDefinitionKey: view.definitionKey } : {}),
      ...dueQuery(view.due),
      ...priorityQuery(view.priority),
    };
    if (view.filter === "mine") return { ...base, assignee: userId };
    if (view.filter === "claimable") return { ...base, candidateUser: userId, unassigned: true };
    return { ...base, involvedUser: userId };
  }, [
    view.filter,
    view.definitionKey,
    view.due,
    view.priority,
    debouncedSearch,
    list.start,
    list.size,
    list.sort,
    userId,
  ]);

  const { data, error, loading, refetch } = useAsync(
    (signal) => taskApi.query(request, signal),
    [taskApi, request, refreshToken],
  );

  const columns = useMemo<Column<TaskResponse>[]>(
    () => [
      {
        key: "name",
        header: t("inbox.column.task"),
        sortKey: "name",
        required: true,
        render: (task) => (
          <div className="tf-task-cell">
            <span className="tf-task-cell__name">{task.name ?? t("inbox.untitled")}</span>
            {task.description ? (
              <span className="tf-task-cell__description">{task.description}</span>
            ) : null}
          </div>
        ),
      },
      {
        key: "assignee",
        header: t("inbox.column.assignee"),
        secondary: true,
        sortKey: "assignee",
        // D1: a raw engine id, on the screen whose whole subject is who is doing what.
        render: (task) =>
          task.assignee ? (
            <UserChip userId={task.assignee} />
          ) : (
            <span className="tf-muted">{t("inbox.unassigned")}</span>
          ),
      },
      {
        key: "due",
        header: t("inbox.column.due"),
        width: "150px",
        sortKey: "dueDate",
        render: (task) => {
          const due = dueState(task.dueDate, {
            locale,
            noDueDateLabel: t("format.noDueDate"),
          });
          return (
            <span
              className={`tf-due tf-due--${due.tone}`}
              title={formatDate(task.dueDate, locale)}
            >
              {due.label}
            </span>
          );
        },
      },
      {
        key: "priority",
        header: t("inbox.column.priority"),
        width: "100px",
        secondary: true,
        sortKey: "priority",
        // C3: this was the bare words "High"/"Normal" — the backlog's own example of
        // status rendered as prose.
        render: (task) => (
          <Badge tone={toneForPriority(task.priority)}>{priorityLabel(task.priority, t)}</Badge>
        ),
      },
    ],
    [t, locale],
  );

  const clearFilters = list.clearFilters;

  /*
   * Moving through the list without the mouse (§14.4). Registered here rather than at the
   * app root because this is where the rows are — and because they should not exist on a
   * screen that has no list.
   */
  // Memoised so `step`'s identity is stable across renders that did not change the page.
  const rows = useMemo(() => data?.data ?? [], [data]);
  const step = useCallback(
    (delta: number) => {
      if (rows.length === 0) return;
      const current = rows.findIndex((task) => task.id === selectedTaskId);
      // With nothing selected, "next" opens the first row and "previous" the last.
      const next = current === -1 ? (delta > 0 ? 0 : rows.length - 1) : current + delta;
      const clamped = Math.min(Math.max(next, 0), rows.length - 1);
      onSelectTask(rows[clamped]);
    },
    [rows, selectedTaskId, onSelectTask],
  );

  const shortcuts = useMemo<Shortcut[]>(
    () => [
      { key: "j", description: t("shortcuts.nextTask"), run: () => step(1) },
      { key: "k", description: t("shortcuts.previousTask"), run: () => step(-1) },
    ],
    [t, step],
  );
  useRegisterShortcuts(shortcuts);

  /** A zero-results state is only honest when something was actually narrowed. */
  const isNarrowed =
    debouncedSearch !== "" ||
    view.definitionKey !== "" ||
    view.due !== "any" ||
    view.priority !== "any";

  return (
    <section className="tf-inbox" aria-label={t("inbox.label")}>
      <PageHeader
        title={t("inbox.title")}
        description={t("inbox.description")}
        meta={
          data ? (
            <Badge tone="info" subtle srLabel={t("inbox.countLabel", { count: data.total })}>
              {data.total}
            </Badge>
          ) : undefined
        }
        actions={
          <Button onClick={onStartWork}>
            <Icon name="add" size={16} />
            {t("inbox.startWork")}
          </Button>
        }
      >
      <header className="tf-inbox__header">
        <div className="tf-inbox__filters" role="tablist" aria-label={t("inbox.filterLabel")}>
          {FILTERS.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={view.filter === key}
              className={["tf-chip", view.filter === key ? "tf-chip--active" : ""]
                .filter(Boolean)
                .join(" ")}
              onClick={() => update({ filter: key })}
            >
              {t(`inbox.filter.${key}`)}
            </button>
          ))}
        </div>
        <div className="tf-inbox__search">
          <label className="tf-visually-hidden" htmlFor="tf-task-search">
            {t("inbox.search.label")}
          </label>
          <input
            id="tf-task-search"
            className="tf-input"
            type="search"
            placeholder={t("inbox.search.placeholder")}
            value={view.search}
            onChange={(event) => update({ search: event.target.value })}
          />
        </div>
      </header>

      {/* §7.1's remaining filters: process/case definition, due date, priority. */}
      <div className="tf-filter-bar">
        {processApi ? (
          <label className="tf-filter-bar__field">
            <span className="tf-filter-bar__label">{t("inbox.definition.label")}</span>
            <select
              className="tf-input tf-select"
              value={view.definitionKey}
              onChange={(event) => update({ definitionKey: event.target.value })}
            >
              <option value="">{t("inbox.definition.any")}</option>
              {(definitions.data?.data ?? []).map((definition) => (
                <option key={definition.id} value={definition.key}>
                  {definition.name || definition.key}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="tf-filter-bar__field">
          <span className="tf-filter-bar__label">{t("inbox.due.label")}</span>
          <select
            className="tf-input tf-select"
            value={view.due}
            onChange={(event) => update({ due: event.target.value as DueFilter })}
          >
            {DUE_FILTERS.map((option) => (
              <option key={option} value={option}>
                {t(`inbox.due.${option}`)}
              </option>
            ))}
          </select>
        </label>

        <label className="tf-filter-bar__field">
          <span className="tf-filter-bar__label">{t("inbox.priority.label")}</span>
          <select
            className="tf-input tf-select"
            value={view.priority}
            onChange={(event) => update({ priority: event.target.value as PriorityFilter })}
          >
            {PRIORITY_FILTERS.map((option) => (
              <option key={option} value={option}>
                {option === "any" ? t("inbox.priority.any") : t(`format.priority.${option}`)}
              </option>
            ))}
          </select>
        </label>

        <SavedViews
          views={savedViews.views}
          current={view}
          onApply={applyView}
          onSave={savedViews.save}
          onRemove={savedViews.remove}
        />
        {savedViews.views.length > 0 ? (
          <p className="tf-filter-bar__note">{t("savedViews.note")}</p>
        ) : null}
      </div>
      </PageHeader>

      <AsyncBoundary
        loading={loading}
        error={error}
        data={data}
        onRetry={refetch}
        isEmpty={(page) => page.data.length === 0}
        empty={
          isNarrowed ? (
            <NoResultsState onClear={clearFilters} />
          ) : (
            <EmptyState
              illustration="inbox-clear"
              title={t(`inbox.empty.${view.filter}.title`)}
              description={t(`inbox.empty.${view.filter}.description`)}
              action={
                view.filter === "mine" ? (
                  <Button onClick={onStartWork}>{t("inbox.empty.startSomething")}</Button>
                ) : undefined
              }
            />
          )
        }
      >
        {(page) => (
          <>
            <DataTable
              caption={t("inbox.caption")}
              preferenceKey="work.inbox"
              columns={columns}
              rows={page.data}
              rowKey={(task) => task.id}
              selectedKey={selectedTaskId}
              onRowClick={onSelectTask}
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

/**
 * The engine filters on absolute instants, so the bands are resolved here rather than
 * sent as names. `withoutDueDate` is a separate flag, not a date — a task with no due
 * date matches no range at all.
 */
function dueQuery(due: DueFilter, now: Date = new Date()): TaskQueryRequest {
  if (due === "any") return {};
  if (due === "none") return { withoutDueDate: true };
  if (due === "overdue") return { dueBefore: now.toISOString() };

  // "Today" and "this week" are bounded at both ends: an overdue task is already its
  // own band, and folding it into "due today" would double-count the thing a user is
  // most likely filtering to separate.
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  if (due === "week") end.setDate(end.getDate() + 6);
  return { dueAfter: from.toISOString(), dueBefore: end.toISOString() };
}

/** Bands match `priorityKey`: high ≥ 75, normal 26–74, low ≤ 25. */
function priorityQuery(priority: PriorityFilter): TaskQueryRequest {
  switch (priority) {
    case "high":
      return { minimumPriority: 75 };
    case "normal":
      return { minimumPriority: 26, maximumPriority: 74 };
    case "low":
      return { maximumPriority: 25 };
    default:
      return {};
  }
}
