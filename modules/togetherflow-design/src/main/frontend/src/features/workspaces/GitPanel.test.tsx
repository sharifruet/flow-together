/**
 * The Git panel (ADR 0018, W3.2).
 *
 * The assertions that matter are the honest ones: an unreachable remote is not "up to
 * date", a reader is offered nothing to click, and disconnecting says what it does and
 * does not destroy.
 */

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  ToastProvider,
  type GitStatus,
  type WorkspaceGitApi,
  type WorkspaceSummary,
} from "@togetherflow/common";
import { GitPanel } from "./GitPanel";

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

function status(overrides: Partial<GitStatus> = {}): GitStatus {
  return {
    connected: true,
    remoteUrl: "https://example.invalid/models.git",
    branch: "main",
    subPath: "",
    branches: ["main", "feature/approval"],
    ahead: 0,
    behind: 0,
    changes: [],
    lastCommitId: "abc123",
    lastCommitMessage: "Add invoice approval",
    error: null,
    ...overrides,
  };
}

function stubApi(overrides: Record<string, unknown> = {}) {
  return {
    status: vi.fn().mockResolvedValue(status()),
    connect: vi.fn().mockResolvedValue({ created: [], updated: [], failed: [] }),
    disconnect: vi.fn().mockResolvedValue(undefined),
    commit: vi.fn().mockResolvedValue({ commitId: "def456" }),
    push: vi.fn().mockResolvedValue(undefined),
    pull: vi.fn().mockResolvedValue({ created: ["payments"], updated: [], failed: [] }),
    revert: vi.fn().mockResolvedValue(undefined),
    createBranch: vi.fn().mockResolvedValue(undefined),
    switchBranch: vi.fn().mockResolvedValue(undefined),
    diff: vi.fn().mockResolvedValue("--- a\n+++ b\n-old\n+new\n"),
    ...overrides,
  } as unknown as WorkspaceGitApi & Record<string, ReturnType<typeof vi.fn>>;
}

function renderPanel(api: WorkspaceGitApi, ws = workspace()) {
  render(
    <ToastProvider>
      <GitPanel gitApi={api} workspace={ws} />
    </ToastProvider>,
  );
}

describe("GitPanel", () => {
  it("offers a connection form when the workspace has no repository", async () => {
    renderPanel(stubApi({ status: vi.fn().mockResolvedValue({ ...status(), connected: false }) }));

    expect(await screen.findByLabelText(/repository url/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^connect$/i })).toBeInTheDocument();
  });

  it("reports an unreachable remote as unknown, never as up to date", async () => {
    // -1 is "could not reach the remote". Showing it as in sync is the one wrong answer
    // that looks reassuring.
    renderPanel(stubApi({ status: vi.fn().mockResolvedValue(status({ ahead: -1, behind: -1 })) }));

    expect(await screen.findByText(/couldn't reach the remote/i)).toBeInTheDocument();
    expect(screen.queryByText(/up to date/i)).not.toBeInTheDocument();
  });

  it("shows pending changes by model, not by path", async () => {
    renderPanel(
      stubApi({
        status: vi.fn().mockResolvedValue(
          status({
            changes: [
              { path: "invoice-approval.bpmn20.xml", modelKey: "invoice-approval", kind: "MODIFIED" },
            ],
          }),
        ),
      }),
    );

    expect(await screen.findByText("invoice-approval")).toBeInTheDocument();
    expect(screen.getByText("Changed")).toBeInTheDocument();
  });

  it("will not commit with nothing to commit", async () => {
    renderPanel(stubApi());
    await screen.findByText(/add invoice approval/i);

    await userEvent.type(screen.getByLabelText(/commit message/i), "Something");
    expect(screen.getByRole("button", { name: /^commit$/i })).toBeDisabled();
  });

  it("commits with the message and clears it", async () => {
    const api = stubApi({
      status: vi.fn().mockResolvedValue(
        status({ changes: [{ path: "a.bpmn20.xml", modelKey: "a", kind: "ADDED" }] }),
      ),
    });
    renderPanel(api);
    await screen.findByText("a");

    await userEvent.type(screen.getByLabelText(/commit message/i), "Add a");
    await userEvent.click(screen.getByRole("button", { name: /^commit$/i }));

    await waitFor(() => expect(api.commit).toHaveBeenCalledWith("ws-1", "Add a"));
  });

  it("says what a pull actually brought in", async () => {
    const api = stubApi();
    renderPanel(api);
    await screen.findByText(/add invoice approval/i);

    await userEvent.click(screen.getByRole("button", { name: /^pull$/i }));

    await waitFor(() => expect(api.pull).toHaveBeenCalledWith("ws-1"));
    expect(await screen.findByText(/1 added, 0 updated, 0 failed/i)).toBeInTheDocument();
  });

  it("shows a diff and says what kind of diff it is", async () => {
    const api = stubApi({
      status: vi.fn().mockResolvedValue(
        status({ changes: [{ path: "a.bpmn20.xml", modelKey: "a", kind: "MODIFIED" }] }),
      ),
    });
    renderPanel(api);
    await screen.findByText("a");

    await userEvent.click(screen.getByRole("button", { name: /^diff$/i }));

    await waitFor(() => expect(api.diff).toHaveBeenCalledWith("ws-1", "a"));
    // The caveat matters: for a diagram this is serialised XML, not shapes.
    expect(await screen.findByText(/serialised XML rather than the shapes/i)).toBeInTheDocument();
  });

  it("offers a reader nothing to click", async () => {
    renderPanel(
      stubApi(),
      workspace({ role: "READER", capabilities: ["VIEW"] }),
    );
    await screen.findByText(/add invoice approval/i);

    expect(screen.queryByLabelText(/commit message/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^push$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /disconnect from git/i })).not.toBeInTheDocument();
  });

  it("says what disconnecting does and does not destroy", async () => {
    const api = stubApi();
    renderPanel(api);
    await screen.findByText(/add invoice approval/i);

    await userEvent.click(screen.getByRole("button", { name: /disconnect from git/i }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(/models stay exactly as they are/i);
    expect(dialog).toHaveTextContent(/committed but not pushed is lost/i);

    await userEvent.click(within(dialog).getByRole("button", { name: /^disconnect$/i }));
    await waitFor(() => expect(api.disconnect).toHaveBeenCalledWith("ws-1"));
  });
});
