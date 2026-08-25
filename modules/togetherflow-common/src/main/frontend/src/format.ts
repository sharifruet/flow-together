/**
 * Shared formatting helpers.
 *
 * Every one of these takes the active locale rather than reading the browser's: the user
 * can pick a language in the shell (§8 i18n), and dates formatted in a different locale
 * from the surrounding copy is exactly the kind of half-done translation §14.3 calls out.
 * Passing `undefined` keeps the browser default, which is what tests and non-React
 * callers want.
 */

export function formatDateTime(value: string | undefined, locale?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function formatDate(value: string | undefined, locale?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}

export interface DueState {
  label: string;
  tone: "overdue" | "due-soon" | "normal" | "none";
}

export interface DueStateOptions {
  now?: Date;
  locale?: string;
  /** Translated "No due date"; the only string here Intl cannot produce. */
  noDueDateLabel?: string;
}

/** Due-date urgency, used to prioritise the inbox at a glance. */
export function dueState(dueDate: string | undefined, options: DueStateOptions = {}): DueState {
  const { now = new Date(), locale, noDueDateLabel = "No due date" } = options;
  if (!dueDate) return { label: noDueDateLabel, tone: "none" };
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return { label: noDueDateLabel, tone: "none" };

  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / 86_400_000);

  if (diffMs < 0) {
    return { label: relativeLabel(diffDays, locale), tone: "overdue" };
  }
  return { label: relativeLabel(diffDays, locale), tone: diffDays <= 1 ? "due-soon" : "normal" };
}

function relativeLabel(diffDays: number, locale?: string): string {
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (Math.abs(diffDays) < 30) return formatter.format(diffDays, "day");
  return formatter.format(Math.round(diffDays / 30), "month");
}

/** The band a priority falls in. Kept separate from its copy so the copy can be translated. */
export function priorityKey(priority: number): "high" | "normal" | "low" {
  if (priority >= 75) return "high";
  if (priority >= 26) return "normal";
  return "low";
}

export function priorityLabel(
  priority: number,
  translate?: (key: string) => string,
): string {
  const key = priorityKey(priority);
  if (translate) return translate(`format.priority.${key}`);
  return key === "high" ? "High" : key === "normal" ? "Normal" : "Low";
}
