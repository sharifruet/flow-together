import { useCallback, useMemo, useState } from "react";
import {
  ApiError,
  AsyncBoundary,
  Button,
  ConfirmDialog,
  EmptyState,
  FormRenderer,
  formValuesToVariables,
  formatDateTime,
  hasRenderableFields,
  initialValues,
  priorityLabel,
  toEditable,
  toRestVariables,
  useAsync,
  useToast,
  validateForm,
  validateVariables,
  type EditableVariable,
  type FormValues,
  type TaskApi,
} from "@togetherflow/common";
import { Attachments } from "./Attachments";
import { VariableEditor } from "./VariableEditor";

export interface TaskDetailProps {
  taskApi: TaskApi;
  taskId: string | undefined;
  userId: string;
  onCompleted: () => void;
  onChanged: () => void;
  onClose: () => void;
}

export function TaskDetail({
  taskApi,
  taskId,
  userId,
  onCompleted,
  onChanged,
  onClose,
}: TaskDetailProps) {
  const { push } = useToast();
  /**
   * Edits are tagged with the task they belong to and derived during render rather
   * than synced from an effect. That removes a cascading render and, more usefully,
   * makes it impossible for one task's unsaved edits to appear on another.
   */
  const [edits, setEdits] = useState<{ taskId: string; variables: EditableVariable[] } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [comment, setComment] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  const detail = useAsync(
    async (signal) => {
      if (!taskId) return undefined;
      const [task, taskVariables, comments, attachments] = await Promise.all([
        taskApi.get(taskId, signal),
        taskApi.listVariables(taskId, signal).catch(() => []),
        taskApi.listComments(taskId, signal).catch(() => []),
        taskApi.listAttachments(taskId, signal).catch(() => []),
      ]);
      // Only ask for a form when the task declares one: the endpoint 400s otherwise,
      // and a needless failed request on every task selection is wasteful noise.
      const form = task.formKey ? await taskApi.getForm(taskId, signal) : null;
      return { task, variables: taskVariables, comments, attachments, form };
    },
    [taskApi, taskId, reloadToken],
  );

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  const loadedVariables = detail.data?.variables;
  const variables = useMemo<EditableVariable[]>(
    () =>
      edits && edits.taskId === taskId
        ? edits.variables
        : (loadedVariables ?? []).map(toEditable),
    [edits, taskId, loadedVariables],
  );

  const setVariables = useCallback(
    (next: EditableVariable[]) => {
      if (taskId) setEdits({ taskId, variables: next });
    },
    [taskId],
  );

  const form = detail.data?.form ?? undefined;
  const usingForm = hasRenderableFields(form);

  const [formEdits, setFormEdits] = useState<{ taskId: string; values: FormValues } | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const formValues = useMemo<FormValues>(
    () =>
      formEdits && formEdits.taskId === taskId
        ? formEdits.values
        : form
          ? initialValues(form)
          : {},
    [formEdits, taskId, form],
  );

  const formErrors = useMemo(
    () => (form ? validateForm(form, formValues) : {}),
    [form, formValues],
  );

  // Only surface an error once the user has left the field, so a required field
  // is not flagged before it has been filled in for the first time (§14.3).
  const visibleFormErrors = useMemo(() => {
    const visible: Record<string, string> = {};
    for (const [id, message] of Object.entries(formErrors)) {
      if (touched[id]) visible[id] = message;
    }
    return visible;
  }, [formErrors, touched]);

  const setFormValue = useCallback(
    (fieldId: string, value: unknown) => {
      if (!taskId) return;
      setFormEdits((previous) => ({
        taskId,
        values: {
          ...(previous && previous.taskId === taskId ? previous.values : (form ? initialValues(form) : {})),
          [fieldId]: value,
        },
      }));
    },
    [taskId, form],
  );

  const gridErrors = useMemo(() => validateVariables(variables), [variables]);
  const canSubmit = usingForm
    ? Object.keys(formErrors).length === 0
    : gridErrors.length === 0;

  const task = detail.data?.task;
  const isAssignedToMe = task?.assignee === userId;
  const isUnassigned = !task?.assignee;

  const runAction = useCallback(
    async (label: string, action: () => Promise<void>, then?: () => void) => {
      setBusy(true);
      try {
        await action();
        push({ tone: "success", message: label });
        then?.();
      } catch (cause) {
        const apiError = cause instanceof ApiError ? cause : undefined;
        push({
          tone: "error",
          message: apiError?.message ?? "That action could not be completed.",
          reference: apiError?.correlationId,
        });
        // A conflict usually means someone else acted first — refresh rather than
        // leaving the user looking at state the server has already moved past.
        if (apiError?.isConflict || apiError?.isNotFound) {
          // Someone else moved this task on; show server truth rather than our buffer.
          setEdits(null);
          setFormEdits(null);
          reload();
          onChanged();
        }
      } finally {
        setBusy(false);
      }
    },
    [push, reload, onChanged],
  );

  if (!taskId) {
    return (
      <aside className="tf-detail tf-detail--empty">
        <EmptyState
          title="No task selected"
          description="Choose a task from the list to see its details and act on it."
        />
      </aside>
    );
  }

  return (
    <aside className="tf-detail" aria-label="Task detail">
      <AsyncBoundary
        loading={detail.loading}
        error={detail.error}
        data={detail.data}
        onRetry={reload}
        skeletonRows={8}
      >
        {(loaded) => {
          if (!loaded) return null;
          const { task: current, comments, attachments } = loaded;
          return (
            <>
              <header className="tf-detail__header">
                <div>
                  <h2 className="tf-detail__title">{current.name ?? "(untitled task)"}</h2>
                  <p className="tf-detail__meta">
                    {current.assignee ? (
                      <>Assigned to {current.assignee}</>
                    ) : (
                      <span className="tf-muted">Unassigned</span>
                    )}
                    {" · "}
                    {priorityLabel(current.priority)} priority
                  </p>
                </div>
                <button
                  type="button"
                  className="tf-detail__close"
                  onClick={onClose}
                  aria-label="Close task detail"
                >
                  ×
                </button>
              </header>

              {current.description ? (
                <p className="tf-detail__description">{current.description}</p>
              ) : null}

              <dl className="tf-detail__facts">
                <Fact label="Created" value={formatDateTime(current.createTime)} />
                <Fact label="Due" value={formatDateTime(current.dueDate)} />
                {current.owner ? <Fact label="Owner" value={current.owner} /> : null}
                {current.category ? <Fact label="Category" value={current.category} /> : null}
              </dl>

              <section className="tf-detail__section">
                <h3 className="tf-detail__section-title">
                  {usingForm ? form?.name || "Form" : "Variables"}
                </h3>
                {usingForm && form ? (
                  <FormRenderer
                    model={form}
                    values={formValues}
                    errors={visibleFormErrors}
                    disabled={busy || !isAssignedToMe}
                    onChange={setFormValue}
                    onBlur={(fieldId) => setTouched((t) => ({ ...t, [fieldId]: true }))}
                  />
                ) : (
                  <>
                    {current.formKey ? (
                      <p className="tf-detail__note">
                        This task declares a form (<code>{current.formKey}</code>), but its
                        definition could not be loaded. Showing the underlying variables instead.
                      </p>
                    ) : null}
                    <VariableEditor
                      variables={variables}
                      onChange={setVariables}
                      disabled={busy || !isAssignedToMe}
                    />
                  </>
                )}
                {!isAssignedToMe ? (
                  <p className="tf-detail__note">
                    Claim this task to fill this in and complete it.
                  </p>
                ) : null}
              </section>

              <section className="tf-detail__section">
                <h3 className="tf-detail__section-title">
                  Attachments {attachments.length ? `(${attachments.length})` : ""}
                </h3>
                <Attachments
                  taskApi={taskApi}
                  taskId={current.id}
                  attachments={attachments}
                  disabled={busy}
                  onChanged={reload}
                />
              </section>

              <section className="tf-detail__section">
                <h3 className="tf-detail__section-title">
                  Comments {comments.length ? `(${comments.length})` : ""}
                </h3>
                {comments.length === 0 ? (
                  <p className="tf-muted">No comments yet.</p>
                ) : (
                  <ul className="tf-comments">
                    {comments.map((entry) => (
                      <li key={entry.id} className="tf-comments__item">
                        <p className="tf-comments__meta">
                          <strong>{entry.author ?? "Unknown"}</strong> ·{" "}
                          {formatDateTime(entry.time)}
                        </p>
                        <p className="tf-comments__message">{entry.message}</p>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="tf-comments__compose">
                  <label className="tf-visually-hidden" htmlFor="tf-new-comment">
                    Add a comment
                  </label>
                  <textarea
                    id="tf-new-comment"
                    className="tf-input tf-textarea"
                    rows={2}
                    placeholder="Add a comment…"
                    value={comment}
                    disabled={busy}
                    onChange={(event) => setComment(event.target.value)}
                  />
                  <Button
                    variant="secondary"
                    disabled={busy || comment.trim() === ""}
                    onClick={() =>
                      runAction("Comment added.", async () => {
                        await taskApi.addComment(current.id, comment.trim());
                        setComment("");
                        reload();
                      })
                    }
                  >
                    Comment
                  </Button>
                </div>
              </section>

              <footer className="tf-detail__actions">
                {isUnassigned ? (
                  <Button
                    loading={busy}
                    onClick={() =>
                      runAction("Task claimed.", async () => {
                        await taskApi.claim(current.id, userId);
                        reload();
                        onChanged();
                      })
                    }
                  >
                    Claim
                  </Button>
                ) : null}

                {isAssignedToMe ? (
                  <>
                    <Button
                      variant="secondary"
                      loading={busy}
                      onClick={() =>
                        runAction("Task returned to the queue.", async () => {
                          await taskApi.unclaim(current.id);
                          reload();
                          onChanged();
                        })
                      }
                    >
                      Unclaim
                    </Button>
                    <Button
                      loading={busy}
                      disabled={!canSubmit}
                      onClick={() => setConfirmComplete(true)}
                    >
                      Complete task
                    </Button>
                  </>
                ) : null}
              </footer>

              {!canSubmit ? (
                <p className="tf-detail__note tf-detail__note--error" role="alert">
                  {usingForm
                    ? "Fill in the required fields before completing this task."
                    : "Fix the highlighted variables before completing this task."}
                </p>
              ) : null}

              <ConfirmDialog
                open={confirmComplete}
                title="Complete this task?"
                description={`"${current.name ?? "This task"}" will be completed and removed from your inbox. This can't be undone.`}
                confirmLabel="Complete task"
                busy={busy}
                onCancel={() => setConfirmComplete(false)}
                onConfirm={() => {
                  setConfirmComplete(false);
                  void runAction("Task completed.", async () => {
                    await taskApi.complete(
                      current.id,
                      usingForm && form
                        ? formValuesToVariables(form, formValues)
                        : toRestVariables(variables),
                    );
                    onCompleted();
                  });
                }}
              />
            </>
          );
        }}
      </AsyncBoundary>
    </aside>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="tf-detail__fact">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
