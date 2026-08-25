import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import {
  ApiError,
  ToastProvider,
  type InstanceApi,
  type ProcessInstanceResponse,
} from "@togetherflow/common";
import { Instances } from "./Instances";

function page<T>(rows: T[], total = rows.length) {
  return { data: rows, total, start: 0, size: 25 };
}

type StubApi = InstanceApi & {
  query: Mock;
  get: Mock;
  setSuspended: Mock;
  delete: Mock;
  listActivities: Mock;
  listVariables: Mock;
};

const INSTANCE: ProcessInstanceResponse = {
  id: "pi-1",
  name: "Invoice INV-2291",
  businessKey: "INV-2291",
  suspended: false,
  ended: false,
  completed: false,
  processDefinitionName: "Invoice Approval",
  startTime: "2026-08-20T09:00:00Z",
  activityId: "approveTask",
};

function stubApi(overrides: Record<string, unknown> = {}): StubApi {
  return {
    query: vi.fn().mockResolvedValue(page([INSTANCE])),
    get: vi.fn().mockResolvedValue(INSTANCE),
    listVariables: vi.fn().mockResolvedValue([{ name: "amount", type: "double", value: 4120 }]),
    listActivities: vi
      .fn()
      .mockResolvedValue(page([{ id: "a1", activityId: "approveTask", activityName: "Approve", activityType: "userTask", startTime: "2026-08-20T09:01:00Z" }])),
    setSuspended: vi.fn().mockResolvedValue(INSTANCE),
    delete: vi.fn().mockResolvedValue(undefined),
    diagramUrl: (id: string) => `/process-api/runtime/process-instances/${id}/diagram`,
    ...overrides,
  } as unknown as StubApi;
}

function renderInstances(api: InstanceApi) {
  return render(
    <ToastProvider>
      <Instances instanceApi={api} />
    </ToastProvider>,
  );
}

async function openDetail() {
  await userEvent.click(await screen.findByText("Invoice INV-2291"));
  await screen.findByRole("heading", { name: "Invoice INV-2291" });
}

describe("Instances", () => {
  it("lists running instances", async () => {
    renderInstances(stubApi());
    expect(await screen.findByText("Invoice INV-2291")).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
  });

  it("marks suspended instances distinctly", async () => {
    renderInstances(stubApi({ query: vi.fn().mockResolvedValue(page([{ ...INSTANCE, suspended: true }])) }));
    expect(await screen.findByText("Suspended")).toBeInTheDocument();
  });

  it("filters to suspended only", async () => {
    const api = stubApi();
    renderInstances(api);
    await screen.findByText("Invoice INV-2291");

    await userEvent.click(screen.getByRole("checkbox", { name: /suspended only/i }));

    await waitFor(() => expect(api.query.mock.calls.at(-1)?.[0]).toMatchObject({ suspended: true }));
  });

  it("shows an empty state when nothing is running", async () => {
    renderInstances(stubApi({ query: vi.fn().mockResolvedValue(page([])) }));
    expect(await screen.findByText(/no running instances/i)).toBeInTheDocument();
  });

  it("opens a detail view with activities, variables and the diagram", async () => {
    renderInstances(stubApi());
    await openDetail();

    expect(screen.getByText("Approve")).toBeInTheDocument();
    expect(screen.getByText("amount")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /process diagram/i })).toHaveAttribute(
      "src",
      "/process-api/runtime/process-instances/pi-1/diagram",
    );
  });

  it("explains a missing diagram rather than showing a broken image", async () => {
    renderInstances(stubApi());
    await openDetail();

    const image = screen.getByRole("img", { name: /process diagram/i });
    // Simulate the deployment having no graphical information.
    image.dispatchEvent(new Event("error"));

    expect(await screen.findByText(/no diagram is available/i)).toBeInTheDocument();
  });

  it("suspends a running instance", async () => {
    const api = stubApi();
    renderInstances(api);
    await openDetail();

    await userEvent.click(screen.getByRole("button", { name: /suspend/i }));

    await waitFor(() => expect(api.setSuspended).toHaveBeenCalledWith("pi-1", true));
  });

  it("confirms before deleting, warning that work in progress is lost", async () => {
    const api = stubApi();
    renderInstances(api);
    await openDetail();

    await userEvent.click(screen.getByRole("button", { name: /^delete$/i }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(/work in progress is lost/i);
    expect(api.delete).not.toHaveBeenCalled();

    await userEvent.click(within(dialog).getByRole("button", { name: /delete instance/i }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("pi-1", expect.any(String)));
  });

  it("surfaces a failed action with its reference id", async () => {
    const api = stubApi({
      setSuspended: vi.fn().mockRejectedValue(new ApiError("Locked", 409, "corr-i", {})),
    });
    renderInstances(api);
    await openDetail();

    await userEvent.click(screen.getByRole("button", { name: /suspend/i }));

    expect(await screen.findByText("Locked")).toBeInTheDocument();
    expect(screen.getByText("corr-i")).toBeInTheDocument();
  });

  it("keeps working when activities or variables cannot be loaded", async () => {
    renderInstances(
      stubApi({
        listActivities: vi.fn().mockRejectedValue(new Error("boom")),
        listVariables: vi.fn().mockRejectedValue(new Error("boom")),
      }),
    );
    await openDetail();

    expect(screen.getByText(/no activity instances recorded/i)).toBeInTheDocument();
    expect(screen.getByText(/no variables set/i)).toBeInTheDocument();
  });
});
