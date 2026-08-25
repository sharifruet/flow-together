/** Shared formatting helpers. Kept locale-aware so i18n (§8) doesn't need a rewrite later. */

export function formatDateTime(value: string | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function formatDate(value: string | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

export interface DueState {
  label: string;
  tone: "overdue" | "due-soon" | "normal" | "none";
}

/** Due-date urgency, used to prioritise the inbox at a glance. */
export function dueState(dueDate: string | undefined, now: Date = new Date()): DueState {
  if (!dueDate) return { label: "No due date", tone: "none" };
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return { label: "No due date", tone: "none" };

  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / 86_400_000);

  if (diffMs < 0) {
    return { label: relativeLabel(diffDays), tone: "overdue" };
  }
  return { label: relativeLabel(diffDays), tone: diffDays <= 1 ? "due-soon" : "normal" };
}

function relativeLabel(diffDays: number): string {
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (Math.abs(diffDays) < 30) return formatter.format(diffDays, "day");
  return formatter.format(Math.round(diffDays / 30), "month");
}

export function priorityLabel(priority: number): string {
  if (priority >= 75) return "High";
  if (priority >= 26) return "Normal";
  return "Low";
}
