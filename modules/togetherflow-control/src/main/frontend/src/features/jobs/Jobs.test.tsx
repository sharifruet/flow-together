import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import {
  ApiError,
  RouterProvider,
  ToastProvider,
  type JobApi,
  type JobResponse,
} from "@togetherflow/common";
import { Jobs, truncate } from "./Jobs";

function page(rows: JobResponse[], total = rows.length) {
  return { data: rows, total, start: 0, size: 25 };
}

type StubJobApi = JobApi & {
  list: Mock;
  execute: Mock;
  delete: Mock;
  moveDeadLetters: Mock;
  stacktrace: Mock;
};

const JOB: JobResponse = {
  id: "job-1",
  elementName: "Send email",
  handlerType: "async-continuation",
  retries: 0,
  exceptionMessage: "Connection refused to smtp.example.com",
  createTime: "2026-08-20T10:00:00Z",
};

function stubApi(overrides: Record<string, unknown> = {}): StubJobApi {
  return {
    list: vi.fn().mockResolvedValue(page([JOB])),
    execute: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    moveDeadLetter: vi.fn().mockResolvedValue(undefined),
    moveDeadLetters: vi.fn().mockResolvedValue(undefined),
    rescheduleTimer: vi.fn().mockResolvedValue(undefined),
    stacktrace: vi.fn().mockResolvedValue("java.lang.RuntimeException: boom\n\tat Foo.bar()"),
    ...overrides,
  } as unknown as StubJobApi;
}

/** The queue and the failed-only filter live in the URL since W1.3. */
function renderJobs(api: JobApi) {
  window.history.replaceState({}, "", "/jobs");
  return render(
    <RouterProvider>
      <ToastProvider>
        <Jobs jobApi={api} />
      </ToastProvider>
    </RouterProvider>,
  );
}

describe("truncate", () => {
  it("shortens only when needed", () => {
    expect(truncate("short")).toBe("short");
    expect(truncate("x".repeat(100))).toHaveLength(80);
  });
});

describe("Jobs", () => {
  it("lists jobs in the async queue by default", async () => {
    const api = stubApi();
    renderJobs(api);

    expect(await screen.findByText("Send email")).toBeInTheDocument();
    expect(api.list.mock.calls[0][0]).toBe("async");
  });

  it("switches queue and refetches", async () => {
    const api = stubApi();
    renderJobs(api);
    await screen.findByText("Send email");

    await userEvent.click(screen.getByRole("tab", { name: /dead letter/i }));

    await waitFor(() => expect(api.list.mock.calls.at(-1)?.[0]).toBe("deadletter"));
  });

  it("filters to failed jobs only", async () => {
    const api = stubApi();
    renderJobs(api);
    await screen.findByText("Send email");

    await userEvent.click(screen.getByRole("checkbox", { name: /failed only/i }));

    await waitFor(() =>
      expect(api.list.mock.calls.at(-1)?.[1]).toMatchObject({ withException: true }),
    );
  });

  it("flags an exhausted job's retry count", async () => {
    renderJobs(stubApi());
    await screen.findByText("Send email");
    expect(screen.getByText("0")).toHaveClass("tf-badge--danger");
  });

  it("opens the stack trace for a failing job", async () => {
    const api = stubApi();
    renderJobs(api);
    await screen.findByText("Send email");

    await userEvent.click(screen.getByRole("button", { name: /connection refused/i }));

    expect(await screen.findByText(/java\.lang\.RuntimeException/)).toBeInTheDocument();
    expect(api.stacktrace).toHaveBeenCalledWith("async", "job-1", expect.anything());
  });

  it("confirms before running selected jobs, and says what will happen", async () => {
    const api = stubApi();
    renderJobs(api);
    await screen.findByText("Send email");

    await userEvent.click(screen.getByRole("checkbox", { name: /select job job-1/i }));
    await userEvent.click(screen.getByRole("button", { name: /run now/i }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(/executed immediately/i);
    expect(api.execute).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: /run now/i }));
    await waitFor(() => expect(api.execute).toHaveBeenCalledWith("async", "job-1"));
  });

  it("uses the engine's bulk endpoint when moving dead-letter jobs", async () => {
    const api = stubApi();
    renderJobs(api);
    await screen.findByText("Send email");
    await userEvent.click(screen.getByRole("tab", { name: /dead letter/i }));
    await screen.findByText("Send email");

    await userEvent.click(screen.getByRole("checkbox", { name: /select job job-1/i }));
    await userEvent.click(screen.getByRole("button", { name: /move back/i }));
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: /move back/i }),
    );

    await waitFor(() => expect(api.moveDeadLetters).toHaveBeenCalledWith(["job-1"]));
  });

  it("selects every job on the page at once", async () => {
    const api = stubApi({
      list: vi.fn().mockResolvedValue(page([JOB, { ...JOB, id: "job-2", elementName: "Other" }])),
    });
    renderJobs(api);
    await screen.findByText("Send email");

    await userEvent.click(screen.getByRole("checkbox", { name: /select all jobs on this page/i }));

    expect(screen.getByText("2 selected")).toBeInTheDocument();
  });

  it("reports partial failure honestly instead of claiming success", async () => {
    const api = stubApi({
      list: vi.fn().mockResolvedValue(page([JOB, { ...JOB, id: "job-2", elementName: "Other" }])),
      execute: vi
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new ApiError("nope", 500, "c", {})),
    });
    renderJobs(api);
    await screen.findByText("Send email");

    await userEvent.click(screen.getByRole("checkbox", { name: /select all jobs on this page/i }));
    await userEvent.click(screen.getByRole("button", { name: /run now/i }));
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: /run now/i }),
    );

    expect(await screen.findByText(/1 of 2 jobs executed; 1 failed/i)).toBeInTheDocument();
  });

  it("warns that deleting a job can stall the instance waiting on it", async () => {
    const api = stubApi();
    renderJobs(api);
    await screen.findByText("Send email");

    await userEvent.click(screen.getByRole("checkbox", { name: /select job job-1/i }));
    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(/may stall/i);
    expect(dialog).toHaveTextContent(/can't be undone/i);
  });

  it("shows a queue-specific empty state", async () => {
    renderJobs(stubApi({ list: vi.fn().mockResolvedValue(page([])) }));
    expect(await screen.findByText(/no async jobs/i)).toBeInTheDocument();
  });
});
