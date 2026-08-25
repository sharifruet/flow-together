import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import {
  ToastProvider,
  type CaseApi,
  type CaseInstanceResponse,
  type PlanItemInstanceResponse,
} from "@togetherflow/common";
import { CaseDetail, buildTree } from "./CaseDetail";

const OPEN_CASE: CaseInstanceResponse = {
  id: "c1",
  name: "Customer onboarding",
  businessKey: "CUST-1001",
  startTime: "2026-08-20T09:00:00.000Z",
  startUserId: "rest-admin",
  state: "active",
};

const PLAN_ITEMS: PlanItemInstanceResponse[] = [
  {
    id: "p1",
    name: "Collect documents",
    state: "active",
    planItemDefinitionType: "humantask",
    stageInstanceId: null,
  },
  { id: "p2", name: "Review", state: "active", planItemDefinitionType: "stage", stage: true },
  {
    id: "p3",
    name: "Verify identity",
    state: "active",
    planItemDefinitionType: "humantask",
    stageInstanceId: "p2",
  },
  {
    id: "p4",
    name: "Send welcome pack",
    state: "available",
    planItemDefinitionType: "humantask",
  },
  { id: "p5", name: "Extra step", state: "enabled", planItemDefinitionType: "processtask" },
];

type StubCaseApi = CaseApi & {
  listPlanItems: Mock;
  stageOverview: Mock;
  listVariables: Mock;
  listHistoricVariables: Mock;
  performPlanItemAction: Mock;
  terminate: Mock;
};

function stubApi(overrides: Record<string, unknown> = {}): StubCaseApi {
  return {
    listPlanItems: vi.fn().mockResolvedValue({ data: PLAN_ITEMS, total: PLAN_ITEMS.length }),
    stageOverview: vi.fn().mockResolvedValue([
      { id: "reviewStage", name: "Review", current: true, ended: false },
      { id: "onboarded", name: "Onboarded", current: false, ended: false },
    ]),
    listVariables: vi.fn().mockResolvedValue([
      { name: "customer", type: "string", value: "Northwind Ltd" },
    ]),
    listHistoricVariables: vi.fn().mockResolvedValue([]),
    performPlanItemAction: vi.fn().mockResolvedValue(undefined),
    terminate: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as StubCaseApi;
}

// Note: a default parameter would be re-applied when a test passes `undefined`
// explicitly, which is exactly the "nothing selected" case being tested.
function renderDetail(api: CaseApi, ...rest: [CaseInstanceResponse | undefined] | []) {
  const instance = rest.length === 0 ? OPEN_CASE : rest[0];
  const onClose = vi.fn();
  const onChanged = vi.fn();
  render(
    <ToastProvider>
      <CaseDetail caseApi={api} instance={instance} onClose={onClose} onChanged={onChanged} />
    </ToastProvider>,
  );
  return { onClose, onChanged };
}

describe("buildTree", () => {
  it("nests a plan item under the stage that contains it", () => {
    const roots = buildTree(PLAN_ITEMS);
    const review = roots.find((n) => n.item.id === "p2");
    expect(review?.children.map((c) => c.item.id)).toEqual(["p3"]);
    // The nested item is not also a root.
    expect(roots.map((n) => n.item.id)).not.toContain("p3");
  });

  it("keeps an item whose stage is not in the list, rather than dropping it", () => {
    const orphan: PlanItemInstanceResponse[] = [
      { id: "x", name: "Orphan", stageInstanceId: "missing-stage" },
    ];
    expect(buildTree(orphan).map((n) => n.item.id)).toEqual(["x"]);
  });

  it("handles an empty list", () => {
    expect(buildTree([])).toEqual([]);
  });
});

describe("CaseDetail", () => {
  it("prompts to pick a case when none is selected", () => {
    renderDetail(stubApi(), undefined);
    expect(screen.getByText("No case selected")).toBeInTheDocument();
  });

  it("shows the case's progress and data", async () => {
    renderDetail(stubApi());

    // "Review" is both a stage in the progress track and a plan item, so scope the
    // assertion to the progress list.
    await screen.findByText("In progress");
    const progress = document.querySelector(".tf-stages")!;
    expect(within(progress as HTMLElement).getByText("Review")).toBeInTheDocument();
    expect(screen.getAllByText("Not yet reached").length).toBeGreaterThan(0);
    expect(await screen.findByText("Northwind Ltd")).toBeInTheDocument();
  });

  it("renders plan items nested under their stage", async () => {
    renderDetail(stubApi());
    await screen.findByText("Verify identity");

    // The nested item lives inside the stage's own list, not at the top level.
    const nested = document.querySelectorAll(".tf-planitems .tf-planitems");
    expect(nested.length).toBe(1);
    expect(nested[0].textContent).toContain("Verify identity");
  });

  /**
   * The engine accepts `trigger` on an active human task and completes it, skipping the
   * form. Work must not offer that; it points at the task instead.
   */
  it("never offers to trigger a human task, and says where to go instead", async () => {
    renderDetail(stubApi());
    const row = (await screen.findByText("Collect documents")).closest(".tf-planitems__row")!;

    expect(within(row as HTMLElement).queryByRole("button")).not.toBeInTheDocument();
    expect(within(row as HTMLElement).getByText("Open it from Tasks")).toBeInTheDocument();
  });

  it("offers no action on an item still blocked by its sentry", async () => {
    renderDetail(stubApi());
    const row = (await screen.findByText("Send welcome pack")).closest(".tf-planitems__row")!;
    expect(within(row as HTMLElement).queryByRole("button")).not.toBeInTheDocument();
  });

  it("performs an action the engine does accept", async () => {
    const user = userEvent.setup();
    const api = stubApi();
    const { onChanged } = renderDetail(api);

    const row = (await screen.findByText("Extra step")).closest(".tf-planitems__row")!;
    await user.click(within(row as HTMLElement).getByRole("button", { name: "Start" }));

    await waitFor(() => expect(api.performPlanItemAction).toHaveBeenCalledWith("p5", "start"));
    expect(onChanged).toHaveBeenCalled();
  });

  it("reports a rejected action instead of pretending it worked", async () => {
    const user = userEvent.setup();
    const api = stubApi({
      performPlanItemAction: vi.fn().mockRejectedValue(new Error("nope")),
    });
    renderDetail(api);

    const row = (await screen.findByText("Extra step")).closest(".tf-planitems__row")!;
    await user.click(within(row as HTMLElement).getByRole("button", { name: "Start" }));

    expect(await screen.findByText(/Could not start this plan item/i)).toBeInTheDocument();
  });

  it("confirms before terminating, naming the case", async () => {
    const user = userEvent.setup();
    const api = stubApi();
    renderDetail(api);

    await user.click(await screen.findByRole("button", { name: "Terminate case" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Customer onboarding");
    expect(api.terminate).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Terminate case" }));
    await waitFor(() => expect(api.terminate).toHaveBeenCalledWith("c1"));
  });

  /**
   * A finished case has no runtime rows left, so querying them would 404 or return
   * nothing useful. Its data still exists in history.
   */
  it("reads a finished case from history and skips the runtime calls", async () => {
    const api = stubApi();
    renderDetail(api, { ...OPEN_CASE, endTime: "2026-08-22T10:00:00.000Z", state: "completed" });

    await waitFor(() => expect(api.listHistoricVariables).toHaveBeenCalledWith("c1", expect.anything()));
    expect(api.listVariables).not.toHaveBeenCalled();
    expect(api.listPlanItems).not.toHaveBeenCalled();
    expect(screen.getByText(/only tracked while a case is running/i)).toBeInTheDocument();
  });

  it("hides Terminate on a case that has already ended", () => {
    renderDetail(stubApi(), { ...OPEN_CASE, endTime: "2026-08-22T10:00:00.000Z" });
    expect(screen.queryByRole("button", { name: "Terminate case" })).not.toBeInTheDocument();
  });
});
