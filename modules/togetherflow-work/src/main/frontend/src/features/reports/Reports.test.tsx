/**
 * Work's overview (W2.2).
 *
 * Same honesty constraint as Control's dashboard: each tile is the `total` of one
 * `size=1` query, scoped to the signed-in user. The scoping is the part worth pinning —
 * an overview that quietly counted *everyone's* overdue tasks would be worse than none.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RouterProvider, type HistoryApi, type TaskApi } from "@togetherflow/common";
import { Reports } from "./Reports";

function page(total: number) {
  return { data: [], total, start: 0, size: 1 };
}

function stubs(overrides: Record<string, unknown> = {}) {
  const taskApi = {
    query: vi.fn().mockImplementation((query: { dueBefore?: string; unassigned?: boolean }) => {
      if (query.unassigned) return Promise.resolve(page(4));
      if (query.dueBefore && !("dueAfter" in query)) return Promise.resolve(page(2));
      if (query.dueBefore) return Promise.resolve(page(1));
      return Promise.resolve(page(11));
    }),
  } as unknown as TaskApi;
  const historyApi = { queryTasks: vi.fn().mockResolvedValue(page(48)) } as unknown as HistoryApi;
  return { taskApi, historyApi, userId: "ada", ...overrides };
}

function renderReports(apis = stubs()) {
  render(
    <RouterProvider basePath="/">
      <Reports {...(apis as Parameters<typeof Reports>[0])} />
    </RouterProvider>,
  );
}

function tile(label: RegExp) {
  return screen.getByText(label).closest("a") as HTMLElement;
}

describe("Reports", () => {
  it("counts the signed-in user's own work", async () => {
    renderReports();

    await waitFor(() => expect(within(tile(/^Assigned to you$/)).getByText("11")).toBeInTheDocument());
    expect(within(tile(/^Available to claim$/)).getByText("4")).toBeInTheDocument();
    expect(within(tile(/^Completed by you$/)).getByText("48")).toBeInTheDocument();
  });

  it("scopes every count to that user, never to everyone", async () => {
    // The failure this guards against is silent: a tile that dropped the assignee filter
    // would still render a plausible number.
    const apis = stubs();
    renderReports(apis);

    await waitFor(() => expect(apis.taskApi.query).toHaveBeenCalled());
    for (const [query] of (apis.taskApi.query as ReturnType<typeof vi.fn>).mock.calls) {
      expect(query.assignee === "ada" || query.candidateUser === "ada").toBe(true);
      expect(query.size).toBe(1);
    }
    expect(apis.historyApi.queryTasks).toHaveBeenCalledWith(
      expect.objectContaining({ taskAssignee: "ada", finished: true, size: 1 }),
      expect.anything(),
    );
  });

  it("loses one tile to a failed query rather than the screen", async () => {
    const apis = stubs({
      historyApi: {
        queryTasks: vi.fn().mockRejectedValue(new Error("history disabled")),
      } as unknown as HistoryApi,
    });
    renderReports(apis);

    await waitFor(() => expect(within(tile(/^Assigned to you$/)).getByText("11")).toBeInTheDocument());
    expect(
      within(tile(/^Completed by you$/)).getByTitle(/could not be read/i),
    ).toHaveTextContent("—");
  });
});
