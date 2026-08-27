/** Form-rendering path in TaskDetail (REQUIREMENTS.md §7.1 Forms). */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { ToastProvider, type FormModelResponse, type TaskApi, type TaskResponse } from "@togetherflow/common";
import { TaskDetail } from "./TaskDetail";

function task(overrides: Partial<TaskResponse> = {}): TaskResponse {
  return {
    id: "task-1",
    name: "Approve invoice",
    priority: 50,
    suspended: false,
    assignee: "alice",
    formKey: "approvalForm",
    ...overrides,
  };
}

const FORM: FormModelResponse = {
  id: "f1",
  name: "Approval",
  key: "approvalForm",
  fields: [
    { id: "comment", name: "Comment", type: "text", required: true },
    { id: "amount", name: "Amount", type: "integer" },
    { id: "urgent", name: "Urgent", type: "boolean" },
    {
      id: "reason",
      name: "Reason",
      type: "dropdown",
      fieldType: "OptionFormField",
      options: [{ name: "Duplicate" }, { name: "Over budget" }],
    },
    { id: "title", name: "Section", type: "headline" },
  ],
};

type StubTaskApi = TaskApi & { getForm: Mock; complete: Mock; listVariables: Mock };

function stubApi(overrides: Record<string, unknown> = {}): StubTaskApi {
  return {
    get: vi.fn().mockResolvedValue(task()),
    listVariables: vi.fn().mockResolvedValue([{ name: "legacy", type: "string", value: "x" }]),
    listComments: vi.fn().mockResolvedValue([]),
    listAttachments: vi.fn().mockResolvedValue([]),
    listSubTasks: vi.fn().mockResolvedValue([]),
    listIdentityLinks: vi.fn().mockResolvedValue([]),
    listLogEntries: vi.fn().mockResolvedValue({ data: [], total: 0, start: 0, size: 100 }),
    delegate: vi.fn().mockResolvedValue(undefined),
    resolve: vi.fn().mockResolvedValue(undefined),
    assign: vi.fn().mockResolvedValue({}),
    getForm: vi.fn().mockResolvedValue(FORM),
    complete: vi.fn().mockResolvedValue(undefined),
    claim: vi.fn().mockResolvedValue(undefined),
    unclaim: vi.fn().mockResolvedValue(undefined),
    addComment: vi.fn().mockResolvedValue({ id: "c", message: "m" }),
    attachmentContentUrl: () => "/x",
    ...overrides,
  } as unknown as StubTaskApi;
}

function renderDetail(api: TaskApi, props: Record<string, unknown> = {}) {
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

async function confirmComplete() {
  await userEvent.click(screen.getByRole("button", { name: /complete task/i }));
  await userEvent.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", { name: /complete task/i }),
  );
}

describe("TaskDetail — form rendering", () => {
  it("renders the form's fields instead of the raw variable grid", async () => {
    renderDetail(stubApi());

    expect(await screen.findByLabelText(/^Comment/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Amount/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /reason/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Section" })).toBeInTheDocument();
    // The generic key/value editor should not appear alongside a real form.
    expect(screen.queryByRole("button", { name: /add variable/i })).not.toBeInTheDocument();
  });

  it("does not request a form for a task that declares none", async () => {
    const api = stubApi({ get: vi.fn().mockResolvedValue(task({ formKey: undefined })) });
    renderDetail(api);

    await screen.findByRole("heading", { name: "Approve invoice" });
    expect(api.getForm).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /add variable/i })).toBeInTheDocument();
  });

  it("falls back to the variable grid, with an explanation, when the form cannot be loaded", async () => {
    renderDetail(stubApi({ getForm: vi.fn().mockResolvedValue(null) }));

    expect(await screen.findByText(/definition could not be loaded/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add variable/i })).toBeInTheDocument();
  });

  it("falls back when the form has no renderable fields", async () => {
    renderDetail(stubApi({ getForm: vi.fn().mockResolvedValue({ id: "f", name: "Empty", fields: [] }) }));

    expect(await screen.findByText(/definition could not be loaded/i)).toBeInTheDocument();
  });

  it("does not complete a task whose required field is empty, and says why", async () => {
    /*
     * The Complete button is deliberately *not* disabled. Errors only surface once a
     * field has been visited, so a disabled button on an untouched form is a form with
     * no visible problems and a control that will not respond — the user is left with
     * nothing to act on. The attempt is accepted instead, and answered.
     */
    const api = stubApi();
    renderDetail(api);
    await screen.findByLabelText(/^Comment/);

    const complete = screen.getByRole("button", { name: /complete task/i });
    expect(complete).toBeEnabled();

    await userEvent.click(complete);

    // No confirmation, no call — and a summary naming the problem.
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(api.complete).not.toHaveBeenCalled();
    const summary = await screen.findByRole("alert");
    expect(summary).toHaveTextContent(/There is 1 problem with this form/i);
    expect(within(summary).getByRole("link")).toHaveTextContent(/comment is required/i);
    await waitFor(() => expect(summary).toHaveFocus());
  });

  it("clears the summary once the problem is fixed, and then completes", async () => {
    const api = stubApi();
    renderDetail(api);
    await screen.findByLabelText(/^Comment/);

    await userEvent.click(screen.getByRole("button", { name: /complete task/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/^Comment/), "Looks fine");
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());

    await confirmComplete();
    await waitFor(() => expect(api.complete).toHaveBeenCalled());
  });

  it("shows a required-field error only after the field is left, not while empty and untouched", async () => {
    renderDetail(stubApi());
    const comment = await screen.findByLabelText(/^Comment/);

    expect(screen.queryByText(/comment is required/i)).not.toBeInTheDocument();

    await userEvent.click(comment);
    await userEvent.tab();

    expect(await screen.findByText(/comment is required/i)).toBeInTheDocument();
  });

  it("submits typed variables derived from the form's field types", async () => {
    const api = stubApi();
    renderDetail(api);
    await screen.findByLabelText(/^Comment/);

    await userEvent.type(screen.getByLabelText(/^Comment/), "Approved");
    await userEvent.type(screen.getByLabelText(/^Amount/), "42");
    await userEvent.click(screen.getByLabelText(/^Urgent/));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: /reason/i }), "Duplicate");

    await confirmComplete();

    await waitFor(() => expect(api.complete).toHaveBeenCalled());
    expect(api.complete).toHaveBeenCalledWith("task-1", [
      { name: "comment", type: "string", value: "Approved" },
      { name: "amount", type: "integer", value: 42 },
      { name: "urgent", type: "boolean", value: true },
      { name: "reason", type: "string", value: "Duplicate" },
    ]);
  });

  it("disables the form for a task the user has not claimed", async () => {
    renderDetail(stubApi({ get: vi.fn().mockResolvedValue(task({ assignee: undefined })) }));

    expect(await screen.findByLabelText(/^Comment/)).toBeDisabled();
    expect(screen.getByText(/claim this task to fill this in/i)).toBeInTheDocument();
  });
});
