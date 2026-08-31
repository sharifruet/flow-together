/**
 * Ad-hoc task creation (W2.2).
 *
 * Flowable Work lets someone create a standalone task with no process behind it; this
 * repo's `TaskCollectionResource` has always supported it and nothing in the UI did.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { ApiError, ToastProvider, type TaskApi } from "@togetherflow/common";
import { NewTaskDialog } from "./NewTaskDialog";

function renderDialog(overrides: Record<string, unknown> = {}) {
  const taskApi = {
    create: vi.fn().mockResolvedValue({ id: "task-9", name: "Chase the invoice" }),
    ...overrides,
  } as unknown as TaskApi & { create: Mock };
  const onCreated = vi.fn();

  render(
    <ToastProvider>
      <NewTaskDialog taskApi={taskApi} userId="ada" onClose={vi.fn()} onCreated={onCreated} />
    </ToastProvider>,
  );
  return { taskApi, onCreated };
}

describe("NewTaskDialog", () => {
  it("assigns to the signed-in user by default, since that is the common case", () => {
    renderDialog();
    expect(screen.getByLabelText(/assign to/i)).toHaveValue("ada");
  });

  it("will not create a task with no name", async () => {
    const { taskApi } = renderDialog();

    await userEvent.click(screen.getByRole("button", { name: /create task/i }));

    expect(await screen.findByText(/give the task a name/i)).toBeInTheDocument();
    expect(taskApi.create).not.toHaveBeenCalled();
  });

  it("creates the task and hands it back to the caller", async () => {
    const { taskApi, onCreated } = renderDialog();

    await userEvent.type(screen.getByLabelText(/what needs doing/i), "Chase the invoice");
    await userEvent.click(screen.getByRole("button", { name: /create task/i }));

    await waitFor(() => expect(taskApi.create).toHaveBeenCalled());
    const [request] = taskApi.create.mock.calls[0];
    expect(request).toMatchObject({ name: "Chase the invoice", assignee: "ada" });
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it("creates it unassigned when the assignee is cleared", async () => {
    // Explicit null, not an empty string: a blank assignee id is a real assignee that
    // matches nobody's inbox, which is not the same thing as unassigned.
    const { taskApi } = renderDialog();

    await userEvent.type(screen.getByLabelText(/what needs doing/i), "Triage");
    await userEvent.clear(screen.getByLabelText(/assign to/i));
    await userEvent.click(screen.getByRole("button", { name: /create task/i }));

    await waitFor(() => expect(taskApi.create).toHaveBeenCalled());
    const [request] = taskApi.create.mock.calls[0];
    expect(request.assignee).toBeNull();
  });

  it("reports a refusal without closing, so the typing is not lost", async () => {
    const { taskApi, onCreated } = renderDialog({
      create: vi.fn().mockRejectedValue(new ApiError("nope", 400, "c-1", undefined)),
    });

    await userEvent.type(screen.getByLabelText(/what needs doing/i), "Chase the invoice");
    await userEvent.click(screen.getByRole("button", { name: /create task/i }));

    await waitFor(() => expect(taskApi.create).toHaveBeenCalled());
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/what needs doing/i)).toHaveValue("Chase the invoice");
  });
});
