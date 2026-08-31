/**
 * The workspace service's API (ADR 0017, ENTERPRISE_PARITY_PLAN.md W3.1).
 *
 * Optional: where `workspaceBase` is empty the module is not deployed, Design shows one
 * flat library, and none of this is called. An absent service and an empty workspace list
 * are different states and the UI must not conflate them — the first means "workspaces
 * aren't part of this deployment", the second means "you can't see any", and only one of
 * them is worth showing a Create button for.
 */

import type { ApiClient } from "./client";

/** Matches `Capability` in the workspace service. Kept as a union, not a string. */
export type WorkspaceCapability =
  | "VIEW"
  | "EDIT"
  | "DELETE"
  | "PUBLISH"
  | "MANAGE_MEMBERS"
  | "MANAGE_WORKSPACE";

export type WorkspaceRole = "READER" | "MODELER" | "OWNER";

export type WorkspaceVisibility = "PRIVATE" | "PUBLIC";

export interface WorkspaceSummary {
  id: string;
  key: string;
  name: string;
  description: string;
  visibility: WorkspaceVisibility;
  sharedWorkspaceId: string;
  /** The role *this* caller holds, which is why the list is per-user rather than cached. */
  role: WorkspaceRole;
  /**
   * What the role permits, sent by the service rather than derived here.
   *
   * The role table is the server's to own: deriving "can a modeler delete?" in the
   * browser means writing it twice and having it disagree the first time a role is added.
   */
  capabilities: WorkspaceCapability[];
}

export interface WorkspaceMember {
  workspaceId: string;
  principalType: "USER" | "GROUP";
  principalId: string;
  role: WorkspaceRole;
}

export class WorkspaceApi {
  constructor(private readonly client: ApiClient) {}

  list(signal?: AbortSignal): Promise<WorkspaceSummary[]> {
    return this.client.request("/workspaces", { signal });
  }

  create(request: {
    key: string;
    name?: string;
    description?: string;
    visibility?: WorkspaceVisibility;
  }): Promise<WorkspaceSummary> {
    return this.client.request("/workspaces", { method: "POST", body: request });
  }

  update(
    workspaceId: string,
    changes: { name?: string; description?: string; visibility?: WorkspaceVisibility },
  ): Promise<void> {
    return this.client.request(`/workspaces/${encodeURIComponent(workspaceId)}`, {
      method: "PUT",
      body: changes,
    });
  }

  /** Links a shared workspace, or clears it when `sharedWorkspaceId` is empty. */
  share(workspaceId: string, sharedWorkspaceId: string): Promise<void> {
    return this.client.request(`/workspaces/${encodeURIComponent(workspaceId)}/shared`, {
      method: "PUT",
      body: { sharedWorkspaceId },
    });
  }

  delete(workspaceId: string): Promise<void> {
    return this.client.request(`/workspaces/${encodeURIComponent(workspaceId)}`, {
      method: "DELETE",
    });
  }

  members(workspaceId: string, signal?: AbortSignal): Promise<WorkspaceMember[]> {
    return this.client.request(`/workspaces/${encodeURIComponent(workspaceId)}/members`, { signal });
  }

  addMember(
    workspaceId: string,
    member: { principalType: "USER" | "GROUP"; principalId: string; role: WorkspaceRole },
  ): Promise<void> {
    return this.client.request(`/workspaces/${encodeURIComponent(workspaceId)}/members`, {
      method: "PUT",
      body: member,
    });
  }

  removeMember(
    workspaceId: string,
    principalType: "USER" | "GROUP",
    principalId: string,
  ): Promise<void> {
    return this.client.request(`/workspaces/${encodeURIComponent(workspaceId)}/members`, {
      method: "DELETE",
      query: { principalType, principalId },
    });
  }

  /** Puts a model in a workspace, or moves it between two the caller can edit. */
  assignModel(workspaceId: string, modelId: string): Promise<void> {
    return this.client.request(
      `/workspaces/${encodeURIComponent(workspaceId)}/models/${encodeURIComponent(modelId)}`,
      { method: "PUT" },
    );
  }
}

/* ── Git connectivity (ADR 0018) ──────────────────────────────────────────── */

export type GitChangeKind = "ADDED" | "MODIFIED" | "REMOVED";

export interface GitChange {
  path: string;
  /** The model the file belongs to — files are named by key, not id. */
  modelKey: string;
  kind: GitChangeKind;
}

export interface GitStatus {
  /** False where the workspace has no repository; the rest is then empty, not absent. */
  connected: boolean;
  remoteUrl: string | null;
  branch: string | null;
  subPath: string | null;
  branches: string[];
  /**
   * Commits this branch has that the remote does not, and vice versa. **-1 means the
   * remote could not be reached** — which is not zero, and must not be shown as "in sync".
   */
  ahead: number;
  behind: number;
  changes: GitChange[];
  lastCommitId: string | null;
  lastCommitMessage: string | null;
  error: string | null;
}

export interface GitImportSummary {
  created: string[];
  updated: string[];
  failed: string[];
}

export class WorkspaceGitApi {
  constructor(private readonly client: ApiClient) {}

  private base(workspaceId: string): string {
    return `/workspaces/${encodeURIComponent(workspaceId)}/git`;
  }

  status(workspaceId: string, signal?: AbortSignal): Promise<GitStatus> {
    return this.client.request(this.base(workspaceId), { signal });
  }

  /** Connects *and* imports what the repository holds, so the two agree immediately. */
  connect(
    workspaceId: string,
    request: { remoteUrl: string; branch?: string; subPath?: string },
  ): Promise<GitImportSummary> {
    return this.client.request(this.base(workspaceId), { method: "POST", body: request });
  }

  disconnect(workspaceId: string): Promise<void> {
    return this.client.request(this.base(workspaceId), { method: "DELETE" });
  }

  commit(workspaceId: string, message: string): Promise<{ commitId: string }> {
    return this.client.request(`${this.base(workspaceId)}/commit`, {
      method: "POST",
      body: { message },
    });
  }

  push(workspaceId: string): Promise<void> {
    return this.client.request(`${this.base(workspaceId)}/push`, { method: "POST" });
  }

  pull(workspaceId: string): Promise<GitImportSummary> {
    return this.client.request(`${this.base(workspaceId)}/pull`, { method: "POST" });
  }

  revert(workspaceId: string): Promise<void> {
    return this.client.request(`${this.base(workspaceId)}/revert`, { method: "POST" });
  }

  createBranch(workspaceId: string, name: string): Promise<void> {
    return this.client.request(`${this.base(workspaceId)}/branches`, {
      method: "POST",
      body: { name },
    });
  }

  switchBranch(workspaceId: string, name: string): Promise<void> {
    return this.client.request(`${this.base(workspaceId)}/branches/switch`, {
      method: "POST",
      body: { name },
    });
  }

  /** A unified text diff, returned as plain text rather than wrapped in JSON. */
  diff(workspaceId: string, modelKey?: string, signal?: AbortSignal): Promise<string> {
    return this.client.request(`${this.base(workspaceId)}/diff`, {
      query: modelKey ? { modelKey } : undefined,
      responseType: "text",
      signal,
    });
  }
}
