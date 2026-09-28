/**
 * Dates read the same everywhere (format.ts).
 *
 * The house format is DD/MM/YYYY. This deployment's approvals turn on a last working
 * day, and an English-locale `dateStyle` rendered 31/10 as "Oct 31" on one screen,
 * "10/31/2026" on another and the raw Java date in the mail.
 */

import { describe, expect, it } from "vitest";
import { dueState, formatDate, formatDateTime, priorityKey, priorityLabel } from "./format";

describe("formatDate", () => {
  it("is day/month/year", () => {
    expect(formatDate("2026-10-31")).toBe("31/10/2026");
    expect(formatDate("2026-01-05")).toBe("05/01/2026");
  });

  /**
   * A calendar day has no instant in it. Parsing "2026-10-31" gives midnight UTC, which
   * is 30 October anywhere west of Greenwich — so a last working day would show a day
   * early for half the world. It is reordered as written instead.
   */
  it("keeps a bare calendar day on the day it was written, in any timezone", () => {
    expect(formatDate("2026-10-31")).toBe("31/10/2026");
    expect(formatDate("2026-10-31T00:00:00.000Z")).toBe("31/10/2026");
    expect(formatDate("2026-10-31T23:30:00.000Z")).toBe("31/10/2026");
  });

  it("says nothing rather than guessing when there is no date", () => {
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("")).toBe("—");
    expect(formatDate("not a date")).toBe("—");
  });
});

describe("formatDateTime", () => {
  it("puts the day first whatever the UI language", () => {
    // An en-US reader would otherwise get 10/31/2026 here, and a German one 31.10.2026.
    for (const locale of ["en", "en-US", "de", undefined]) {
      expect(formatDateTime("2026-10-31T09:05:00.000Z", locale)).toMatch(/^31\/10\/2026, /);
    }
  });

  /** Asserted as 12- versus 24-hour rather than as an hour: the clock is the test host's. */
  it("leaves the time of day to the locale — that part is a real preference", () => {
    expect(formatDateTime("2026-10-31T14:05:00.000Z", "en-US")).toMatch(/\d{1,2}:\d{2}\s?(AM|PM)$/);
    expect(formatDateTime("2026-10-31T14:05:00.000Z", "en-GB")).toMatch(/\d{2}:\d{2}$/);
  });

  it("says nothing rather than guessing when there is no date", () => {
    expect(formatDateTime(undefined)).toBe("—");
    expect(formatDateTime("nonsense")).toBe("—");
  });
});

describe("dueState", () => {
  const now = new Date("2026-10-31T12:00:00.000Z");

  it("reads a due date as how long away it is, not as a date", () => {
    expect(dueState("2026-11-03T12:00:00.000Z", { now, locale: "en" })).toEqual({
      label: "in 3 days",
      tone: "normal",
    });
    expect(dueState("2026-11-01T12:00:00.000Z", { now, locale: "en" }).tone).toBe("due-soon");
    expect(dueState("2026-10-30T12:00:00.000Z", { now, locale: "en" })).toEqual({
      label: "yesterday",
      tone: "overdue",
    });
  });

  it("uses the caller's words for a task with no due date", () => {
    expect(dueState(undefined, { now, noDueDateLabel: "No due date" })).toEqual({
      label: "No due date",
      tone: "none",
    });
  });
});

describe("priority", () => {
  it("bands a numeric priority", () => {
    expect(priorityKey(100)).toBe("high");
    expect(priorityKey(50)).toBe("normal");
    expect(priorityKey(10)).toBe("low");
    expect(priorityLabel(50)).toBe("Normal");
    expect(priorityLabel(80, (key) => key)).toBe("format.priority.high");
  });
});
