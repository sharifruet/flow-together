/** Form-rendering path in TaskDetail (REQUIREMENTS.md §7.1 Forms). */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { ApiError, ToastProvider, type FormModelResponse, type TaskApi, type TaskResponse } from "@togetherflow/common";
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

type StubTaskApi = TaskApi & { getForm: Mock; getFormResult: Mock; complete: Mock; completeWithForm: Mock; listVariables: Mock };

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
    completeWithForm: vi.fn().mockResolvedValue(undefined),
    claim: vi.fn().mockResolvedValue(undefined),
    unclaim: vi.fn().mockResolvedValue(undefined),
    addComment: vi.fn().mockResolvedValue({ id: "c", message: "m" }),
    attachmentContentUrl: () => "/x",
    ...overrides,
  } as unknown as StubTaskApi;
}

/**
 * The detail asks `getFormResult`, which wraps `getForm`'s answer with the failure
 * reason; tests keep stubbing `getForm` and this derives the wrapper from it.
 */
function withFormResult(api: StubTaskApi): StubTaskApi {
  if (!("getFormResult" in api) || !api.getFormResult) {
    api.getFormResult = vi.fn(async (taskId: string, signal?: AbortSignal) => {
      const form = await api.getForm(taskId, signal);
      return form ? { form } : { form: null, status: 400, message: "Form engine is not initialized" };
    }) as unknown as Mock;
  }
  return api;
}

function renderDetail(api: TaskApi, props: Record<string, unknown> = {}) {
  withFormResult(api as StubTaskApi);
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

    expect(await screen.findByText(/showing the underlying variables instead/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add variable/i })).toBeInTheDocument();
  });

  it("falls back when the form has no renderable fields", async () => {
    renderDetail(stubApi({ getForm: vi.fn().mockResolvedValue({ id: "f", name: "Empty", fields: [] }) }));

    expect(await screen.findByText(/showing the underlying variables instead/i)).toBeInTheDocument();
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
    await waitFor(() => expect(api.completeWithForm).toHaveBeenCalled());
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

    // Through the form engine (FR-S.1): the definition id and outcome travel with the
    // values, so the engine validates, converts and records the submission itself.
    await waitFor(() => expect(api.completeWithForm).toHaveBeenCalled());
    expect(api.completeWithForm).toHaveBeenCalledWith(
      "task-1",
      "f1",
      undefined,
      [
        { name: "comment", type: "string", value: "Approved" },
        { name: "amount", type: "integer", value: 42 },
        { name: "urgent", type: "boolean", value: true },
        { name: "reason", type: "string", value: "Duplicate" },
      ],
      // The task itself travels as the scope, so a case task completes via the CMMN API.
      expect.objectContaining({ id: "task-1" }),
    );
    expect(api.complete).not.toHaveBeenCalled();
  });

  it("shows the engine's refusal on the fields it named (FR-W.4)", async () => {
    const api = stubApi({
      completeWithForm: vi.fn().mockRejectedValue(
        new ApiError("Bad request", 400, "corr-9", {
          message: "Form validation failed",
          fields: [
            { id: "amount", code: "max", message: "engine words" },
            { id: null, code: "outcome", message: "engine words" },
          ],
        }),
      ),
    });
    renderDetail(api);
    await userEvent.type(await screen.findByLabelText(/^Comment/), "Approved");
    await userEvent.type(screen.getByLabelText(/^Amount/), "42");

    await confirmComplete();

    // The summary names the refused field, the field carries the message, and the
    // form-level problem is stated above the form.
    expect(await screen.findByRole("alert", { name: /problem/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Amount/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/not one this form offers/i)).toBeInTheDocument();

    // Fixing the field clears the engine's verdict for it.
    await userEvent.type(screen.getByLabelText(/^Amount/), "0");
    await waitFor(() => expect(screen.getByLabelText(/^Amount/)).not.toHaveAttribute("aria-invalid"));
  });

  it("names the engine's answer when a declared form cannot be loaded (FR-W.9)", async () => {
    renderDetail(stubApi({ getForm: vi.fn().mockResolvedValue(null) }));
    expect(await screen.findByText(/engine answered 400/i)).toBeInTheDocument();
    expect(screen.getByText(/Form engine is not initialized/)).toBeInTheDocument();
  });

  it("keeps the variable grid reachable beside a form (FR-W.7)", async () => {
    renderDetail(stubApi());
    await screen.findByLabelText(/^Comment/);
    expect(screen.queryByText("legacy")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /show variables/i }));
    expect(await screen.findByDisplayValue("legacy")).toBeInTheDocument();
  });

  it("disables the form for a task the user has not claimed", async () => {
    renderDetail(stubApi({ get: vi.fn().mockResolvedValue(task({ assignee: undefined })) }));

    expect(await screen.findByLabelText(/^Comment/)).toBeDisabled();
    expect(screen.getByText(/claim this task to fill this in/i)).toBeInTheDocument();
  });
});
