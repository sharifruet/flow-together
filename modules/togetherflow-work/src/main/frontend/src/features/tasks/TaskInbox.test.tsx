import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  ApiError,
  RouterProvider,
  type DataResponse,
  type TaskApi,
  type TaskResponse,
} from "@togetherflow/common";
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

/**
 * The inbox reads its filters, sort and page from the URL since W1.3, so it needs a
 * router the way it already needed an API — this is not test scaffolding around an
 * incidental dependency.
 */
function renderInbox(api: TaskApi, overrides: Partial<Parameters<typeof TaskInbox>[0]> = {}) {
  window.history.replaceState({}, "", "/inbox");
  return render(
    <RouterProvider>
      <TaskInbox
        taskApi={api}
        userId="alice"
        onSelectTask={vi.fn()}
        refreshToken={0}
        onStartWork={vi.fn()}
        {...overrides}
      />
    </RouterProvider>,
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

/**
 * The filter panel folds away so the list starts on the first screen — on a phone it used
 * to begin roughly 660px down, below three strips of controls.
 *
 * The risk that trade makes is hidden state: a list quietly narrowed by a filter nobody
 * can see is worse than a crowded one. So these check both halves — the controls collapse,
 * and anything in force stays visible and removable.
 */
describe("TaskInbox — collapsible filters", () => {
  /**
   * Anchored, because once a filter is applied "Clear filters" is on screen too and a
   * loose /filters/ matches both.
   */
  const toggle = () => screen.getByRole("button", { name: /^filters/i });

  /** Applies the Due filter the way a person does: open the panel, choose, close it. */
  async function applyOverdue() {
    await userEvent.click(toggle());
    await userEvent.selectOptions(screen.getByLabelText("Due"), "overdue");
    await userEvent.click(toggle());
  }

  it("keeps the filter controls out of the way until they are asked for", async () => {
    renderInbox(stubApi(vi.fn().mockResolvedValue(page([task()]))));
    await screen.findByText("Approve invoice");

    expect(toggle()).toHaveAttribute("aria-expanded", "false");
    // `hidden` rather than unmounted, so the selects keep their state across a toggle.
    expect(document.getElementById("tf-inbox-filters")).toHaveAttribute("hidden");

    await userEvent.click(toggle());
    expect(toggle()).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById("tf-inbox-filters")).not.toHaveAttribute("hidden");
  });

  it("shows a filter that is in force even while the panel is shut", async () => {
    renderInbox(stubApi(vi.fn().mockResolvedValue(page([task()]))));
    await screen.findByText("Approve invoice");
    await applyOverdue();

    // Collapsing may not hide state: the panel is closed, the filter is still announced.
    expect(document.getElementById("tf-inbox-filters")).toHaveAttribute("hidden");
    expect(screen.getByRole("button", { name: /Due: Overdue/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /filters \(1\)/i })).toBeInTheDocument();
  });

  it("drops a filter when its chip is dismissed", async () => {
    const query = vi.fn().mockResolvedValue(page([task()]));
    renderInbox(stubApi(query));
    await screen.findByText("Approve invoice");
    await applyOverdue();
    // The chip is the control, so it has to reach the server — not just tidy the chrome.
    await waitFor(() => expect(query.mock.calls.at(-1)?.[0]).toHaveProperty("dueBefore"));

    await userEvent.click(screen.getByRole("button", { name: /Due: Overdue/i }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /Due: Overdue/i })).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(query.mock.calls.at(-1)?.[0]).not.toHaveProperty("dueBefore"));
  });
});
