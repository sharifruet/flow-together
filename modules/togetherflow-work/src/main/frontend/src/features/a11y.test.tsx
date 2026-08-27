/**
 * Accessibility regression checks for Work's own screens (REQUIREMENTS.md §13.6).
 *
 * §8 singles Work out — "WCAG 2.1 AA as a baseline for the Work app in particular, since
 * it's used by non-technical business users all day" — so its screens are checked in
 * their populated state, not only when empty. An accessible empty state on top of an
 * inaccessible table is still an inaccessible app.
 */

import { render, screen } from "@testing-library/react";
import { describe, it, vi } from "vitest";
import { expectNoA11yViolations } from "@togetherflow/common/testing/a11y";
import {
  RouterProvider,
  ToastProvider,
  type CaseApi,
  type DataResponse,
  type HistoryApi,
  type ProcessApi,
  type TaskApi,
  type TaskResponse,
} from "@togetherflow/common";
import { TaskInbox } from "./tasks/TaskInbox";
import { StartWork } from "./start/StartWork";
import { MyHistory } from "./history/MyHistory";

function page<T>(rows: T[]): DataResponse<T> {
  return { data: rows, total: rows.length, start: 0, size: 25 };
}

const TASKS: TaskResponse[] = [
  { id: "task-1", name: "Approve invoice", priority: 80, suspended: false, dueDate: "2026-09-01T09:00:00Z" },
  { id: "task-2", name: "Review contract", priority: 20, suspended: false, assignee: "alice" },
];

describe("Work screens meet WCAG 2.1 AA", () => {
  it("the task inbox, populated", async () => {
    const taskApi = { query: vi.fn().mockResolvedValue(page(TASKS)) } as unknown as TaskApi;
    const processApi = {
      listDefinitions: vi
        .fn()
        .mockResolvedValue(page([{ id: "p:1", key: "invoice", name: "Invoice", version: 1 }])),
    } as unknown as ProcessApi;

    const { container } = render(
      <RouterProvider>
        <TaskInbox
        taskApi={taskApi}
        processApi={processApi}
        userId="alice"
        onSelectTask={vi.fn()}
        refreshToken={0}
          onStartWork={vi.fn()}
        />
      </RouterProvider>,
    );
    await screen.findByText("Approve invoice");
    await expectNoA11yViolations(container);
  });

  it("the task inbox, empty", async () => {
    const taskApi = { query: vi.fn().mockResolvedValue(page([])) } as unknown as TaskApi;
    const { container } = render(
      <RouterProvider>
        <TaskInbox
        taskApi={taskApi}
        userId="alice"
        onSelectTask={vi.fn()}
        refreshToken={0}
          onStartWork={vi.fn()}
        />
      </RouterProvider>,
    );
    await screen.findByText(/no tasks assigned to you/i);
    await expectNoA11yViolations(container);
  });

  it("start work", async () => {
    const processApi = {
      listDefinitions: vi
        .fn()
        .mockResolvedValue(page([{ id: "p:1", key: "invoice", name: "Invoice", version: 1 }])),
    } as unknown as ProcessApi;
    const caseApi = { listDefinitions: vi.fn().mockResolvedValue(page([])) } as unknown as CaseApi;

    const { container } = render(
      // StartWork raises a toast on success, so it needs the provider its app supplies.
      <ToastProvider>
        <StartWork processApi={processApi} caseApi={caseApi} onStarted={vi.fn()} />
      </ToastProvider>,
    );
    await screen.findByText("Invoice");
    await expectNoA11yViolations(container);
  });

  it("my history", async () => {
    const historyApi = {
      queryTasks: vi
        .fn()
        .mockResolvedValue(page([{ id: "h1", name: "Approve invoice", endTime: "2026-08-01T10:00:00Z" }])),
      queryProcessInstances: vi.fn().mockResolvedValue(page([])),
    } as unknown as HistoryApi;
    const caseApi = { queryHistoric: vi.fn().mockResolvedValue(page([])) } as unknown as CaseApi;

    const { container } = render(
      <MyHistory historyApi={historyApi} caseApi={caseApi} userId="alice" />,
    );
    await screen.findByText("Approve invoice");
    await expectNoA11yViolations(container);
  });
});
