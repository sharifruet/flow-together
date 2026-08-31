/**
 * The workspace context (ADR 0017).
 *
 * What matters here is that the three states stay distinguishable — not deployed,
 * deployed-and-empty, and unreachable — because collapsing them is how a broken
 * deployment comes to look like a deliberately simpler one.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceApi, WorkspaceSummary } from "../api/workspaces";
import { WorkspaceProvider, useWorkspace } from "./WorkspaceContext";

function workspace(overrides: Partial<WorkspaceSummary> = {}): WorkspaceSummary {
  return {
    id: "ws-1",
    key: "eng",
    name: "Engineering",
    description: "",
    visibility: "PRIVATE",
    sharedWorkspaceId: "",
    role: "MODELER",
    capabilities: ["VIEW", "EDIT", "DELETE", "PUBLISH"],
    ...overrides,
  };
}

function stubApi(workspaces: WorkspaceSummary[] | Error): WorkspaceApi {
  return {
    list: vi.fn().mockImplementation(() =>
      workspaces instanceof Error ? Promise.reject(workspaces) : Promise.resolve(workspaces),
    ),
  } as unknown as WorkspaceApi;
}

function Probe() {
  const { status, active, can, workspaces, setWorkspaceId } = useWorkspace();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="active">{active?.name ?? "none"}</span>
      <span data-testid="delete">{String(can("DELETE"))}</span>
      <span data-testid="members">{String(can("MANAGE_MEMBERS"))}</span>
      {workspaces.map((w) => (
        <button key={w.id} onClick={() => setWorkspaceId(w.id)}>
          {w.name}
        </button>
      ))}
    </div>
  );
}

afterEach(() => window.localStorage.clear());

describe("when the module is not deployed", () => {
  it("reports disabled and permits everything, rather than hiding the app", async () => {
    // Answering `false` here would blank out every action in Design the moment the
    // service is simply not configured — a deployment without workspaces has no
    // workspace rules to fail.
    render(
      <WorkspaceProvider>
        <Probe />
      </WorkspaceProvider>,
    );
    expect(screen.getByTestId("status")).toHaveTextContent("disabled");
    expect(screen.getByTestId("delete")).toHaveTextContent("true");
  });
});

describe("when the module is deployed", () => {
  it("selects the first workspace and reports its capabilities", async () => {
    render(
      <WorkspaceProvider api={stubApi([workspace()])}>
        <Probe />
      </WorkspaceProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("ready"));
    expect(screen.getByTestId("active")).toHaveTextContent("Engineering");
    // Capabilities come from the service, so a modeler cannot manage members.
    expect(screen.getByTestId("delete")).toHaveTextContent("true");
    expect(screen.getByTestId("members")).toHaveTextContent("false");
  });

  it("remembers the chosen workspace across mounts", async () => {
    const two = [workspace(), workspace({ id: "ws-2", name: "Finance" })];
    const { unmount } = render(
      <WorkspaceProvider api={stubApi(two)}>
        <Probe />
      </WorkspaceProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("ready"));
    await userEvent.click(screen.getByRole("button", { name: "Finance" }));
    unmount();

    render(
      <WorkspaceProvider api={stubApi(two)}>
        <Probe />
      </WorkspaceProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("active")).toHaveTextContent("Finance"));
  });

  it("falls back when the remembered workspace is no longer visible", async () => {
    // Access can be revoked between sessions. Keeping the stale id would filter the
    // library to nothing and read as an empty repository.
    window.localStorage.setItem("togetherflow.workspace", "ws-gone");

    render(
      <WorkspaceProvider api={stubApi([workspace()])}>
        <Probe />
      </WorkspaceProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("active")).toHaveTextContent("Engineering"));
  });

  it("says so when the service is configured but does not answer", async () => {
    render(
      <WorkspaceProvider api={stubApi(new Error("connection refused"))}>
        <Probe />
      </WorkspaceProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("unavailable"));
    // Unreachable is not disabled: nothing is permitted by default, because the rules
    // exist and could not be read.
    expect(screen.getByTestId("delete")).toHaveTextContent("false");
  });

  it("permits nothing while the caller can see no workspace at all", async () => {
    render(
      <WorkspaceProvider api={stubApi([])}>
        <Probe />
      </WorkspaceProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("ready"));
    expect(screen.getByTestId("active")).toHaveTextContent("none");
    expect(screen.getByTestId("delete")).toHaveTextContent("false");
  });
});
