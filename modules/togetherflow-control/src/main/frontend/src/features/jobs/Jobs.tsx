/**
 * Job queues (REQUIREMENTS.md §7.2).
 *
 * Bulk selection is first-class here rather than a nice-to-have: Control exists to
 * act at a volume nobody can handle one row at a time (§14.4). The engine only
 * offers a bulk endpoint for moving dead-letter jobs, so other bulk actions are
 * issued as a batch of requests and report partial failure honestly.
 */

import { useCallback, useMemo, useState } from "react";
import {
  ApiError,
  AsyncBoundary,
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Modal,
  PageHeader,
  Pagination,
  SavedViews,
  formatDateTime,
  toneForState,
  useAsync,
  useListState,
  useToast,
  type Column,
  type JobApi,
  type JobQueue,
  type JobResponse,
} from "@togetherflow/common";
import { useI18n, useRegisterShortcuts, useSavedViews, type Shortcut } from "@togetherflow/common";


/** Order only; the label and blurb for each come from the catalogue. */
const QUEUES: JobQueue[] = ["async", "timer", "suspended", "deadletter", "history"];

export interface JobsProps {
  jobApi: JobApi;
}

/**
 * What a saved view captures (§14.4), and — since W1.3 — what the query string carries.
 * The queue is part of it: "failed dead-letter jobs" is one saved view an operator wants
 * back, not two settings to re-pick.
 *
 * Strings rather than a boolean and a union, because a query string holds strings.
 */
export interface JobsView {
  [key: string]: string;
  queue: JobQueue;
  failedOnly: string;
}

const DEFAULT_VIEW: JobsView = { queue: "async", failedOnly: "" };

export function Jobs({ jobApi }: JobsProps) {
  const { t, locale } = useI18n();
  const { push } = useToast();
  const list = useListState<JobsView>({ defaults: DEFAULT_VIEW, preferenceKey: "control.jobs" });
  const queue = (QUEUES as readonly string[]).includes(list.filters.queue)
    ? list.filters.queue
    : DEFAULT_VIEW.queue;
  const failedOnly = list.filters.failedOnly === "true";
  const setStart = list.setStart;
  const savedViews = useSavedViews<JobsView>("control.jobs");
  /*
   * C1's own example: "no multi-select in the shared component, so `Jobs.tsx` hand-rolls
   * `useState<Set<string>>` plus checkboxes, and no other screen gets bulk actions". The
   * state stays here — the caller owns what is selected — but the checkbox column, the
   * select-all and the bulk bar are `DataTable`'s now, so every other list can have them.
   */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [stacktraceFor, setStacktraceFor] = useState<string | null>(null);

  const applyView = useCallback(
    (next: JobsView) => {
      list.replaceFilters(next);
      setSelected(new Set());
    },
    [list],
  );
  const [confirm, setConfirm] = useState<{
    title: string;
    description: string;
    /** Set explicitly rather than sniffed from the title, which no longer survives translation. */
    destructive?: boolean;
    confirmLabel: string;
    run: () => void;
  } | null>(null);

  const query = useMemo(
    () => ({ start: list.start, size: list.size, ...(failedOnly ? { withException: true } : {}) }),
    [list.start, list.size, failedOnly],
  );

  const { data, error, loading, refetch } = useAsync(
    (signal) => jobApi.list(queue, query, signal),
    [jobApi, queue, query, reloadToken],
  );

  const reload = useCallback(() => {
    setSelected(new Set());
    setReloadToken((t) => t + 1);
  }, []);

  const run = useCallback(
    async (message: string, action: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await action();
        push({ tone: "success", message });
        reload();
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
    [push, reload, t],
  );

  /**
   * Issues one request per id and reports how many actually succeeded. Claiming
   * blanket success when half the batch failed is the failure mode worth avoiding.
   */
  const runEach = useCallback(
    async (ids: string[], verb: string, action: (id: string) => Promise<unknown>) => {
      setBusy(true);
      const results = await Promise.allSettled(ids.map((id) => action(id)));
      const failed = results.filter((r) => r.status === "rejected").length;
      const ok = results.length - failed;
      if (failed === 0) {
        push({ tone: "success", message: t("jobs.done", { count: ok, verb }) });
      } else {
        push({
          tone: failed === results.length ? "error" : "warning",
          message: t("jobs.partial", { ok, total: results.length, verb, failed }),
        });
      }
      setBusy(false);
      reload();
    },
    [push, reload, t],
  );

  // Memoised so the shortcut bindings' identity is stable across unrelated renders.
  const rows = useMemo(() => (data?.data ?? []) as JobResponse[], [data]);
  const allSelected = rows.length > 0 && rows.every((job) => selected.has(job.id));

  const columns = useMemo<Column<JobResponse>[]>(() => {
    // The checkbox column that used to live here is `DataTable`'s now (C1).
    const base: Column<JobResponse>[] = [
      {
        key: "id",
        header: t("jobs.column.job"),
        required: true,
        render: (job) => (
          <div className="tf-task-cell">
            <span className="tf-task-cell__name">{job.elementName || job.elementId || job.id}</span>
            <span className="tf-task-cell__description">
              {job.handlerType ? `${job.handlerType} · ` : ""}
              {job.id}
            </span>
          </div>
        ),
      },
      {
        key: "retries",
        header: t("jobs.column.retries"),
        width: "90px",
        align: "end" as const,
        // C3: zero retries left is the one number an operator scans for.
        render: (job) =>
          job.retries === 0 ? (
            <Badge tone={toneForState("failed")}>0</Badge>
          ) : (
            <span>{job.retries ?? "—"}</span>
          ),
      },
      {
        key: "due",
        header: queue === "timer" ? t("jobs.column.due") : t("jobs.column.created"),
        width: "180px",
        secondary: true,
        render: (job) =>
          formatDateTime((queue === "timer" ? job.dueDate : job.createTime) ?? undefined, locale),
      },
      {
        key: "error",
        header: t("jobs.column.error"),
        render: (job) =>
          job.exceptionMessage ? (
            <button
              type="button"
              className="tf-link-button"
              onClick={(event) => {
                event.stopPropagation();
                setStacktraceFor(job.id);
              }}
            >
              {truncate(job.exceptionMessage)}
            </button>
          ) : (
            <span className="tf-muted">—</span>
          ),
      },
    ];
    return base;
    // `selected` is no longer read here: the checkbox column moved into DataTable (C1).
  }, [queue, t, locale]);

  const activeLabel = t(`jobs.queue.${queue}`);

  /*
   * Job triage is the highest-volume thing anyone does in Control (§14.4), and selecting
   * a page then acting on it is the loop worth taking off the mouse. Registered here so
   * they exist only while the job queue is on screen.
   */
  const shortcuts = useMemo<Shortcut[]>(
    () => [
      {
        key: "a",
        description: t("shortcuts.selectAll"),
        when: rows.length > 0,
        run: () => setSelected(allSelected ? new Set() : new Set(rows.map((job) => job.id))),
      },
      {
        key: "f",
        description: t("shortcuts.failedOnly"),
        run: () => applyView({ queue, failedOnly: failedOnly ? "" : "true" }),
      },
      {
        key: "r",
        description: t("shortcuts.refresh"),
        run: () => setReloadToken((token) => token + 1),
      },
    ],
    [t, rows, allSelected, applyView, queue, failedOnly],
  );
  useRegisterShortcuts(shortcuts);

  return (
    <section className="tf-panel" aria-label={t("jobs.label")}>
      <PageHeader
        title={t("jobs.title")}
        description={t(`jobs.queue.${queue}.blurb`)}
        meta={
          data ? (
            <Badge
              tone={queue === "deadletter" && data.total > 0 ? "danger" : "info"}
              subtle
              srLabel={t("jobs.countLabel", { count: data.total })}
            >
              {data.total}
            </Badge>
          ) : undefined
        }
      />

      <div className="tf-inbox__filters" role="tablist" aria-label={t("jobs.queueLabel")}>
        {QUEUES.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={queue === id}
            className={["tf-chip", queue === id ? "tf-chip--active" : ""].filter(Boolean).join(" ")}
            onClick={() => applyView({ queue: id, failedOnly: failedOnly ? "true" : "" })}
          >
            {t(`jobs.queue.${id}`)}
          </button>
        ))}
      </div>

      <div className="tf-toolbar">
        <label className="tf-checkbox">
          <input
            type="checkbox"
            checked={failedOnly}
            onChange={(event) =>
              applyView({ queue, failedOnly: event.target.checked ? "true" : "" })
            }
          />
          {t("jobs.failedOnly")}
        </label>

        {/* Saved filters (§14.4) — see the note on Control's instance list. */}
        <SavedViews
          views={savedViews.views}
          current={{ queue, failedOnly: failedOnly ? "true" : "" }}
          onApply={applyView}
          onSave={savedViews.save}
          onRemove={savedViews.remove}
        />

      </div>

      <AsyncBoundary
        loading={loading}
        error={error}
        data={data}
        onRetry={refetch}
        isEmpty={(page) => page.data.length === 0}
        empty={
          <EmptyState
            illustration={failedOnly ? "no-results" : "inbox-clear"}
            title={
              failedOnly
                ? t("jobs.empty.failed.title")
                : t("jobs.empty.title", { queue: activeLabel.toLowerCase() })
            }
            description={
              failedOnly ? t("jobs.empty.failed.description") : t("jobs.empty.description")
            }
          />
        }
      >
        {(page) => (
          <>
            <DataTable
              caption={t("jobs.caption", { queue: activeLabel })}
              preferenceKey="control.jobs"
              columns={columns}
              rows={page.data as JobResponse[]}
              rowKey={(job) => job.id}
              busy={loading}
              selection={selected}
              onSelectionChange={setSelected}
              selectionLabel={(job) => t("jobs.select", { id: job.id })}
              selectAllLabel={t("jobs.selectAll")}
              bulkActions={(selectedIds) => (
                <>
                  {queue === "deadletter" ? (
                    <Button
                      loading={busy}
                onClick={() =>
                  setConfirm({
                    title: t("jobs.moveBack.title", { count: selectedIds.length }),
                    description: t("jobs.moveBack.description", {
                      count: selectedIds.length,
                    }),
                    confirmLabel: t("jobs.moveBack.action"),
                    run: () =>
                      void run(
                        t("jobs.done", {
                          count: selectedIds.length,
                          verb: t("jobs.verb.movedBack"),
                        }),
                        () => jobApi.moveDeadLetters(selectedIds),
                      ),
                  })
                }
              >
                      {t("jobs.moveBack.action")}
                    </Button>
                  ) : (
                    <Button
                      loading={busy}
                      onClick={() =>
                        setConfirm({
                          title: t("jobs.runNow.title", { count: selectedIds.length }),
                    description: t("jobs.runNow.description", { count: selectedIds.length }),
                    confirmLabel: t("jobs.runNow.action"),
                    run: () =>
                      void runEach(selectedIds, t("jobs.verb.executed"), (id) =>
                        jobApi.execute(queue, id),
                      ),
                  })
                }
              >
                      {t("jobs.runNow.action")}
                    </Button>
                  )}
                  <Button
                    variant="danger"
                    loading={busy}
                    onClick={() =>
                      setConfirm({
                        title: t("jobs.delete.title", { count: selectedIds.length }),
                        description: t("jobs.delete.description", { count: selectedIds.length }),
                        destructive: true,
                        confirmLabel: t("jobs.delete.action"),
                        run: () =>
                          void runEach(selectedIds, t("jobs.verb.deleted"), (id) =>
                            jobApi.delete(queue, id),
                          ),
                      })
                    }
                  >
                    {t("jobs.delete.action")}
                  </Button>
                </>
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

      {stacktraceFor ? (
        <StacktraceDialog
          jobApi={jobApi}
          queue={queue}
          jobId={stacktraceFor}
          onClose={() => setStacktraceFor(null)}
        />
      ) : null}

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.title ?? ""}
        description={confirm?.description ?? ""}
        confirmLabel={confirm?.confirmLabel}
        destructive={confirm?.destructive}
        busy={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const action = confirm?.run;
          setConfirm(null);
          action?.();
        }}
      />
    </section>
  );
}

function StacktraceDialog({
  jobApi,
  queue,
  jobId,
  onClose,
}: {
  jobApi: JobApi;
  queue: JobQueue;
  jobId: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const { data, error, loading, refetch } = useAsync(
    (signal) => jobApi.stacktrace(queue, jobId, signal),
    [jobApi, queue, jobId],
  );

  return (
    <Modal
      open
      size="lg"
      title={t("jobs.stackTrace.title")}
      description={jobId}
      onClose={onClose}
      actions={
        <Button variant="secondary" onClick={onClose}>
          {t("action.close")}
        </Button>
      }
    >
      <AsyncBoundary loading={loading} error={error} data={data} onRetry={refetch} skeletonRows={6}>
        {(trace) => <pre className="tf-stacktrace">{trace}</pre>}
      </AsyncBoundary>
    </Modal>
  );
}

export function truncate(text: string, max = 80): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
