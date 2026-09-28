/**
 * Shared formatting helpers.
 *
 * Every one of these takes the active locale rather than reading the browser's: the user
 * can pick a language in the shell (§8 i18n), and dates formatted in a different locale
 * from the surrounding copy is exactly the kind of half-done translation §14.3 calls out.
 * Passing `undefined` keeps the browser default, which is what tests and non-React
 * callers want.
 */

/**
 * Every date this deployment shows is DD/MM/YYYY — in the inbox, on a task, in a form
 * and in the mail the process sends — so a date read in one place cannot be misread in
 * another. That is a house convention rather than a locale preference: `dateStyle`
 * followed the UI language, which turned 31/10 into 10/31 for an English reader and
 * into three different orders across three screens.
 *
 * The time of day is a genuine locale preference (12- or 24-hour), so that part still
 * follows the active locale.
 */
const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/** A calendar date with no instant in it — `2026-10-31`, as a form's date field stores. */
const CALENDAR_DAY = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]|$)/;

export function formatDateTime(value: string | undefined, locale?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const time = new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(date);
  return `${DATE_FORMAT.format(date)}, ${time}`;
}

/**
 * A date on its own.
 *
 * A bare calendar day is reordered as written rather than parsed: `new Date("2026-10-31")`
 * is midnight UTC, which is still 30 October for anyone west of it, so a last working
 * day would come back a day early on half the planet.
 */
export function formatDate(value: string | undefined): string {
  if (!value) return "—";
  const day = CALENDAR_DAY.exec(value);
  if (day) return `${day[3]}/${day[2]}/${day[1]}`;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return DATE_FORMAT.format(date);
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
