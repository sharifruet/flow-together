/**
 * Workspace administration (ADR 0017, W3.1).
 *
 * The behaviour worth pinning is the permission gating: what a modeler is not offered,
 * and that the screen never claims a capability the service did not grant.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  ToastProvider,
  WorkspaceProvider,
  type WorkspaceApi,
  type WorkspaceSummary,
} from "@togetherflow/common";
import { Workspaces } from "./Workspaces";

function workspace(overrides: Partial<WorkspaceSummary> = {}): WorkspaceSummary {
  return {
    id: "ws-1",
    key: "eng",
    name: "Engineering",
    description: "",
    visibility: "PRIVATE",
    sharedWorkspaceId: "",
    role: "OWNER",
    capabilities: ["VIEW", "EDIT", "DELETE", "PUBLISH", "MANAGE_MEMBERS", "MANAGE_WORKSPACE"],
    ...overrides,
  };
}

function stubApi(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    list: vi.fn().mockResolvedValue([workspace()]),
    members: vi.fn().mockResolvedValue([
      { workspaceId: "ws-1", principalType: "USER", principalId: "ada", role: "OWNER" },
    ]),
    addMember: vi.fn().mockResolvedValue(undefined),
    removeMember: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue(workspace()),
    delete: vi.fn().mockResolvedValue(undefined),
    share: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as WorkspaceApi & Record<string, ReturnType<typeof vi.fn>>;
}

function renderScreen(api: WorkspaceApi) {
  return render(
    <ToastProvider>
      <WorkspaceProvider api={api}>
        <Workspaces workspaceApi={api} />
      </WorkspaceProvider>
    </ToastProvider>,
  );
}

describe("Workspaces", () => {
  it("lists the members of the active workspace with their role", async () => {
    renderScreen(stubApi());

    // Scoped to the row: "Owner" is also an option in the role picker above it.
    const row = (await screen.findByText("ada")).closest("tr")!;
    expect(within(row).getByText("Owner")).toBeInTheDocument();
  });

  it("grants a role to a user", async () => {
    const api = stubApi();
    renderScreen(api);
    await screen.findByText("ada");

    await userEvent.type(screen.getByLabelText(/user or group/i), "bob");
    await userEvent.selectOptions(screen.getByLabelText(/^Role/), "READER");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(api.addMember).toHaveBeenCalledWith("ws-1", {
        principalType: "USER",
        principalId: "bob",
        role: "READER",
      }),
    );
  });

  it("offers a modeler no way to change membership", async () => {
    // The service would refuse it anyway; offering a control that always fails is the
    // thing worth not doing.
    const api = stubApi({
      list: vi.fn().mockResolvedValue([
        workspace({ role: "MODELER", capabilities: ["VIEW", "EDIT", "DELETE", "PUBLISH"] }),
      ]),
    });
    renderScreen(api);

    await screen.findByText("ada");
    expect(screen.queryByLabelText(/user or group/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete this workspace/i })).not.toBeInTheDocument();
  });

  it("names the workspace in the delete confirmation, and says the models survive", async () => {
    const api = stubApi();
    renderScreen(api);
    await screen.findByText("ada");

    await userEvent.click(screen.getByRole("button", { name: /delete this workspace/i }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("Engineering");
    expect(dialog).toHaveTextContent(/models in it are left alone/i);

    await userEvent.click(within(dialog).getByRole("button", { name: /delete workspace/i }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("ws-1"));
  });

  it("says so when the service is configured but unreachable", async () => {
    renderScreen(stubApi({ list: vi.fn().mockRejectedValue(new Error("refused")) }));

    expect(await screen.findByText(/workspaces unavailable/i)).toBeInTheDocument();
  });
});
