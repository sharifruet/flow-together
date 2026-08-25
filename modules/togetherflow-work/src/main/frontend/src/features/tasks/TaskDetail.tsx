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
  useI18n,
  useRegisterShortcuts,
  useToast,
  validateForm,
  validateVariables,
  type EditableVariable,
  type FormValues,
  type Shortcut,
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
  const { t, locale } = useI18n();
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
          message: apiError?.message ?? t("task.action.failed"),
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
    [push, reload, onChanged, t],
  );

  /*
   * Claim and complete without the mouse (§14.4). Registered here rather than at the app
   * root because this is where the actions and the task are — and because "complete this
   * task" should not be a live shortcut when no task is open.
   *
   * Complete opens the confirmation rather than bypassing it: §14.3 requires a
   * consequential action to be confirmed, and a keystroke is not an exemption. Where a
   * form declares named outcomes there is no single "complete", so the shortcut steps
   * aside rather than picking one arbitrarily.
   */
  const shortcuts = useMemo<Shortcut[]>(
    () => [
      {
        key: "c",
        description: t("shortcuts.claim"),
        when: Boolean(task) && isUnassigned && !busy,
        run: () => {
          if (!task) return;
          void runAction(t("task.action.claimed"), async () => {
            await taskApi.claim(task.id, userId);
            reload();
            onChanged();
          });
        },
      },
      {
        key: "d",
        description: t("shortcuts.complete"),
        when: Boolean(task) && isAssignedToMe && canSubmit && outcomes.length === 0 && !busy,
        run: () => setConfirmComplete(""),
      },
    ],
    [
      t,
      task,
      isUnassigned,
      isAssignedToMe,
      canSubmit,
      outcomes.length,
      busy,
      runAction,
      taskApi,
      userId,
      reload,
      onChanged,
    ],
  );
  useRegisterShortcuts(shortcuts);

  if (!taskId) {
    return (
      <aside className="tf-detail tf-detail--empty">
        <EmptyState
          title={t("task.detail.none.title")}
          description={t("task.detail.none.description")}
        />
      </aside>
    );
  }

  return (
    <aside className="tf-detail" aria-label={t("task.detail.label")}>
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
                  <h2 className="tf-detail__title">{current.name ?? t("inbox.untitled")}</h2>
                  <p className="tf-detail__meta">
                    {current.assignee ? (
                      t("task.detail.assignedTo", { assignee: current.assignee })
                    ) : (
                      <span className="tf-muted">{t("inbox.unassigned")}</span>
                    )}
                    {" · "}
                    {t("task.detail.priorityLine", {
                      priority: priorityLabel(current.priority, t),
                    })}
                    {current.scopeType === "cmmn" ? (
                      <>
                        {" · "}
                        <span className="tf-badge tf-badge--running">
                          {t("task.detail.caseBadge")}
                        </span>
                      </>
                    ) : null}
                  </p>
                </div>
                <button
                  type="button"
                  className="tf-detail__close"
                  onClick={onClose}
                  aria-label={t("task.detail.close")}
                >
                  ×
                </button>
              </header>

              {current.description ? (
                <p className="tf-detail__description">{current.description}</p>
              ) : null}

              <dl className="tf-detail__facts">
                <Fact
                  label={t("task.fact.created")}
                  value={formatDateTime(current.createTime, locale)}
                />
                <Fact label={t("task.fact.due")} value={formatDateTime(current.dueDate, locale)} />
                {current.owner ? (
                  <Fact label={t("task.fact.owner")} value={current.owner} />
                ) : null}
                {current.category ? (
                  <Fact label={t("task.fact.category")} value={current.category} />
                ) : null}
              </dl>

              <section className="tf-detail__section">
                <h3 className="tf-detail__section-title">
                  {usingForm ? form?.name || t("task.section.form") : t("task.section.variables")}
                </h3>
                {usingForm && form ? (
                  <FormRenderer
                    model={form}
                    values={formValues}
                    errors={visibleFormErrors}
                    disabled={busy || !isAssignedToMe}
                    onChange={setFormValue}
                    onBlur={(fieldId) => setTouched((previous) => ({ ...previous, [fieldId]: true }))}
                    /*
                     * An upload field stores the attachment's id. The file itself goes
                     * through the task's own attachment endpoint, so it lands in
                     * whichever store the deployment has configured (§7.6) rather than
                     * needing a content engine this distribution does not ship.
                     */
                    onUploadFile={async (field, file) => {
                      const attachment = await taskApi.uploadAttachment(current.id, file, {
                        name: file.name,
                        description: t("task.form.uploadedFor", {
                          field: field.name ?? field.id,
                        }),
                      });
                      reload();
                      return attachment.id;
                    }}
                  />
                ) : (
                  <>
                    {current.formKey ? (
                      <p className="tf-detail__note">
                        <code>{current.formKey}</code> — {t("task.form.unloadable")}
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
                  <p className="tf-detail__note">{t("task.form.claimFirst")}</p>
                ) : null}
              </section>

              <section className="tf-detail__section">
                <h3 className="tf-detail__section-title">
                  {attachments.length
                    ? t("task.section.attachmentsCount", { count: attachments.length })
                    : t("task.section.attachments")}
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
                  {comments.length
                    ? t("task.section.commentsCount", { count: comments.length })
                    : t("task.section.comments")}
                </h3>
                {comments.length === 0 ? (
                  <p className="tf-muted">{t("task.comments.none")}</p>
                ) : (
                  <ul className="tf-comments">
                    {comments.map((entry) => (
                      <li key={entry.id} className="tf-comments__item">
                        <p className="tf-comments__meta">
                          <strong>{entry.author ?? t("task.comments.unknownAuthor")}</strong> ·{" "}
                          {formatDateTime(entry.time, locale)}
                        </p>
                        <p className="tf-comments__message">{entry.message}</p>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="tf-comments__compose">
                  <label className="tf-visually-hidden" htmlFor="tf-new-comment">
                    {t("task.comments.add")}
                  </label>
                  <textarea
                    id="tf-new-comment"
                    className="tf-input tf-textarea"
                    rows={2}
                    placeholder={t("task.comments.placeholder")}
                    value={comment}
                    disabled={busy}
                    onChange={(event) => setComment(event.target.value)}
                  />
                  <Button
                    variant="secondary"
                    disabled={busy || comment.trim() === ""}
                    onClick={() =>
                      runAction(t("task.comments.added"), async () => {
                        await taskApi.addComment(current.id, comment.trim());
                        setComment("");
                        reload();
                      })
                    }
                  >
                    {t("task.comments.submit")}
                  </Button>
                </div>
              </section>

              {Array.isArray(detail.data?.people) && detail.data.people.length > 0 ? (
                <section className="tf-detail__section">
                  <h3 className="tf-detail__section-title">{t("task.section.people")}</h3>
                  <ul className="tf-people">
                    {detail.data.people.map((link, index) => (
                      <li className="tf-people__item" key={`${link.type}:${link.user ?? link.group}:${index}`}>
                        <span className="tf-people__who">{link.user ?? link.group}</span>
                        <span className="tf-people__how">
                          {link.group ? t("task.people.group", { type: link.type }) : link.type}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {Array.isArray(detail.data?.subTasks) && detail.data.subTasks.length > 0 ? (
                <section className="tf-detail__section">
                  <h3 className="tf-detail__section-title">
                    {t("task.section.subTasks", { count: detail.data.subTasks.length })}
                  </h3>
                  <ul className="tf-people">
                    {detail.data.subTasks.map((sub) => (
                      <li className="tf-people__item" key={sub.id}>
                        <span className="tf-people__who">{sub.name ?? sub.id}</span>
                        <span className="tf-people__how">
                          {sub.assignee
                            ? t("task.subTasks.assignedTo", { assignee: sub.assignee })
                            : t("task.subTasks.unassigned")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section className="tf-detail__section">
                <h3 className="tf-detail__section-title">{t("task.section.history")}</h3>
                {/*
                  The shape is checked, not assumed. An endpoint that answers with
                  something unexpected must not take the whole panel down with it —
                  which is exactly what reading `.data.length` off a non-page did.
                */}
                {!Array.isArray(detail.data?.log?.data) ? (
                  <p className="tf-muted">{t("task.history.unreadable")}</p>
                ) : detail.data.log.data.length === 0 ? (
                  <p className="tf-muted">{t("task.history.none")}</p>
                ) : (
                  <ol className="tf-tasklog">
                    {detail.data.log.data.map((entry) => (
                      <li className="tf-tasklog__item" key={entry.logNumber}>
                        <span className="tf-tasklog__type">
                          {entry.type ?? t("task.history.event")}
                        </span>
                        <span className="tf-tasklog__when">
                          {formatDateTime(entry.timeStamp, locale)}
                        </span>
                        {entry.userId ? (
                          <span className="tf-tasklog__who">
                            {t("task.history.by", { userId: entry.userId })}
                          </span>
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
                      runAction(t("task.action.claimed"), async () => {
                        await taskApi.claim(current.id, userId);
                        reload();
                        onChanged();
                      })
                    }
                  >
                    {t("task.action.claim")}
                  </Button>
                ) : null}

                {isAssignedToMe ? (
                  <>
                    <Button
                      variant="secondary"
                      loading={busy}
                      onClick={() =>
                        runAction(t("task.action.unclaimed"), async () => {
                          await taskApi.unclaim(current.id);
                          reload();
                          onChanged();
                        })
                      }
                    >
                      {t("task.action.unclaim")}
                    </Button>
                    <Button variant="secondary" loading={busy} onClick={() => setDelegating(true)}>
                      {t("task.action.delegate")}
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
                        {t("task.action.complete")}
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
                      runAction(
                        t("task.action.handedBack", {
                          owner: current.owner ?? t("task.action.owner"),
                        }),
                        async () => {
                          await taskApi.resolve(current.id);
                          reload();
                          onChanged();
                        },
                      )
                    }
                  >
                    {t("task.action.handBack", { owner: current.owner ?? t("task.action.owner") })}
                  </Button>
                ) : null}
              </footer>

              {delegating ? (
                <div className="tf-dialog-backdrop" onMouseDown={() => setDelegating(false)}>
                  <div
                    className="tf-dialog"
                    role="dialog"
                    aria-modal="true"
                    aria-label={t("task.delegate.label")}
                    onMouseDown={(event) => event.stopPropagation()}
                  >
                    <h2 className="tf-dialog__title">{t("task.delegate.title")}</h2>
                    <p className="tf-dialog__description">{t("task.delegate.description")}</p>
                    <TextInput
                      label={t("task.delegate.to")}
                      value={delegateTo}
                      hint={t("task.delegate.hint")}
                      onChange={(event) => setDelegateTo(event.target.value)}
                    />
                    <div className="tf-dialog__actions">
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() => setDelegating(false)}
                      >
                        {t("dialog.cancel")}
                      </Button>
                      <Button
                        loading={busy}
                        disabled={!delegateTo.trim()}
                        onClick={() => {
                          const to = delegateTo.trim();
                          setDelegating(false);
                          setDelegateTo("");
                          void runAction(t("task.delegate.done", { to }), async () => {
                            await taskApi.delegate(current.id, to);
                            reload();
                            onChanged();
                          });
                        }}
                      >
                        {t("task.action.delegate")}
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}

              {!canSubmit ? (
                <p className="tf-detail__note tf-detail__note--error" role="alert">
                  {usingForm ? t("task.validation.form") : t("task.validation.variables")}
                </p>
              ) : null}

              <ConfirmDialog
                open={confirmComplete !== null}
                title={
                  confirmComplete
                    ? t("task.confirm.outcome.title", { outcome: confirmComplete })
                    : t("task.confirm.complete.title")
                }
                description={
                  confirmComplete
                    ? t("task.confirm.outcome.description", {
                        name: current.name ?? t("task.confirm.thisTask"),
                        outcome: confirmComplete,
                      })
                    : t("task.confirm.complete.description", {
                        name: current.name ?? t("task.confirm.thisTask"),
                      })
                }
                confirmLabel={confirmComplete || t("task.action.complete")}
                busy={busy}
                onCancel={() => setConfirmComplete(null)}
                onConfirm={() => {
                  const outcome = confirmComplete;
                  setConfirmComplete(null);
                  void runAction(t("task.action.completed"), async () => {
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
