import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError, type CaseApi, type HistoryApi } from "@togetherflow/common";
import type { Mock } from "vitest";
import { MyHistory, formatDuration } from "./MyHistory";

function page<T>(rows: T[], total = rows.length) {
  return { data: rows, total, start: 0, size: 25 };
}

/** The mocked shape, so tests can read `.mock` without casting at each call site. */
type StubHistoryApi = HistoryApi & {
  queryTasks: Mock;
  queryProcessInstances: Mock;
};

/** Cases live on a separate engine, so the screen takes a second API. */
function stubCaseApi(overrides: Partial<Record<string, unknown>> = {}): CaseApi & { queryHistoric: Mock } {
  return {
    queryHistoric: vi.fn().mockResolvedValue(page([])),
    ...overrides,
  } as unknown as CaseApi & { queryHistoric: Mock };
}

function stubApi(overrides: Partial<Record<string, unknown>> = {}): StubHistoryApi {
  return {
    queryTasks: vi.fn().mockResolvedValue(page([])),
    queryProcessInstances: vi.fn().mockResolvedValue(page([])),
    ...overrides,
  } as unknown as StubHistoryApi;
}

describe("formatDuration", () => {
  it("scales units and handles missing values", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(undefined)).toBe("—");
    expect(formatDuration(5_000)).toBe("5s");
    expect(formatDuration(120_000)).toBe("2m");
    expect(formatDuration(7_200_000)).toBe("2h");
    expect(formatDuration(172_800_000)).toBe("2d");
  });
});

describe("MyHistory", () => {
  it("queries the signed-in user's finished tasks, newest first", async () => {
    const api = stubApi();
    render(<MyHistory historyApi={api} caseApi={stubCaseApi()} userId="alice" />);

    await waitFor(() => expect(api.queryTasks).toHaveBeenCalled());
    expect(api.queryTasks.mock.calls[0][0]).toMatchObject({
      taskAssignee: "alice",
      finished: true,
      sort: "endTime",
      order: "desc",
    });
  });

  it("lists completed tasks", async () => {
    const api = stubApi({
      queryTasks: vi.fn().mockResolvedValue(
        page([
          { id: "h1", name: "Approve invoice", endTime: "2026-08-20T10:00:00Z", durationInMillis: 120000 },
        ]),
      ),
    });
    render(<MyHistory historyApi={api} caseApi={stubCaseApi()} userId="alice" />);

    expect(await screen.findByText("Approve invoice")).toBeInTheDocument();
    expect(screen.getByText("2m")).toBeInTheDocument();
  });

  it("shows a guiding empty state when nothing is finished", async () => {
    render(<MyHistory historyApi={stubApi()} caseApi={stubCaseApi()} userId="alice" />);
    expect(await screen.findByText(/nothing completed yet/i)).toBeInTheDocument();
  });

  it("distinguishes a zero-results search", async () => {
    render(<MyHistory historyApi={stubApi()} caseApi={stubCaseApi()} userId="alice" />);
    await screen.findByText(/nothing completed yet/i);

    await userEvent.type(screen.getByRole("searchbox"), "zzz");

    expect(await screen.findByText(/no matches/i)).toBeInTheDocument();
  });

  it("switches to process instances involving the user", async () => {
    const api = stubApi({
      queryProcessInstances: vi.fn().mockResolvedValue(
        page([
          { id: "p1", name: "Invoice run", startTime: "2026-08-01T09:00:00Z", endTime: "2026-08-02T09:00:00Z" },
          { id: "p2", name: "Onboarding", startTime: "2026-08-03T09:00:00Z" },
        ]),
      ),
    });
    render(<MyHistory historyApi={api} caseApi={stubCaseApi()} userId="alice" />);

    await userEvent.click(screen.getByRole("tab", { name: /process instances/i }));

    expect(await screen.findByText("Invoice run")).toBeInTheDocument();
    expect(api.queryProcessInstances.mock.calls[0][0]).toMatchObject({ involvedUser: "alice" });
    // An instance without an endTime is still running.
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
  });

  it("surfaces a retryable error state", async () => {
    const api = stubApi({
      queryTasks: vi.fn().mockRejectedValue(new ApiError("Boom", 500, "corr-h", undefined)),
    });
    render(<MyHistory historyApi={api} caseApi={stubCaseApi()} userId="alice" />);

    expect(await screen.findByText(/couldn't load this/i)).toBeInTheDocument();
    expect(screen.getByText("corr-h")).toBeInTheDocument();
  });

  it("pages server-side", async () => {
    const api = stubApi({
      queryTasks: vi.fn().mockResolvedValue(page([{ id: "h1", name: "T" }], 80)),
    });
    render(<MyHistory historyApi={api} caseApi={stubCaseApi()} userId="alice" />);
    await screen.findByText("T");

    await userEvent.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => expect(api.queryTasks.mock.calls.at(-1)?.[0]).toMatchObject({ start: 25 }));
  });
});
