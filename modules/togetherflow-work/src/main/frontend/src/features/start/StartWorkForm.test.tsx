import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { ApiError, ToastProvider, type CaseApi, type FormModelResponse, type ProcessApi } from "@togetherflow/common";
import { StartWork } from "./StartWork";

const START_FORM: FormModelResponse = {
  id: "def-start",
  key: "resignationSubmissionForm",
  name: "Resignation record",
  fields: [
    { id: "employeeId", name: "Employee ID", type: "text", required: true },
    { id: "lastWorkingDay", name: "Last working day", type: "date", params: { maxDate: "2026-12-31" } },
  ],
  outcomes: [
    { id: "submit", name: "Submit" },
    { id: "draft", name: "Save as draft" },
  ],
};

function page<T>(rows: T[]) {
  return { data: rows, total: rows.length, start: 0, size: 25 };
}

function stubCaseApi(overrides: Record<string, unknown> = {}) {
  return {
    listDefinitions: vi.fn().mockResolvedValue(
      page([{ id: "case-1", key: "salesResignation", name: "Resignation (Sales)", version: 2, startFormDefined: true }]),
    ),
    getStartForm: vi.fn().mockResolvedValue(START_FORM),
    start: vi.fn().mockResolvedValue({ id: "ci-1" }),
    ...overrides,
  } as unknown as CaseApi & Record<string, Mock>;
}

const PROCESS_API = {
  listDefinitions: vi.fn().mockResolvedValue(page([])),
  getStartForm: vi.fn().mockResolvedValue(null),
  start: vi.fn(),
} as unknown as ProcessApi;

async function openCase(caseApi: CaseApi) {
  render(
    <ToastProvider>
      <StartWork processApi={PROCESS_API} caseApi={caseApi} onStarted={vi.fn()} />
    </ToastProvider>,
  );
  await userEvent.click(screen.getByRole("tab", { name: /^cases$/i }));
  await userEvent.click(await screen.findByText("Resignation (Sales)"));
  await screen.findByLabelText(/^Employee ID/);
}

describe("StartWork — starting through the form engine", () => {
  it("offers one button per outcome and sends the values as startFormVariables with that outcome", async () => {
    const caseApi = stubCaseApi();
    await openCase(caseApi);

    await userEvent.type(screen.getByLabelText(/^Employee ID/), "MPE-1");
    expect(screen.queryByRole("button", { name: /^start$/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save as draft" }));

    await waitFor(() => expect(caseApi.start).toHaveBeenCalled());
    expect(caseApi.start).toHaveBeenCalledWith({
      caseDefinitionId: "case-1",
      businessKey: undefined,
      outcome: "draft",
      startFormVariables: [
        { name: "employeeId", type: "string", value: "MPE-1" },
        { name: "lastWorkingDay", type: "date", value: null },
      ],
    });
    expect((caseApi.start as Mock).mock.calls[0][0]).not.toHaveProperty("variables");
  });

  it("puts the engine's refusal on the field it named", async () => {
    const caseApi = stubCaseApi({
      start: vi.fn().mockRejectedValue(
        new ApiError("Bad request", 400, "corr-1", {
          message: "Form validation failed",
          fields: [{ id: "lastWorkingDay", code: "maxDate", message: "engine words" }],
        }),
      ),
    });
    await openCase(caseApi);
    await userEvent.type(screen.getByLabelText(/^Employee ID/), "MPE-1");
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));

    const summary = await screen.findByRole("alert", { name: /problem/i });
    expect(within(summary).getByRole("link")).toHaveTextContent(/2026-12-31 or earlier/i);
    expect(screen.getByLabelText(/^Last working day/)).toHaveAttribute("aria-invalid", "true");
  });
});
