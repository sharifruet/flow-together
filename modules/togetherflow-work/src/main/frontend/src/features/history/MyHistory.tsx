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
  Button,
  FormRenderer,
  Modal,
  asReadOnlyModel,
  initialValues,
  type FormModelResponse,
  type TaskApi,
} from "@togetherflow/common";

type HistoryTab = "tasks" | "instances" | "cases";

const PAGE_SIZE = 25;

export interface MyHistoryProps {
  historyApi: HistoryApi;
  /** Reads a completed task's recorded submission (FR-H.3); absent hides the column. */
  taskApi?: TaskApi;
  userId: string;
}

export interface MyHistoryScreenProps extends MyHistoryProps {
  caseApi: CaseApi;
}

export function MyHistory({ historyApi, caseApi, taskApi, userId }: MyHistoryScreenProps) {
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
        <CompletedTasks historyApi={historyApi} taskApi={taskApi} userId={userId} />
      ) : tab === "instances" ? (
        <MyInstances historyApi={historyApi} userId={userId} />
      ) : (
        <MyCaseHistory caseApi={caseApi} userId={userId} />
      )}
    </section>
  );
}

function CompletedTasks({ historyApi, taskApi, userId }: MyHistoryProps) {
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

  /** The completed task whose recorded form is open, if any. */
  const [viewing, setViewing] = useState<HistoricTaskInstanceResponse | null>(null);

  const columns = useMemo<Column<HistoricTaskInstanceResponse>[]>(
    () => [
      {
        key: "name",
        header: t("history.tasks.column.task"),
        render: (task) => (
          <span className="tf-task-cell__name">{task.name ?? t("inbox.untitled")}</span>
        ),
      },
      ...(taskApi
        ? [
            {
              key: "form",
              header: t("history.tasks.column.form"),
              width: "140px",
              render: (task: HistoricTaskInstanceResponse) =>
                task.formKey ? (
                  <Button variant="ghost" onClick={() => setViewing(task)}>
                    {t("history.tasks.viewForm")}
                  </Button>
                ) : (
                  <span className="tf-muted">—</span>
                ),
            } satisfies Column<HistoricTaskInstanceResponse>,
          ]
        : []),
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
    [t, locale, taskApi],
  );

  return (
    <>
      {viewing && taskApi ? (
        <SubmittedForm task={viewing} taskApi={taskApi} onClose={() => setViewing(null)} />
      ) : null}
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

/**
 * A completed task's recorded submission, read-only (FR-H.3): the form engine's own
 * model with the values as they were sent, plus who sent them, when, and which outcome.
 */
function SubmittedForm({
  task,
  taskApi,
  onClose,
}: {
  task: HistoricTaskInstanceResponse;
  taskApi: TaskApi;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const submission = useAsync((signal) => taskApi.getHistoricForm(task.id, signal, task), [taskApi, task]);
  const model: FormModelResponse | null = submission.data ?? null;

  return (
    <Modal
      open
      size="lg"
      title={task.name ?? t("inbox.untitled")}
      description={
        model?.submittedBy || model?.submittedDate
          ? t("history.form.submitted", {
              by: model.submittedBy ?? "—",
              when: formatDateTime(model.submittedDate ?? undefined, locale),
            })
          : t("history.form.title")
      }
      onClose={onClose}
      actions={
        <Button variant="secondary" onClick={onClose}>
          {t("history.form.close")}
        </Button>
      }
    >
      <AsyncBoundary
        loading={submission.loading}
        error={submission.error}
        data={model}
        onRetry={submission.refetch}
        isEmpty={(m) => !m}
        empty={<p className="tf-muted">{t("history.form.none")}</p>}
      >
        {(m) =>
          m ? (
            <>
              {m.selectedOutcome ? (
                <p className="tf-detail__note">
                  {t("history.form.outcome", { outcome: m.selectedOutcome })}
                </p>
              ) : null}
              <FormRenderer
                id={`tf-history-form-${task.id}`}
                model={asReadOnlyModel(m)}
                values={initialValues(m)}
                onChange={() => undefined}
              />
            </>
          ) : null
        }
      </AsyncBoundary>
    </Modal>
  );
}
