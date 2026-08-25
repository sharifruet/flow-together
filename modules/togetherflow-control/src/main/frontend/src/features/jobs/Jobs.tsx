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
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Pagination,
  formatDateTime,
  useAsync,
  useToast,
  type Column,
  type JobApi,
  type JobQueue,
  type JobResponse,
} from "@togetherflow/common";

const PAGE_SIZE = 25;

const QUEUES: { id: JobQueue; label: string; blurb: string }[] = [
  { id: "async", label: "Async", blurb: "Work the engine is executing in the background." },
  { id: "timer", label: "Timers", blurb: "Jobs waiting for their due date." },
  { id: "suspended", label: "Suspended", blurb: "Jobs held because their instance is suspended." },
  {
    id: "deadletter",
    label: "Dead letter",
    blurb: "Jobs that exhausted their retries. Move them back once the cause is fixed.",
  },
  { id: "history", label: "History", blurb: "Async history processing, including cleanup." },
];

export interface JobsProps {
  jobApi: JobApi;
}

export function Jobs({ jobApi }: JobsProps) {
  const { push } = useToast();
  const [queue, setQueue] = useState<JobQueue>("async");
  const [start, setStart] = useState(0);
  const [failedOnly, setFailedOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [stacktraceFor, setStacktraceFor] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; description: string; run: () => void } | null>(
    null,
  );

  const query = useMemo(
    () => ({ start, size: PAGE_SIZE, ...(failedOnly ? { withException: true } : {}) }),
    [start, failedOnly],
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
          message: apiError?.message ?? "That action could not be completed.",
          reference: apiError?.correlationId,
        });
      } finally {
        setBusy(false);
      }
    },
    [push, reload],
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
        push({ tone: "success", message: `${ok} job${ok === 1 ? "" : "s"} ${verb}.` });
      } else {
        push({
          tone: failed === results.length ? "error" : "warning",
          message: `${ok} of ${results.length} jobs ${verb}; ${failed} failed.`,
        });
      }
      setBusy(false);
      reload();
    },
    [push, reload],
  );

  const rows = (data?.data ?? []) as JobResponse[];
  const allSelected = rows.length > 0 && rows.every((job) => selected.has(job.id));

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const columns = useMemo<Column<JobResponse>[]>(() => {
    const base: Column<JobResponse>[] = [
      {
        key: "select",
        header: "",
        width: "36px",
        render: (job) => (
          <input
            type="checkbox"
            checked={selected.has(job.id)}
            aria-label={`Select job ${job.id}`}
            onClick={(event) => event.stopPropagation()}
            onChange={() => toggle(job.id)}
          />
        ),
      },
      {
        key: "id",
        header: "Job",
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
        header: "Retries",
        width: "90px",
        render: (job) =>
          job.retries === 0 ? (
            <span className="tf-badge tf-badge--danger">0</span>
          ) : (
            <span>{job.retries ?? "—"}</span>
          ),
      },
      {
        key: "due",
        header: queue === "timer" ? "Due" : "Created",
        width: "180px",
        secondary: true,
        render: (job) => formatDateTime((queue === "timer" ? job.dueDate : job.createTime) ?? undefined),
      },
      {
        key: "error",
        header: "Error",
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
  }, [selected, queue]);

  const active = QUEUES.find((q) => q.id === queue)!;
  const selectedIds = [...selected];

  return (
    <section className="tf-panel" aria-label="Jobs">
      <header className="tf-panel__header">
        <div>
          <h1 className="tf-panel__title">Jobs</h1>
          <p className="tf-panel__meta">{active.blurb}</p>
        </div>
      </header>

      <div className="tf-inbox__filters" role="tablist" aria-label="Job queue">
        {QUEUES.map((q) => (
          <button
            key={q.id}
            type="button"
            role="tab"
            aria-selected={queue === q.id}
            className={["tf-chip", queue === q.id ? "tf-chip--active" : ""].filter(Boolean).join(" ")}
            onClick={() => {
              setQueue(q.id);
              setStart(0);
              setSelected(new Set());
            }}
          >
            {q.label}
          </button>
        ))}
      </div>

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

        {rows.length > 0 ? (
          <label className="tf-checkbox">
            <input
              type="checkbox"
              checked={allSelected}
              aria-label="Select all jobs on this page"
              onChange={() =>
                setSelected(allSelected ? new Set() : new Set(rows.map((job) => job.id)))
              }
            />
            Select all on page
          </label>
        ) : null}

        {selectedIds.length > 0 ? (
          <div className="tf-toolbar__actions" role="group" aria-label="Bulk actions">
            <span className="tf-muted">{selectedIds.length} selected</span>
            {queue === "deadletter" ? (
              <Button
                loading={busy}
                onClick={() =>
                  setConfirm({
                    title: `Move ${selectedIds.length} job(s) back?`,
                    description: `${selectedIds.length} dead-letter job(s) will be put back on the executable queue and retried. If the underlying cause is not fixed they will fail again.`,
                    run: () =>
                      void run(`${selectedIds.length} job(s) moved back.`, () =>
                        jobApi.moveDeadLetters(selectedIds),
                      ),
                  })
                }
              >
                Move back
              </Button>
            ) : (
              <Button
                loading={busy}
                onClick={() =>
                  setConfirm({
                    title: `Run ${selectedIds.length} job(s) now?`,
                    description: `${selectedIds.length} job(s) will be executed immediately rather than waiting for the scheduler.`,
                    run: () => void runEach(selectedIds, "executed", (id) => jobApi.execute(queue, id)),
                  })
                }
              >
                Run now
              </Button>
            )}
            <Button
              variant="danger"
              loading={busy}
              onClick={() =>
                setConfirm({
                  title: `Delete ${selectedIds.length} job(s)?`,
                  description: `${selectedIds.length} job(s) will be deleted permanently. Whatever they were going to do will never happen, and the instances waiting on them may stall. This can't be undone.`,
                  run: () => void runEach(selectedIds, "deleted", (id) => jobApi.delete(queue, id)),
                })
              }
            >
              Delete
            </Button>
          </div>
        ) : null}
      </div>

      <AsyncBoundary
        loading={loading}
        error={error}
        data={data}
        onRetry={refetch}
        isEmpty={(page) => page.data.length === 0}
        empty={
          <EmptyState
            title={failedOnly ? "No failed jobs" : `No ${active.label.toLowerCase()} jobs`}
            description={
              failedOnly
                ? "Nothing in this queue has an exception recorded."
                : "This queue is empty — nothing is waiting here."
            }
          />
        }
      >
        {(page) => (
          <>
            <DataTable
              caption={`${active.label} jobs`}
              columns={columns}
              rows={page.data as JobResponse[]}
              rowKey={(job) => job.id}
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
        confirmLabel="Confirm"
        destructive={confirm?.title.startsWith("Delete")}
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
  const { data, error, loading, refetch } = useAsync(
    (signal) => jobApi.stacktrace(queue, jobId, signal),
    [jobApi, queue, jobId],
  );

  return (
    <div className="tf-dialog-backdrop" onMouseDown={onClose}>
      <div
        className="tf-dialog tf-dialog--wide"
        role="dialog"
        aria-modal="true"
        aria-label={`Stack trace for job ${jobId}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="tf-dialog__title">Stack trace</h2>
        <p className="tf-dialog__description">{jobId}</p>
        <AsyncBoundary loading={loading} error={error} data={data} onRetry={refetch} skeletonRows={6}>
          {(trace) => <pre className="tf-stacktrace">{trace}</pre>}
        </AsyncBoundary>
        <div className="tf-dialog__actions">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

export function truncate(text: string, max = 80): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
