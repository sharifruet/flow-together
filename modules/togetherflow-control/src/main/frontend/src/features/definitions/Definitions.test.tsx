import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import {
  ToastProvider,
  type CaseApi,
  type CaseDefinitionAccessApi,
  type RepositoryApi,
  type SystemApi,
} from "@togetherflow/common";
import { Definitions } from "./Definitions";

const PROCESSES = [
  { id: "p1", key: "invoiceApproval", name: "Invoice approval", version: 3, suspended: false },
  { id: "p2", key: "onboarding", name: "Onboarding", version: 1, suspended: true },
];

const CASES = [{ id: "c1", key: "customerOnboarding", name: "Customer onboarding", version: 2 }];

function stubs(overrides: Record<string, Record<string, unknown>> = {}) {
  const repositoryApi = {
    listProcessDefinitions: vi
      .fn()
      .mockResolvedValue({ data: PROCESSES, total: 2, start: 0, size: 200 }),
    setDefinitionSuspended: vi.fn().mockResolvedValue(undefined),
    listStarters: vi.fn().mockResolvedValue([{ user: "alice", type: "candidate" }]),
    addStarter: vi.fn().mockResolvedValue({}),
    removeStarter: vi.fn().mockResolvedValue(undefined),
    ...overrides.repository,
  } as unknown as RepositoryApi & {
    listProcessDefinitions: Mock;
    setDefinitionSuspended: Mock;
    listStarters: Mock;
    addStarter: Mock;
    removeStarter: Mock;
  };

  const caseApi = {
    listDefinitions: vi.fn().mockResolvedValue({ data: CASES, total: 1, start: 0, size: 200 }),
    ...overrides.cases,
  } as unknown as CaseApi & { listDefinitions: Mock };

  const caseAccessApi = {
    listStarters: vi.fn().mockResolvedValue([]),
    addStarter: vi.fn().mockResolvedValue({}),
    removeStarter: vi.fn().mockResolvedValue(undefined),
    ...overrides.caseAccess,
  } as unknown as CaseDefinitionAccessApi & {
    listStarters: Mock;
    addStarter: Mock;
    removeStarter: Mock;
  };

  const systemApi = {
    broadcastSignal: vi.fn().mockResolvedValue(undefined),
    ...overrides.system,
  } as unknown as SystemApi & { broadcastSignal: Mock };

  return { repositoryApi, caseApi, caseAccessApi, systemApi };
}

function renderScreen(api: ReturnType<typeof stubs>) {
  render(
    <ToastProvider>
      <Definitions
        repositoryApi={api.repositoryApi}
        caseApi={api.caseApi}
        caseAccessApi={api.caseAccessApi}
        systemApi={api.systemApi}
      />
    </ToastProvider>,
  );
}

describe("Definitions — processes", () => {
  /**
   * `ProcessApi.listDefinitions` defaults `suspended: false` for Work. An admin screen
   * that inherited that would hide the definitions it exists to reactivate.
   */
  it("lists suspended definitions too", async () => {
    const api = stubs();
    renderScreen(api);

    await screen.findByText("Invoice approval");
    expect(api.repositoryApi.listProcessDefinitions).toHaveBeenCalled();
    const query = api.repositoryApi.listProcessDefinitions.mock.calls[0][0];
    expect(query.suspended).toBeUndefined();
    expect(screen.getByText("Suspended")).toBeInTheDocument();
  });

  it("confirms before suspending, and says what happens to running instances", async () => {
    const user = userEvent.setup();
    const api = stubs();
    renderScreen(api);

    const row = (await screen.findByText("Invoice approval")).closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Suspend" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Invoice approval");
    expect(dialog).toHaveTextContent(/Instances already running keep going/i);
    expect(api.repositoryApi.setDefinitionSuspended).not.toHaveBeenCalled();
  });

  it("passes the cascade choice through", async () => {
    const user = userEvent.setup();
    const api = stubs();
    renderScreen(api);

    const row = (await screen.findByText("Invoice approval")).closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Suspend" }));

    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("checkbox"));
    expect(dialog).toHaveTextContent(/Running instances stop progressing/i);
    await user.click(within(dialog).getByRole("button", { name: "Suspend" }));

    await waitFor(() =>
      expect(api.repositoryApi.setDefinitionSuspended).toHaveBeenCalledWith("p1", true, true),
    );
  });

  it("activates without a confirmation, since it only restores service", async () => {
    const user = userEvent.setup();
    const api = stubs();
    renderScreen(api);

    const row = (await screen.findByText("Onboarding")).closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Activate" }));

    await waitFor(() =>
      expect(api.repositoryApi.setDefinitionSuspended).toHaveBeenCalledWith("p2", false, false),
    );
  });

  it("reports a rejected change", async () => {
    const user = userEvent.setup();
    const api = stubs({ repository: { setDefinitionSuspended: vi.fn().mockRejectedValue(new Error("x")) } });
    renderScreen(api);

    const row = (await screen.findByText("Onboarding")).closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Activate" }));

    expect(await screen.findByText(/Could not change that definition/i)).toBeInTheDocument();
  });
});

describe("Definitions — authorized starters", () => {
  it("explains that an empty list means unrestricted", async () => {
    const user = userEvent.setup();
    const api = stubs({ repository: { listStarters: vi.fn().mockResolvedValue([]) } });
    renderScreen(api);

    const row = (await screen.findByText("Invoice approval")).closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Who can start" }));

    expect(await screen.findByText(/Unrestricted/i)).toBeInTheDocument();
  });

  it("grants and revokes", async () => {
    const user = userEvent.setup();
    const api = stubs();
    renderScreen(api);

    const row = (await screen.findByText("Invoice approval")).closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Who can start" }));

    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("User id"), "bob");
    await user.click(within(dialog).getByRole("button", { name: "Grant" }));
    await waitFor(() =>
      expect(api.repositoryApi.addStarter).toHaveBeenCalledWith("p1", { user: "bob" }),
    );

    await user.click(within(dialog).getByRole("button", { name: "Revoke" }));
    await waitFor(() =>
      expect(api.repositoryApi.removeStarter).toHaveBeenCalledWith("p1", "users", "alice"),
    );
  });

  it("grants to a group when that is chosen", async () => {
    const user = userEvent.setup();
    const api = stubs();
    renderScreen(api);

    const row = (await screen.findByText("Invoice approval")).closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Who can start" }));

    const dialog = await screen.findByRole("dialog");
    await user.selectOptions(within(dialog).getByLabelText("Grant to"), "group");
    await user.type(within(dialog).getByLabelText("Group id"), "managers");
    await user.click(within(dialog).getByRole("button", { name: "Grant" }));

    await waitFor(() =>
      expect(api.repositoryApi.addStarter).toHaveBeenCalledWith("p1", { group: "managers" }),
    );
  });
});

describe("Definitions — cases", () => {
  /**
   * §7.2: this repo's CMMN REST layer exposes suspend/activate only for process
   * definitions, so the UI must not offer a control that always fails.
   */
  it("offers no suspend control, and says why", async () => {
    const user = userEvent.setup();
    renderScreen(stubs());

    await user.click(screen.getByRole("tab", { name: "Cases" }));

    expect(await screen.findByText("Customer onboarding")).toBeInTheDocument();
    expect(screen.getByText(/cannot be suspended/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Suspend" })).not.toBeInTheDocument();
  });

  it("still manages who may start a case", async () => {
    const user = userEvent.setup();
    const api = stubs();
    renderScreen(api);

    await user.click(screen.getByRole("tab", { name: "Cases" }));
    const row = (await screen.findByText("Customer onboarding")).closest("tr")!;
    await user.click(within(row).getByRole("button", { name: "Who can start" }));

    await waitFor(() => expect(api.caseAccessApi.listStarters).toHaveBeenCalledWith("c1", expect.anything()));
  });
});

describe("Definitions — signals", () => {
  it("warns about the blast radius and confirms first", async () => {
    const user = userEvent.setup();
    const api = stubs();
    renderScreen(api);

    await user.click(screen.getByRole("tab", { name: "Signals" }));
    await user.type(screen.getByLabelText(/Signal name/), "orderCancelled");
    await user.click(screen.getByRole("button", { name: "Broadcast signal" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(/Every instance in the engine/i);
    expect(api.systemApi.broadcastSignal).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Broadcast" }));
    await waitFor(() =>
      expect(api.systemApi.broadcastSignal).toHaveBeenCalledWith("orderCancelled", { async: false }),
    );
  });

  it("cannot broadcast an empty signal name", async () => {
    const user = userEvent.setup();
    renderScreen(stubs());

    await user.click(screen.getByRole("tab", { name: "Signals" }));
    expect(screen.getByRole("button", { name: "Broadcast signal" })).toBeDisabled();
  });

  it("passes the asynchronous choice through", async () => {
    const user = userEvent.setup();
    const api = stubs();
    renderScreen(api);

    await user.click(screen.getByRole("tab", { name: "Signals" }));
    await user.type(screen.getByLabelText(/Signal name/), "s1");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Broadcast signal" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Broadcast" }));

    await waitFor(() =>
      expect(api.systemApi.broadcastSignal).toHaveBeenCalledWith("s1", { async: true }),
    );
  });
});
