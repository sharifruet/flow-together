import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider, type CaseApi, type HistoryApi, type TaskApi } from "@togetherflow/common";
import { MyHistory } from "./MyHistory";

function page<T>(rows: T[]) {
  return { data: rows, total: rows.length, start: 0, size: 25 };
}

const HISTORY = {
  queryTasks: vi.fn().mockResolvedValue(
    page([
      { id: "t-1", name: "ASE - raise and approve the sales clearance", formKey: "salesClearanceForm", endTime: "2026-09-16T11:13:08Z", durationInMillis: 4000 },
      { id: "t-2", name: "A task without a form", endTime: "2026-09-16T11:00:00Z", durationInMillis: 1000 },
    ]),
  ),
  queryProcessInstances: vi.fn().mockResolvedValue(page([])),
} as unknown as HistoryApi;

const CASES = { query: vi.fn().mockResolvedValue(page([])) } as unknown as CaseApi;

const TASKS = {
  getHistoricForm: vi.fn().mockResolvedValue({
    id: "def-1",
    key: "salesClearanceForm",
    name: "Sales clearance",
    submittedBy: "imran.kabir",
    submittedDate: "2026-09-16T11:13:08Z",
    selectedOutcome: "approve",
    fields: [
      { id: "outstandingCollection", name: "Outstanding collection", type: "amount", value: 1250.5 },
      { id: "decision", name: "Decision", type: "radio-buttons", fieldType: "OptionFormField", options: [{ name: "approve" }, { name: "return" }], value: "approve" },
    ],
  }),
} as unknown as TaskApi;

describe("MyHistory — recorded submissions (FR-H.3)", () => {
  it("opens a completed task's form read-only, with who submitted it and the outcome", async () => {
    render(
      <ToastProvider>
        <MyHistory historyApi={HISTORY} caseApi={CASES} taskApi={TASKS} userId="imran.kabir" />
      </ToastProvider>,
    );
    const rows = await screen.findAllByRole("row");
    // Only the task that declares a form offers the viewer.
    expect(screen.getAllByRole("button", { name: /view form/i })).toHaveLength(1);
    expect(rows.length).toBeGreaterThan(2);

    await userEvent.click(screen.getByRole("button", { name: /view form/i }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/submitted by imran\.kabir/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/outcome: approve/i)).toBeInTheDocument();
    // Values are painted, not editable.
    expect(within(dialog).getByText("1250.5")).toBeInTheDocument();
    expect(within(dialog).queryByRole("textbox")).not.toBeInTheDocument();
    expect(TASKS.getHistoricForm).toHaveBeenCalledWith("t-1", expect.anything(), expect.objectContaining({ id: "t-1" }));
  });
});
