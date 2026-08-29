/**
 * Moving execution state (W2.1). The engine will accept a request that does nothing, and
 * will accept cancelling an activity the instance is not at — the dialog's job is to make
 * the first visible and the second impossible.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import {
  ToastProvider,
  type ActivityInstanceResponse,
  type InstanceApi,
  type ProcessInstanceResponse,
  type RepositoryApi,
} from "@togetherflow/common";
import { ChangeStateDialog } from "./ChangeStateDialog";

const INSTANCE: ProcessInstanceResponse = {
  id: "pi-1",
  name: "Invoice INV-2291",
  suspended: false,
  ended: false,
  completed: false,
  processDefinitionId: "invoice:1:aaa",
};

const ACTIVITIES: ActivityInstanceResponse[] = [
  { id: "ai-1", activityId: "approveTask", activityName: "Approve", processInstanceId: "pi-1" },
  // Same activity id twice: a multi-instance activity, which must appear once.
  { id: "ai-2", activityId: "approveTask", activityName: "Approve", processInstanceId: "pi-1" },
  {
    id: "ai-0",
    activityId: "startEvent",
    activityName: "Start",
    processInstanceId: "pi-1",
    endTime: "2026-08-20T09:00:01Z",
  },
];

function renderDialog(overrides: Record<string, unknown> = {}) {
  const instanceApi = {
    changeState: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as InstanceApi & { changeState: Mock };

  const repositoryApi = {
    listActivityIdsFor: vi.fn().mockResolvedValue([
      { id: "approveTask", name: "Approve" },
      { id: "reviewTask", name: "Review" },
    ]),
  } as unknown as RepositoryApi;

  render(
    <ToastProvider>
      <ChangeStateDialog
        instanceApi={instanceApi}
        repositoryApi={repositoryApi}
        instance={INSTANCE}
        activities={ACTIVITIES}
        onClose={vi.fn()}
        onChanged={vi.fn()}
      />
    </ToastProvider>,
  );
  return instanceApi;
}

function section(name: RegExp) {
  return screen.getByRole("heading", { name }).parentElement as HTMLElement;
}

describe("ChangeStateDialog", () => {
  it("offers only running activities to cancel, once each", async () => {
    renderDialog();

    const cancel = section(/cancel these activities/i);
    const buttons = within(cancel).getAllByRole("button");
    // "Approve" appears twice in the activity list and once in the UI; "Start" has ended.
    expect(buttons.map((button) => button.textContent)).toEqual(["Approve"]);
  });

  it("offers any activity in the definition to start, reached or not", async () => {
    renderDialog();

    const start = section(/start these activities/i);
    await waitFor(() => expect(within(start).getAllByRole("button").length).toBe(2));
    expect(within(start).getByRole("button", { name: "Review" })).toBeInTheDocument();
  });

  it("refuses to send a request that would do nothing", () => {
    // The engine accepts both lists empty and changes nothing, which reads as a silent
    // failure rather than as the no-op it is.
    renderDialog();
    expect(screen.getByRole("button", { name: /move execution/i })).toBeDisabled();
  });

  it("omits an empty list rather than sending it", async () => {
    const api = renderDialog();

    await userEvent.click(
      within(section(/cancel these activities/i)).getByRole("button", { name: "Approve" }),
    );
    await userEvent.click(screen.getByRole("button", { name: /^move execution$/i }));

    await waitFor(() =>
      expect(api.changeState).toHaveBeenCalledWith("pi-1", {
        cancelActivityIds: ["approveTask"],
      }),
    );
  });

  it("sends both lists when both are chosen", async () => {
    const api = renderDialog();

    await userEvent.click(
      within(section(/cancel these activities/i)).getByRole("button", { name: "Approve" }),
    );
    const start = section(/start these activities/i);
    await waitFor(() => expect(within(start).getAllByRole("button").length).toBe(2));
    await userEvent.click(within(start).getByRole("button", { name: "Review" }));

    await userEvent.click(screen.getByRole("button", { name: /^move execution$/i }));

    await waitFor(() =>
      expect(api.changeState).toHaveBeenCalledWith("pi-1", {
        cancelActivityIds: ["approveTask"],
        startActivityIds: ["reviewTask"],
      }),
    );
  });
});
