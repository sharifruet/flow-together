/** Typed wrappers over the Flowable REST resources this app uses. */

import type { ApiClient } from "./client";
import type {
  AttachmentLinkRequest,
  AttachmentResponse,
  CommentResponse,
  DataResponse,
  FormModelResponse,
  HistoricProcessInstanceQueryRequest,
  HistoricProcessInstanceResponse,
  HistoricTaskInstanceQueryRequest,
  HistoricTaskInstanceResponse,
  ProcessDefinitionResponse,
  ProcessInstanceCreateRequest,
  ProcessInstanceResponse,
  RestVariable,
  TaskActionRequest,
  TaskQueryRequest,
  TaskResponse,
} from "./types";

export class TaskApi {
  constructor(private readonly client: ApiClient) {}

  /** POST /query/tasks — the filterable inbox query. */
  query(request: TaskQueryRequest, signal?: AbortSignal): Promise<DataResponse<TaskResponse>> {
    const tenantId = this.client.tenantId;
    return this.client.request("/query/tasks", {
      method: "POST",
      body: tenantId ? { ...request, tenantId } : request,
      signal,
    });
  }

  get(taskId: string, signal?: AbortSignal): Promise<TaskResponse> {
    return this.client.request(`/runtime/tasks/${encodeURIComponent(taskId)}`, { signal });
  }

  action(taskId: string, request: TaskActionRequest): Promise<void> {
    return this.client.request(`/runtime/tasks/${encodeURIComponent(taskId)}`, {
      method: "POST",
      body: request,
    });
  }

  claim(taskId: string, assignee: string): Promise<void> {
    return this.action(taskId, { action: "claim", assignee });
  }

  unclaim(taskId: string): Promise<void> {
    return this.action(taskId, { action: "unclaim" });
  }

  complete(taskId: string, variables?: RestVariable[]): Promise<void> {
    return this.action(taskId, { action: "complete", variables });
  }

  listVariables(taskId: string, signal?: AbortSignal): Promise<RestVariable[]> {
    return this.client.request(`/runtime/tasks/${encodeURIComponent(taskId)}/variables`, { signal });
  }

  listComments(taskId: string, signal?: AbortSignal): Promise<CommentResponse[]> {
    return this.client.request(`/runtime/tasks/${encodeURIComponent(taskId)}/comments`, { signal });
  }

  addComment(taskId: string, message: string): Promise<CommentResponse> {
    return this.client.request(`/runtime/tasks/${encodeURIComponent(taskId)}/comments`, {
      method: "POST",
      body: { message, saveProcessInstanceId: true },
    });
  }

  /**
   * GET /runtime/tasks/{taskId}/form.
   *
   * Returns null rather than throwing for the expected "no form here" cases: the
   * endpoint 400s when the task has no formKey, and fails outright when no form
   * engine is deployed. Callers fall back to the variable grid.
   */
  async getForm(taskId: string, signal?: AbortSignal): Promise<FormModelResponse | null> {
    try {
      return await this.client.request<FormModelResponse>(
        `/runtime/tasks/${encodeURIComponent(taskId)}/form`,
        { signal },
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      return null;
    }
  }

  listAttachments(taskId: string, signal?: AbortSignal): Promise<AttachmentResponse[]> {
    return this.client.request(`/runtime/tasks/${encodeURIComponent(taskId)}/attachments`, {
      signal,
    });
  }

  /**
   * Uploads bytes into the engine's own storage — the default `db` attachment
   * provider (REQUIREMENTS.md §7.6). The resource takes the first file part
   * regardless of its field name, and reads name/description/type as form fields.
   */
  uploadAttachment(
    taskId: string,
    file: File,
    meta: { name?: string; description?: string; type?: string } = {},
  ): Promise<AttachmentResponse> {
    const form = new FormData();
    form.append("name", meta.name?.trim() || file.name);
    if (meta.description) form.append("description", meta.description);
    form.append("type", meta.type || file.type || "application/octet-stream");
    form.append("file", file, file.name);

    return this.client.request(`/runtime/tasks/${encodeURIComponent(taskId)}/attachments`, {
      method: "POST",
      body: form,
    });
  }

  /**
   * Registers a link instead of bytes. This is the same seam a SharePoint or
   * filesystem provider uses once the gateway exists (§7.6) — nothing about this
   * call changes when the provider does.
   */
  addAttachmentLink(
    taskId: string,
    request: AttachmentLinkRequest,
  ): Promise<AttachmentResponse> {
    return this.client.request(`/runtime/tasks/${encodeURIComponent(taskId)}/attachments`, {
      method: "POST",
      body: request,
    });
  }

  deleteAttachment(taskId: string, attachmentId: string): Promise<void> {
    return this.client.request(
      `/runtime/tasks/${encodeURIComponent(taskId)}/attachments/${encodeURIComponent(attachmentId)}`,
      { method: "DELETE" },
    );
  }

  /** Absolute URL for downloading engine-stored content. */
  attachmentContentUrl(taskId: string, attachmentId: string): string {
    return this.client.buildUrl(
      `/runtime/tasks/${encodeURIComponent(taskId)}/attachments/${encodeURIComponent(attachmentId)}/content`,
    );
  }
}

export class HistoryApi {
  constructor(private readonly client: ApiClient) {}

  queryTasks(
    request: HistoricTaskInstanceQueryRequest,
    signal?: AbortSignal,
  ): Promise<DataResponse<HistoricTaskInstanceResponse>> {
    const tenantId = this.client.tenantId;
    return this.client.request("/query/historic-task-instances", {
      method: "POST",
      body: tenantId ? { ...request, tenantId } : request,
      signal,
    });
  }

  queryProcessInstances(
    request: HistoricProcessInstanceQueryRequest,
    signal?: AbortSignal,
  ): Promise<DataResponse<HistoricProcessInstanceResponse>> {
    const tenantId = this.client.tenantId;
    return this.client.request("/query/historic-process-instances", {
      method: "POST",
      body: tenantId ? { ...request, tenantId } : request,
      signal,
    });
  }
}

export class ProcessApi {
  constructor(private readonly client: ApiClient) {}

  listDefinitions(
    params: { latest?: boolean; suspended?: boolean; size?: number; nameLike?: string } = {},
    signal?: AbortSignal,
  ): Promise<DataResponse<ProcessDefinitionResponse>> {
    return this.client.request("/repository/process-definitions", {
      query: {
        latest: params.latest ?? true,
        suspended: params.suspended ?? false,
        size: params.size ?? 100,
        nameLike: params.nameLike,
        tenantId: this.client.tenantId,
        sort: "name",
      },
      signal,
    });
  }

  /** GET /repository/process-definitions/{id}/start-form; null when none is defined. */
  async getStartForm(
    definitionId: string,
    signal?: AbortSignal,
  ): Promise<FormModelResponse | null> {
    try {
      return await this.client.request<FormModelResponse>(
        `/repository/process-definitions/${encodeURIComponent(definitionId)}/start-form`,
        { signal },
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      return null;
    }
  }

  start(request: ProcessInstanceCreateRequest): Promise<ProcessInstanceResponse> {
    const tenantId = this.client.tenantId;
    return this.client.request("/runtime/process-instances", {
      method: "POST",
      body: tenantId ? { ...request, tenantId } : request,
    });
  }
}

/**
 * CMMN lives behind its own servlet prefix, so it takes a separately-configured client
 * rather than reusing the process one.
 */

/*
 * The CMMN runtime API (case instances, plan items, milestones, start) lives in
 * `cases.ts`. An earlier stub here duplicated its definition-list and start calls and
 * was never wired to a screen; it was folded in rather than left to drift.
 */
