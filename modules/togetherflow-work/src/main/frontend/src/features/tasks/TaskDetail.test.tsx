import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError, ToastProvider, type TaskApi, type TaskResponse } from "@togetherflow/common";
import { TaskDetail } from "./TaskDetail";

function task(overrides: Partial<TaskResponse> = {}): TaskResponse {
  return {
    id: "task-1",
    name: "Approve invoice",
    priority: 50,
    suspended: false,
    assignee: "alice",
    ...overrides,
  };
}

interface ApiOverrides {
  get?: TaskApi["get"];
  listVariables?: TaskApi["listVariables"];
  listComments?: TaskApi["listComments"];
  listAttachments?: TaskApi["listAttachments"];
  complete?: TaskApi["complete"];
  claim?: TaskApi["claim"];
  unclaim?: TaskApi["unclaim"];
  addComment?: TaskApi["addComment"];
}

function stubApi(overrides: ApiOverrides = {}) {
  return {
    get: vi.fn().mockResolvedValue(task()),
    listVariables: vi.fn().mockResolvedValue([]),
    listComments: vi.fn().mockResolvedValue([]),
    listAttachments: vi.fn().mockResolvedValue([]),
    listSubTasks: vi.fn().mockResolvedValue([]),
    listIdentityLinks: vi.fn().mockResolvedValue([]),
    listLogEntries: vi.fn().mockResolvedValue({ data: [], total: 0, start: 0, size: 100 }),
    delegate: vi.fn().mockResolvedValue(undefined),
    resolve: vi.fn().mockResolvedValue(undefined),
    assign: vi.fn().mockResolvedValue({}),
    uploadAttachment: vi.fn().mockResolvedValue({ id: "a1", name: "f" }),
    addAttachmentLink: vi.fn().mockResolvedValue({ id: "a2", name: "l" }),
    deleteAttachment: vi.fn().mockResolvedValue(undefined),
    attachmentContentUrl: (taskId: string, id: string) =>
      `/process-api/runtime/tasks/${taskId}/attachments/${id}/content`,
    complete: vi.fn().mockResolvedValue(undefined),
    claim: vi.fn().mockResolvedValue(undefined),
    unclaim: vi.fn().mockResolvedValue(undefined),
    addComment: vi.fn().mockResolvedValue({ id: "c1", message: "hi" }),
    ...overrides,
  } as unknown as TaskApi & Record<keyof ApiOverrides, ReturnType<typeof vi.fn>>;
}

function renderDetail(
  api: TaskApi,
  props: Partial<Parameters<typeof TaskDetail>[0]> = {},
) {
  return render(
    <ToastProvider>
      <TaskDetail
        taskApi={api}
        taskId="task-1"
        userId="alice"
        onCompleted={vi.fn()}
        onChanged={vi.fn()}
        onClose={vi.fn()}
        {...props}
      />
    </ToastProvider>,
  );
}

describe("TaskDetail", () => {
  it("prompts to pick a task when nothing is selected", async () => {
    renderDetail(stubApi(), { taskId: undefined });
    expect(await screen.findByText(/no task selected/i)).toBeInTheDocument();
  });

  it("loads and shows the task", async () => {
    renderDetail(stubApi());
    expect(await screen.findByRole("heading", { name: "Approve invoice" })).toBeInTheDocument();
    expect(screen.getAllByText("alice")[0]).toBeInTheDocument();
  });

  it("requires confirmation naming the task before completing it", async () => {
    const api = stubApi();
    renderDetail(api);
    await screen.findByRole("heading", { name: "Approve invoice" });

    await userEvent.click(screen.getByRole("button", { name: /complete task/i }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(/"Approve invoice" will be completed/i);
    expect(api.complete).not.toHaveBeenCalled();
  });

  it("completes the task with its variables once confirmed", async () => {
    const api = stubApi({
      listVariables: vi.fn().mockResolvedValue([{ name: "amount", type: "long", value: 10 }]),
    });
    const onCompleted = vi.fn();
    renderDetail(api, { onCompleted });
    await screen.findByRole("heading", { name: "Approve invoice" });

    await userEvent.click(screen.getByRole("button", { name: /complete task/i }));
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: /complete task/i }),
    );

    await waitFor(() => expect(api.complete).toHaveBeenCalled());
    expect(api.complete).toHaveBeenCalledWith("task-1", [
      { name: "amount", type: "long", value: 10 },
    ]);
    expect(onCompleted).toHaveBeenCalled();
  });

  it("cancelling the confirmation does not complete the task", async () => {
    const api = stubApi();
    renderDetail(api);
    await screen.findByRole("heading", { name: "Approve invoice" });

    await userEvent.click(screen.getByRole("button", { name: /complete task/i }));
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: /cancel/i }),
    );

    expect(api.complete).not.toHaveBeenCalled();
  });

  it("blocks completion while a variable is invalid", async () => {
    const api = stubApi({
      listVariables: vi.fn().mockResolvedValue([{ name: "amount", type: "integer", value: 1 }]),
    });
    renderDetail(api);
    await screen.findByRole("heading", { name: "Approve invoice" });

    const valueInput = screen.getByLabelText(/value for amount/i);
    await userEvent.clear(valueInput);
    await userEvent.type(valueInput, "not-a-number");

    expect(await screen.findByText(/must be a number/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /complete task/i })).toBeDisabled();
  });

  it("offers Claim, not Complete, for an unassigned task", async () => {
    const api = stubApi({ get: vi.fn().mockResolvedValue(task({ assignee: undefined })) });
    renderDetail(api);
    await screen.findByRole("heading", { name: "Approve invoice" });

    expect(screen.getByRole("button", { name: /^claim$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /complete task/i })).not.toBeInTheDocument();
    expect(screen.getByText(/claim this task to fill this in/i)).toBeInTheDocument();
  });

  it("claims an unassigned task for the signed-in user", async () => {
    const api = stubApi({ get: vi.fn().mockResolvedValue(task({ assignee: undefined })) });
    renderDetail(api);
    await screen.findByRole("heading", { name: "Approve invoice" });

    await userEvent.click(screen.getByRole("button", { name: /^claim$/i }));

    await waitFor(() => expect(api.claim).toHaveBeenCalledWith("task-1", "alice"));
  });

  it("surfaces a failed action as an error toast carrying the reference id", async () => {
    const api = stubApi({
      complete: vi.fn().mockRejectedValue(new ApiError("Task already completed", 409, "corr-9", {})),
    });
    renderDetail(api);
    await screen.findByRole("heading", { name: "Approve invoice" });

    await userEvent.click(screen.getByRole("button", { name: /complete task/i }));
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: /complete task/i }),
    );

    expect(await screen.findByText("Task already completed")).toBeInTheDocument();
    expect(screen.getByText("corr-9")).toBeInTheDocument();
  });

  it("keeps working when comments cannot be loaded", async () => {
    const api = stubApi({ listComments: vi.fn().mockRejectedValue(new Error("boom")) });
    renderDetail(api);

    expect(await screen.findByRole("heading", { name: "Approve invoice" })).toBeInTheDocument();
    expect(screen.getByText(/no comments yet/i)).toBeInTheDocument();
  });
});
