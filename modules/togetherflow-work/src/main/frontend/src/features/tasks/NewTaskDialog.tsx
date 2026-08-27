/**
 * Ad-hoc task creation — "New → Task" (W2.2, ENTERPRISE_PARITY_PLAN E3).
 *
 * `TaskCollectionResource` has supported `POST /runtime/tasks` all along and nothing in
 * this UI used it, which is the whole of the gap the plan records. A standalone task is
 * how someone captures work that has no process model behind it yet — the single most
 * common reason people keep a second to-do list beside a BPM product.
 *
 * The created task belongs to no process instance. That is not a limitation to apologise
 * for; it is what "ad-hoc" means, and the engine models it directly.
 */

import { useState } from "react";
import {
  ApiError,
  Button,
  Modal,
  SelectInput,
  TextAreaInput,
  TextInput,
  useI18n,
  useToast,
  type TaskApi,
  type TaskResponse,
} from "@togetherflow/common";

export interface NewTaskDialogProps {
  taskApi: TaskApi;
  /** Pre-fills the assignee, since "a task for me" is the common case. */
  userId: string;
  onClose: () => void;
  onCreated: (task: TaskResponse) => void;
}

/** Matches `priorityLabel`'s bands, so the picker and the column agree. */
const PRIORITIES = [
  { value: 80, key: "format.priority.high" },
  { value: 50, key: "format.priority.normal" },
  { value: 20, key: "format.priority.low" },
];

export function NewTaskDialog({ taskApi, userId, onClose, onCreated }: NewTaskDialogProps) {
  const { t } = useI18n();
  const { push } = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState(userId);
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState(50);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!name.trim()) {
      setError(t("newTask.nameRequired"));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const task = await taskApi.create({
        name: name.trim(),
        description: description.trim() || undefined,
        // Empty means unassigned, which is a real choice — not the same as "me".
        assignee: assignee.trim() || null,
        // Midday rather than midnight: a date-only value at 00:00 in one timezone is the
        // previous day in another, and a task due "today" should not read as overdue.
        dueDate: dueDate ? new Date(`${dueDate}T12:00:00`).toISOString() : null,
        priority,
      });
      push({ tone: "success", message: t("newTask.created", { name: task.name ?? task.id }) });
      onCreated(task);
      onClose();
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : undefined;
      setError(apiError?.message ?? t("newTask.failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      size="sm"
      title={t("newTask.title")}
      description={t("newTask.description")}
      // Typed-in work; a stray backdrop click must not discard it.
      dismissOnBackdrop={false}
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t("dialog.cancel")}
          </Button>
          <Button onClick={() => void create()} loading={busy}>
            {t("newTask.create")}
          </Button>
        </>
      }
    >
      <TextInput
        label={t("newTask.name")}
        value={name}
        required
        error={error ?? undefined}
        onChange={(event) => setName(event.target.value)}
      />
      <TextAreaInput
        label={t("newTask.detailsLabel")}
        value={description}
        rows={3}
        onChange={(event) => setDescription(event.target.value)}
      />
      <TextInput
        label={t("newTask.assignee")}
        hint={t("newTask.assignee.hint")}
        value={assignee}
        onChange={(event) => setAssignee(event.target.value)}
      />
      <TextInput
        label={t("newTask.dueDate")}
        type="date"
        value={dueDate}
        onChange={(event) => setDueDate(event.target.value)}
      />
      <SelectInput
        label={t("newTask.priority")}
        value={priority}
        onChange={(event) => setPriority(Number(event.target.value))}
      >
        {PRIORITIES.map((option) => (
          <option key={option.value} value={option.value}>
            {t(option.key)}
          </option>
        ))}
      </SelectInput>
    </Modal>
  );
}
