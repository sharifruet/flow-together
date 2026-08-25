import { useCallback, useMemo, useState } from "react";
import {
  ApiError,
  AsyncBoundary,
  Button,
  TextInput,
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
  /**
   * Which outcome is pending confirmation. `null` means no dialog; an empty string is a
   * plain completion with no named outcome — the two are genuinely different states.
   */
  const [confirmComplete, setConfirmComplete] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [delegating, setDelegating] = useState(false);
  const [delegateTo, setDelegateTo] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  const detail = useAsync(
    async (signal) => {
      if (!taskId) return undefined;
      const [task, taskVariables, comments, attachments, subTasks, people, log] =
        await Promise.all([
          taskApi.get(taskId, signal),
          taskApi.listVariables(taskId, signal).catch(() => []),
          taskApi.listComments(taskId, signal).catch(() => []),
          taskApi.listAttachments(taskId, signal).catch(() => []),
          taskApi.listSubTasks(taskId, signal).catch(() => []),
          taskApi.listIdentityLinks(taskId, signal).catch(() => []),
          // Empty on any engine that has not enabled historic task logging, which is
          // the default — so a failure here must not take the whole panel down.
          taskApi.listLogEntries(taskId, signal).catch(() => undefined),
        ]);
      // Only ask for a form when the task declares one: the endpoint 400s otherwise,
      // and a needless failed request on every task selection is wasteful noise.
      const form = task.formKey ? await taskApi.getForm(taskId, signal) : null;
      return {
        task,
        variables: taskVariables,
        comments,
        attachments,
        form,
        subTasks,
        people,
        log,
      };
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
  const outcomes = usingForm ? (form?.outcomes ?? []) : [];

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
                    {current.scopeType === "cmmn" ? (
                      <>
                        {" · "}
                        <span className="tf-badge tf-badge--running">Case</span>
                      </>
                    ) : null}
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
                    /*
                     * An upload field stores the attachment's id. The file itself goes
                     * through the task's own attachment endpoint, so it lands in
                     * whichever store the deployment has configured (§7.6) rather than
                     * needing a content engine this distribution does not ship.
                     */
                    onUploadFile={async (field, file) => {
                      const attachment = await taskApi.uploadAttachment(current.id, file, {
                        name: file.name,
                        description: `Uploaded for "${field.name ?? field.id}"`,
                      });
                      reload();
                      return attachment.id;
                    }}
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

              {Array.isArray(detail.data?.people) && detail.data.people.length > 0 ? (
                <section className="tf-detail__section">
                  <h3 className="tf-detail__section-title">People</h3>
                  <ul className="tf-people">
                    {detail.data.people.map((link, index) => (
                      <li className="tf-people__item" key={`${link.type}:${link.user ?? link.group}:${index}`}>
                        <span className="tf-people__who">{link.user ?? link.group}</span>
                        <span className="tf-people__how">
                          {link.group ? `${link.type} (group)` : link.type}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {Array.isArray(detail.data?.subTasks) && detail.data.subTasks.length > 0 ? (
                <section className="tf-detail__section">
                  <h3 className="tf-detail__section-title">
                    Sub-tasks ({detail.data.subTasks.length})
                  </h3>
                  <ul className="tf-people">
                    {detail.data.subTasks.map((sub) => (
                      <li className="tf-people__item" key={sub.id}>
                        <span className="tf-people__who">{sub.name ?? sub.id}</span>
                        <span className="tf-people__how">
                          {sub.assignee ? `assigned to ${sub.assignee}` : "unassigned"}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section className="tf-detail__section">
                <h3 className="tf-detail__section-title">History</h3>
                {/*
                  The shape is checked, not assumed. An endpoint that answers with
                  something unexpected must not take the whole panel down with it —
                  which is exactly what reading `.data.length` off a non-page did.
                */}
                {!Array.isArray(detail.data?.log?.data) ? (
                  <p className="tf-muted">This task's history could not be read.</p>
                ) : detail.data.log.data.length === 0 ? (
                  <p className="tf-muted">
                    Nothing recorded. Engines only keep a task audit trail when
                    <code> enableHistoricTaskLogging </code> is switched on, and it is off
                    by default.
                  </p>
                ) : (
                  <ol className="tf-tasklog">
                    {detail.data.log.data.map((entry) => (
                      <li className="tf-tasklog__item" key={entry.logNumber}>
                        <span className="tf-tasklog__type">{entry.type ?? "event"}</span>
                        <span className="tf-tasklog__when">{formatDateTime(entry.timeStamp)}</span>
                        {entry.userId ? (
                          <span className="tf-tasklog__who">by {entry.userId}</span>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                )}
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
                    <Button variant="secondary" loading={busy} onClick={() => setDelegating(true)}>
                      Delegate
                    </Button>
                    {/*
                      A form may name its own outcomes ("Approve", "Reject"). Each is a
                      distinct submit that records which was chosen, so they replace the
                      generic Complete rather than sitting beside it.
                    */}
                    {outcomes.length > 0 ? (
                      outcomes.map((outcome) => (
                        <Button
                          key={outcome.id ?? outcome.name}
                          loading={busy}
                          disabled={!canSubmit}
                          onClick={() => setConfirmComplete(outcome.name)}
                        >
                          {outcome.name}
                        </Button>
                      ))
                    ) : (
                      <Button
                        loading={busy}
                        disabled={!canSubmit}
                        onClick={() => setConfirmComplete("")}
                      >
                        Complete task
                      </Button>
                    )}
                  </>
                ) : null}

                {/*
                  A delegated task sits with the delegate until they hand it back.
                  Resolving returns it to the owner — it does not complete it.
                */}
                {current.delegationState === "pending" && current.assignee === userId ? (
                  <Button
                    loading={busy}
                    onClick={() =>
                      runAction(`Handed back to ${current.owner ?? "the owner"}.`, async () => {
                        await taskApi.resolve(current.id);
                        reload();
                        onChanged();
                      })
                    }
                  >
                    Hand back to {current.owner ?? "owner"}
                  </Button>
                ) : null}
              </footer>

              {delegating ? (
                <div className="tf-dialog-backdrop" onMouseDown={() => setDelegating(false)}>
                  <div
                    className="tf-dialog"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Delegate task"
                    onMouseDown={(event) => event.stopPropagation()}
                  >
                    <h2 className="tf-dialog__title">Delegate this task</h2>
                    <p className="tf-dialog__description">
                      They do it on your behalf and hand it back when they are done. You stay
                      its owner, so it returns to you rather than being completed by them.
                    </p>
                    <TextInput
                      label="Delegate to"
                      value={delegateTo}
                      hint="The user id to hand it to."
                      onChange={(event) => setDelegateTo(event.target.value)}
                    />
                    <div className="tf-dialog__actions">
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() => setDelegating(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        loading={busy}
                        disabled={!delegateTo.trim()}
                        onClick={() => {
                          const to = delegateTo.trim();
                          setDelegating(false);
                          setDelegateTo("");
                          void runAction(`Delegated to ${to}.`, async () => {
                            await taskApi.delegate(current.id, to);
                            reload();
                            onChanged();
                          });
                        }}
                      >
                        Delegate
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}

              {!canSubmit ? (
                <p className="tf-detail__note tf-detail__note--error" role="alert">
                  {usingForm
                    ? "Fill in the required fields before completing this task."
                    : "Fix the highlighted variables before completing this task."}
                </p>
              ) : null}

              <ConfirmDialog
                open={confirmComplete !== null}
                title={confirmComplete ? `${confirmComplete} this task?` : "Complete this task?"}
                description={
                  confirmComplete
                    ? `"${current.name ?? "This task"}" will be submitted with the outcome "${confirmComplete}" and removed from your inbox. This can't be undone.`
                    : `"${current.name ?? "This task"}" will be completed and removed from your inbox. This can't be undone.`
                }
                confirmLabel={confirmComplete || "Complete task"}
                busy={busy}
                onCancel={() => setConfirmComplete(null)}
                onConfirm={() => {
                  const outcome = confirmComplete;
                  setConfirmComplete(null);
                  void runAction("Task completed.", async () => {
                    const submitted =
                      usingForm && form
                        ? formValuesToVariables(form, formValues)
                        : toRestVariables(variables);
                    // The chosen outcome travels as a variable, named by the form or
                    // by the engine's default of "form_<key>_outcome".
                    if (outcome && form) {
                      submitted.push({
                        name: form.outcomeVariableName || `form_${form.key ?? "form"}_outcome`,
                        type: "string",
                        value: outcome,
                      });
                    }
                    await taskApi.complete(current.id, submitted);
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
