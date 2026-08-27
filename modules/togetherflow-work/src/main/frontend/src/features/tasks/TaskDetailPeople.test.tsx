/**
 * The task-detail additions from §7.1: people, sub-tasks, the audit trail, delegation
 * and case context.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { ToastProvider, type TaskApi, type TaskResponse } from "@togetherflow/common";
import { TaskDetail } from "./TaskDetail";

const TASK: TaskResponse = {
  id: "t1",
  name: "Approve invoice",
  assignee: "alice",
  priority: 50,
  suspended: false,
  createTime: "2026-08-20T09:00:00.000Z",
};

function stubApi(overrides: Record<string, unknown> = {}) {
  return {
    get: vi.fn().mockResolvedValue(TASK),
    listVariables: vi.fn().mockResolvedValue([]),
    listComments: vi.fn().mockResolvedValue([]),
    listAttachments: vi.fn().mockResolvedValue([]),
    listSubTasks: vi.fn().mockResolvedValue([]),
    listIdentityLinks: vi.fn().mockResolvedValue([]),
    listLogEntries: vi.fn().mockResolvedValue({ data: [], total: 0, start: 0, size: 100 }),
    getForm: vi.fn().mockResolvedValue(null),
    claim: vi.fn().mockResolvedValue(undefined),
    unclaim: vi.fn().mockResolvedValue(undefined),
    complete: vi.fn().mockResolvedValue(undefined),
    delegate: vi.fn().mockResolvedValue(undefined),
    resolve: vi.fn().mockResolvedValue(undefined),
    addComment: vi.fn().mockResolvedValue({}),
    uploadAttachment: vi.fn().mockResolvedValue({ id: "a1" }),
    addAttachmentLink: vi.fn().mockResolvedValue({}),
    deleteAttachment: vi.fn().mockResolvedValue(undefined),
    attachmentContentUrl: vi.fn().mockReturnValue("/x"),
    ...overrides,
  } as unknown as TaskApi & Record<string, Mock>;
}

function renderDetail(api: TaskApi, userId = "alice") {
  const onChanged = vi.fn();
  render(
    <ToastProvider>
      <TaskDetail
        taskApi={api}
        taskId="t1"
        userId={userId}
        onCompleted={vi.fn()}
        onChanged={onChanged}
        onClose={vi.fn()}
      />
    </ToastProvider>,
  );
  return { onChanged };
}

/**
 * People and Subtasks moved behind tabs in W2.2, matching Flowable Work's own task
 * detail. Opening the tab is now part of reaching them — which is the change, not an
 * inconvenience to route around.
 */
async function openTab(name: RegExp) {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("tab", { name }));
}

describe("TaskDetail — people and sub-tasks", () => {
  it("lists who is involved and how", async () => {
    renderDetail(
      stubApi({
        listIdentityLinks: vi.fn().mockResolvedValue([
          { user: "alice", group: null, type: "assignee" },
          { user: null, group: "finance", type: "candidate" },
        ]),
      }),
    );
    await openTab(/people/i);

    // Scoped to the panel: the header carries its own assignee chip since W2.2, so an
    // unscoped query for "alice" now legitimately matches twice.
    const panel = await screen.findByRole("tabpanel");
    expect(within(panel).getByText("alice")).toBeInTheDocument();
    expect(within(panel).getByText("assignee")).toBeInTheDocument();
    expect(within(panel).getByText("finance")).toBeInTheDocument();
    // A group link is labelled as such — "candidate" alone would read as a person.
    expect(within(panel).getByText("candidate (group)")).toBeInTheDocument();
  });

  it("omits the People section entirely when there are no links", async () => {
    renderDetail(stubApi());
    await screen.findByText("Approve invoice");
    expect(screen.queryByRole("heading", { name: "People" })).not.toBeInTheDocument();
  });

  it("lists sub-tasks with their assignment", async () => {
    renderDetail(
      stubApi({
        listSubTasks: vi
          .fn()
          .mockResolvedValue([{ id: "s1", name: "Check VAT", assignee: "bob" }]),
      }),
    );
    await openTab(/subtasks/i);

    expect(await screen.findByRole("heading", { name: /Sub-tasks \(1\)/ })).toBeInTheDocument();
    expect(screen.getByText("Check VAT")).toBeInTheDocument();
    expect(screen.getByText("assigned to bob")).toBeInTheDocument();
  });
});

describe("TaskDetail — audit trail", () => {
  /**
   * `enableHistoricTaskLogging` is false by default, so an empty list is the norm and
   * means "this engine records nothing", not "nothing happened". Saying the wrong one
   * would send an operator hunting for a bug that isn't there.
   */
  it("explains that an engine records nothing unless task logging is enabled", async () => {
    renderDetail(stubApi());
    expect(await screen.findByText(/enableHistoricTaskLogging/)).toBeInTheDocument();
  });

  it("shows entries when the engine does record them", async () => {
    renderDetail(
      stubApi({
        listLogEntries: vi.fn().mockResolvedValue({
          data: [
            { logNumber: 2, type: "USER_TASK_ASSIGNEE_CHANGED", timeStamp: "2026-08-21T10:00:00Z", userId: "bob" },
            { logNumber: 1, type: "USER_TASK_CREATED", timeStamp: "2026-08-20T09:00:00Z" },
          ],
          total: 2,
          start: 0,
          size: 100,
        }),
      }),
    );

    expect(await screen.findByText("USER_TASK_ASSIGNEE_CHANGED")).toBeInTheDocument();
    expect(screen.getByText("by bob")).toBeInTheDocument();
    expect(screen.queryByText(/enableHistoricTaskLogging/)).not.toBeInTheDocument();
  });

  it("says so when the trail could not be read at all", async () => {
    renderDetail(stubApi({ listLogEntries: vi.fn().mockRejectedValue(new Error("nope")) }));
    expect(await screen.findByText(/history could not be read/i)).toBeInTheDocument();
  });

  /**
   * Found by a stubbed e2e run: an endpoint answering with an unexpected shape made
   * `log.data.length` throw and took the entire task panel down — the task became
   * unworkable because its audit trail was odd.
   */
  it("survives an endpoint that answers with the wrong shape", async () => {
    renderDetail(
      stubApi({
        listLogEntries: vi.fn().mockResolvedValue({}),
        listSubTasks: vi.fn().mockResolvedValue({}),
        listIdentityLinks: vi.fn().mockResolvedValue({}),
      }),
    );

    // The task itself still renders, which is the point.
    expect(await screen.findByText("Approve invoice")).toBeInTheDocument();
    expect(screen.getByText(/history could not be read/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "People" })).not.toBeInTheDocument();
  });
});

describe("TaskDetail — delegation", () => {
  it("explains that delegating keeps you the owner", async () => {
    const user = userEvent.setup();
    renderDetail(stubApi());

    await user.click(await screen.findByRole("button", { name: "Delegate" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/on your behalf/i);
    expect(dialog).toHaveTextContent(/You stay its owner/i);
  });

  it("delegates to the named user", async () => {
    const user = userEvent.setup();
    const api = stubApi();
    const { onChanged } = renderDetail(api);

    await user.click(await screen.findByRole("button", { name: "Delegate" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Delegate to"), "bob");
    await user.click(within(dialog).getByRole("button", { name: "Delegate" }));

    await waitFor(() => expect(api.delegate).toHaveBeenCalledWith("t1", "bob"));
    expect(onChanged).toHaveBeenCalled();
  });

  it("cannot delegate to nobody", async () => {
    const user = userEvent.setup();
    renderDetail(stubApi());

    await user.click(await screen.findByRole("button", { name: "Delegate" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Delegate" })).toBeDisabled();
  });

  /**
   * Resolving hands a delegated task back to its owner; it does not complete it. The
   * button only appears for the delegate, and names who gets it back.
   */
  it("offers the delegate a hand-back, naming the owner", async () => {
    const user = userEvent.setup();
    const api = stubApi({
      get: vi
        .fn()
        .mockResolvedValue({ ...TASK, assignee: "bob", owner: "alice", delegationState: "pending" }),
    });
    renderDetail(api, "bob");

    const button = await screen.findByRole("button", { name: /Hand back to alice/ });
    await user.click(button);

    await waitFor(() => expect(api.resolve).toHaveBeenCalledWith("t1"));
  });

  it("does not offer a hand-back to anyone but the delegate", async () => {
    renderDetail(
      stubApi({
        get: vi
          .fn()
          .mockResolvedValue({ ...TASK, assignee: "bob", owner: "alice", delegationState: "pending" }),
      }),
      "alice",
    );

    await screen.findByText("Approve invoice");
    expect(screen.queryByRole("button", { name: /Hand back/ })).not.toBeInTheDocument();
  });
});

describe("TaskDetail — case context", () => {
  /**
   * The task table is shared across engines, so a case task lands in the same inbox as
   * a process task. Without a marker there is nothing to tell them apart.
   */
  it("marks a task that belongs to a case", async () => {
    renderDetail(stubApi({ get: vi.fn().mockResolvedValue({ ...TASK, scopeType: "cmmn" }) }));
    expect(await screen.findByText("Case")).toBeInTheDocument();
  });

  it("does not mark an ordinary process task", async () => {
    renderDetail(stubApi());
    await screen.findByText("Approve invoice");
    expect(screen.queryByText("Case")).not.toBeInTheDocument();
  });
});
