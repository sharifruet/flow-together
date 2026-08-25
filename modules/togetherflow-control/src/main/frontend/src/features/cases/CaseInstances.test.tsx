import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import {
  ToastProvider,
  type CaseApi,
  type PlanItemInstanceResponse,
} from "@togetherflow/common";
import { CaseInstances } from "./CaseInstances";

const CASES = [
  {
    id: "c1",
    name: "Customer onboarding",
    businessKey: "CUST-1001",
    startTime: "2026-08-20T09:00:00.000Z",
    startUserId: "rest-admin",
    state: "active",
  },
];

const PLAN_ITEMS: PlanItemInstanceResponse[] = [
  { id: "p1", name: "Collect documents", state: "active", planItemDefinitionType: "humantask" },
  { id: "p2", name: "Send welcome pack", state: "available", planItemDefinitionType: "humantask" },
];

function stubApi(overrides: Record<string, unknown> = {}) {
  return {
    query: vi.fn().mockResolvedValue({ data: CASES, total: 1, start: 0, size: 25 }),
    listPlanItems: vi.fn().mockResolvedValue({ data: PLAN_ITEMS, total: 2 }),
    stageOverview: vi
      .fn()
      .mockResolvedValue([{ id: "s1", name: "Review", current: true, ended: false }]),
    listVariables: vi.fn().mockResolvedValue([{ name: "customer", type: "string", value: "N Ltd" }]),
    performPlanItemAction: vi.fn().mockResolvedValue(undefined),
    terminate: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as CaseApi & Record<string, Mock>;
}

function renderScreen(api: CaseApi) {
  render(
    <ToastProvider>
      <CaseInstances caseApi={api} />
    </ToastProvider>,
  );
}

async function openInspector(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText("Customer onboarding");
  await user.click(screen.getByRole("button", { name: "Inspect" }));
  return screen.findByRole("dialog");
}

describe("CaseInstances", () => {
  it("lists running cases", async () => {
    renderScreen(stubApi());
    expect(await screen.findByText("Customer onboarding")).toBeInTheDocument();
    expect(screen.getByText(/CUST-1001/)).toBeInTheDocument();
  });

  it("guides when nothing is running", async () => {
    renderScreen(stubApi({ query: vi.fn().mockResolvedValue({ data: [], total: 0, start: 0, size: 25 }) }));
    expect(await screen.findByText("No running cases")).toBeInTheDocument();
  });

  it("shows progress, plan items and variables in the inspector", async () => {
    const user = userEvent.setup();
    renderScreen(stubApi());
    const dialog = await openInspector(user);

    expect(await within(dialog).findByText("Review")).toBeInTheDocument();
    expect(await within(dialog).findByText("Collect documents")).toBeInTheDocument();
    expect(await within(dialog).findByText("N Ltd")).toBeInTheDocument();
  });

  /**
   * The counterpart to Work's rule. Control exists to unblock instances, so it does
   * offer forcing a human task — but labels it "Force complete" and spells out in the
   * confirmation that the form is bypassed.
   */
  it("offers to force a human task, and warns what that skips", async () => {
    const user = userEvent.setup();
    const api = stubApi();
    renderScreen(api);
    const dialog = await openInspector(user);

    const row = (await within(dialog).findByText("Collect documents")).closest(
      ".tf-planitems__row",
    )!;
    await user.click(within(row as HTMLElement).getByRole("button", { name: "Force complete" }));

    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent(/without anyone filling in its form/i);
    expect(api.performPlanItemAction).not.toHaveBeenCalled();

    await user.click(within(confirm).getByRole("button", { name: "Force complete" }));
    await waitFor(() => expect(api.performPlanItemAction).toHaveBeenCalledWith("p1", "trigger"));
  });

  it("still offers nothing on an item blocked by its sentry", async () => {
    const user = userEvent.setup();
    renderScreen(stubApi());
    const dialog = await openInspector(user);

    const row = (await within(dialog).findByText("Send welcome pack")).closest(
      ".tf-planitems__row",
    )!;
    expect(within(row as HTMLElement).queryByRole("button")).not.toBeInTheDocument();
  });

  it("distinguishes terminate from delete in what it warns about", async () => {
    const user = userEvent.setup();
    const api = stubApi();
    renderScreen(api);
    const dialog = await openInspector(user);

    await user.click(within(dialog).getByRole("button", { name: "Terminate" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent(/history is kept/i);
    await user.click(within(confirm).getByRole("button", { name: "Terminate case" }));
    await waitFor(() => expect(api.terminate).toHaveBeenCalledWith("c1"));
  });

  it("warns that delete is permanent", async () => {
    const user = userEvent.setup();
    const api = stubApi();
    renderScreen(api);
    const dialog = await openInspector(user);

    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    const confirm = await screen.findByRole("alertdialog");
    expect(confirm).toHaveTextContent(/history included/i);
    expect(confirm).toHaveTextContent(/cannot be undone/i);

    await user.click(within(confirm).getByRole("button", { name: "Delete case" }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("c1"));
  });

  it("reports a rejected action", async () => {
    const user = userEvent.setup();
    const api = stubApi({
      performPlanItemAction: vi.fn().mockRejectedValue(new Error("no")),
    });
    renderScreen(api);
    const dialog = await openInspector(user);

    const row = (await within(dialog).findByText("Collect documents")).closest(
      ".tf-planitems__row",
    )!;
    await user.click(within(row as HTMLElement).getByRole("button", { name: "Force complete" }));
    const confirm = await screen.findByRole("alertdialog");
    await user.click(within(confirm).getByRole("button", { name: "Force complete" }));

    expect(await screen.findByText("That action was rejected.")).toBeInTheDocument();
  });
});
