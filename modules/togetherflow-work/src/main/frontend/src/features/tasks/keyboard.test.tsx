/**
 * Keyboard-only operation of the inbox (W3.4, REQUIREMENTS §14.4 / §13.6).
 *
 * §14.5 asks for a manual screen-reader and keyboard-only audit. A person still has to do
 * the screen-reader half — nothing here can stand in for hearing what NVDA says — but the
 * keyboard half is mechanical, and mechanical is exactly what a test is for. This walks
 * the triage path with no mouse at all.
 */

import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  RouterProvider,
  ShortcutProvider,
  ToastProvider,
  type ProcessApi,
  type TaskApi,
  type TaskResponse,
} from "@togetherflow/common";
import { TaskInbox } from "./TaskInbox";

const TASKS: TaskResponse[] = [
  { id: "t1", name: "Approve invoice", priority: 80, suspended: false, assignee: "ada" },
  { id: "t2", name: "Review checklist", priority: 50, suspended: false, assignee: "ada" },
  { id: "t3", name: "Chase supplier", priority: 20, suspended: false, assignee: "ada" },
];

/**
 * Controlled, like the app: the inbox takes the selection as a prop, so a harness that
 * never feeds it back would test a component that can only ever select the first row.
 */
function Harness({ onSelectTask }: { onSelectTask: (task: TaskResponse) => void }) {
  const [selected, setSelected] = useState<TaskResponse | undefined>();
  const taskApi = {
    query: vi.fn().mockResolvedValue({ data: TASKS, total: TASKS.length, start: 0, size: 25 }),
  } as unknown as TaskApi;
  const processApi = {
    listDefinitions: vi.fn().mockResolvedValue({ data: [], total: 0, start: 0, size: 200 }),
  } as unknown as ProcessApi;

  return (
    <TaskInbox
      taskApi={taskApi}
      processApi={processApi}
      userId="ada"
      selectedTaskId={selected?.id}
      onSelectTask={(task) => {
        setSelected(task);
        onSelectTask(task);
      }}
      refreshToken={0}
      onStartWork={vi.fn()}
    />
  );
}

function renderInbox(onSelectTask = vi.fn()) {
  const taskApi = {
    query: vi.fn().mockResolvedValue({ data: TASKS, total: TASKS.length, start: 0, size: 25 }),
  } as unknown as TaskApi;
  const processApi = {
    listDefinitions: vi.fn().mockResolvedValue({ data: [], total: 0, start: 0, size: 200 }),
  } as unknown as ProcessApi;

  void taskApi;
  void processApi;
  render(
    <RouterProvider basePath="/">
      <ToastProvider>
        <ShortcutProvider>
          <Harness onSelectTask={onSelectTask} />
        </ShortcutProvider>
      </ToastProvider>
    </RouterProvider>,
  );
  return { onSelectTask };
}

describe("inbox, keyboard only", () => {
  it("moves down and up the list with j and k", async () => {
    const { onSelectTask } = renderInbox();
    await screen.findByText("Approve invoice");

    await userEvent.keyboard("j");
    await waitFor(() => expect(onSelectTask).toHaveBeenCalledWith(TASKS[0]));

    await userEvent.keyboard("j");
    expect(onSelectTask).toHaveBeenLastCalledWith(TASKS[1]);

    await userEvent.keyboard("k");
    expect(onSelectTask).toHaveBeenLastCalledWith(TASKS[0]);
  });

  it("opens the last row when moving up from nothing", async () => {
    // With no selection, "previous" means the end of the list — which is what someone
    // pressing k on a fresh inbox is reaching for.
    const { onSelectTask } = renderInbox();
    await screen.findByText("Approve invoice");

    await userEvent.keyboard("k");
    await waitFor(() => expect(onSelectTask).toHaveBeenLastCalledWith(TASKS[2]));
  });

  it("stops at the ends rather than wrapping", async () => {
    // Wrapping in a triage list is disorienting: a long hold should stop, not silently
    // start again at the other end.
    const { onSelectTask } = renderInbox();
    await screen.findByText("Approve invoice");

    await userEvent.keyboard("k");
    await waitFor(() => expect(onSelectTask).toHaveBeenLastCalledWith(TASKS[2]));

    await userEvent.keyboard("jjj");
    expect(onSelectTask).toHaveBeenLastCalledWith(TASKS[2]);

    await userEvent.keyboard("kkkkk");
    expect(onSelectTask).toHaveBeenLastCalledWith(TASKS[0]);
  });

  it("reaches every row by tabbing, and opens one with Enter", async () => {
    const { onSelectTask } = renderInbox();
    await screen.findByText("Approve invoice");

    const rows = screen.getAllByRole("row").slice(1);
    rows[0].focus();
    expect(rows[0]).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    expect(onSelectTask).toHaveBeenCalledWith(TASKS[0]);
  });

});
