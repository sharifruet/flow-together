import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError, type DataResponse, type TaskApi, type TaskResponse } from "@togetherflow/common";
import { TaskInbox } from "./TaskInbox";

function task(overrides: Partial<TaskResponse> = {}): TaskResponse {
  return {
    id: "task-1",
    name: "Approve invoice",
    priority: 50,
    suspended: false,
    ...overrides,
  };
}

function page(rows: TaskResponse[], total = rows.length): DataResponse<TaskResponse> {
  return { data: rows, total, start: 0, size: 25 };
}

function stubApi(query: TaskApi["query"]): TaskApi {
  return { query } as unknown as TaskApi;
}

function renderInbox(api: TaskApi, overrides: Partial<Parameters<typeof TaskInbox>[0]> = {}) {
  return render(
    <TaskInbox
      taskApi={api}
      userId="alice"
      onSelectTask={vi.fn()}
      refreshToken={0}
      onStartWork={vi.fn()}
      {...overrides}
    />,
  );
}

describe("TaskInbox", () => {
  it("shows a skeleton while the first page loads", () => {
    renderInbox(stubApi(vi.fn().mockReturnValue(new Promise(() => {}))));
    expect(screen.getByRole("status", { name: /loading/i })).toBeInTheDocument();
  });

  it("renders tasks once loaded", async () => {
    const query = vi.fn().mockResolvedValue(page([task(), task({ id: "task-2", name: "Review contract" })]));
    renderInbox(stubApi(query));

    expect(await screen.findByText("Approve invoice")).toBeInTheDocument();
    expect(screen.getByText("Review contract")).toBeInTheDocument();
  });

  it("queries for tasks assigned to the signed-in user by default", async () => {
    const query = vi.fn().mockResolvedValue(page([]));
    renderInbox(stubApi(query));

    await waitFor(() => expect(query).toHaveBeenCalled());
    expect(query.mock.calls[0][0]).toMatchObject({ assignee: "alice", active: true });
  });

  it("switches the query when the claimable filter is chosen", async () => {
    const query = vi.fn().mockResolvedValue(page([]));
    renderInbox(stubApi(query));
    await waitFor(() => expect(query).toHaveBeenCalled());

    await userEvent.click(screen.getByRole("tab", { name: /available to claim/i }));

    await waitFor(() => {
      const latest = query.mock.calls.at(-1)?.[0];
      expect(latest).toMatchObject({ candidateUser: "alice", unassigned: true });
    });
  });

  it("shows a guiding empty state, not a blank table, when there are no tasks", async () => {
    renderInbox(stubApi(vi.fn().mockResolvedValue(page([]))));

    expect(await screen.findByText(/no tasks assigned to you/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /start something new/i })).toBeInTheDocument();
  });

  it("distinguishes a zero-results search from a genuinely empty inbox", async () => {
    const query = vi.fn().mockResolvedValue(page([]));
    renderInbox(stubApi(query));
    await screen.findByText(/no tasks assigned to you/i);

    await userEvent.type(screen.getByRole("searchbox"), "nothing-matches");

    expect(await screen.findByText(/no matches/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /clear filters/i })).toBeInTheDocument();
  });

  it("sends the search term to the server rather than filtering client-side", async () => {
    const query = vi.fn().mockResolvedValue(page([task()]));
    renderInbox(stubApi(query));
    await screen.findByText("Approve invoice");

    await userEvent.type(screen.getByRole("searchbox"), "invoice");

    await waitFor(() => {
      expect(query.mock.calls.at(-1)?.[0]).toMatchObject({ nameLikeIgnoreCase: "%invoice%" });
    });
  });

  it("renders a retryable error state when the query fails", async () => {
    const query = vi
      .fn()
      .mockRejectedValueOnce(new ApiError("Server exploded", 500, "corr-1", undefined))
      .mockResolvedValue(page([task()]));
    renderInbox(stubApi(query));

    expect(await screen.findByText(/couldn't load this/i)).toBeInTheDocument();
    expect(screen.getByText("corr-1")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByText("Approve invoice")).toBeInTheDocument();
  });

  it("shows the permission-denied state instead of a generic error on 403", async () => {
    const query = vi.fn().mockRejectedValue(new ApiError("nope", 403, "corr-2", undefined));
    renderInbox(stubApi(query));

    expect(await screen.findByText(/don't have access/i)).toBeInTheDocument();
  });

  it("pages through results server-side", async () => {
    const query = vi.fn().mockResolvedValue(page([task()], 60));
    renderInbox(stubApi(query));
    await screen.findByText("Approve invoice");

    expect(screen.getByText("1–25 of 60")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => expect(query.mock.calls.at(-1)?.[0]).toMatchObject({ start: 25 }));
  });

  it("disables Previous on the first page", async () => {
    renderInbox(stubApi(vi.fn().mockResolvedValue(page([task()], 60))));
    await screen.findByText("Approve invoice");

    expect(screen.getByRole("button", { name: /previous/i })).toBeDisabled();
  });

  it("selects a task when its row is activated by keyboard", async () => {
    const onSelectTask = vi.fn();
    renderInbox(stubApi(vi.fn().mockResolvedValue(page([task()]))), { onSelectTask });
    await screen.findByText("Approve invoice");

    const row = screen.getAllByRole("row")[1];
    row.focus();
    await userEvent.keyboard("{Enter}");

    expect(onSelectTask).toHaveBeenCalledWith(expect.objectContaining({ id: "task-1" }));
  });
});
