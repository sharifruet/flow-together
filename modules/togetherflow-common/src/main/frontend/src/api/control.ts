/**
 * Operations/admin REST wrappers (REQUIREMENTS.md §7.2).
 *
 * Job, deployment, table and batch management all live under `/management` and
 * `/repository` on the process API. External worker jobs and DMN history sit behind
 * their own servlets, so those take separately-configured clients.
 */

import type { ApiClient } from "./client";
import type { DataResponse, ProcessInstanceResponse, RestVariable } from "./types";

/* ── Types ──────────────────────────────────────────────────────────────── */

export interface JobResponse {
  id: string;
  url?: string;
  correlationId?: string;
  processInstanceId?: string;
  processDefinitionId?: string;
  executionId?: string;
  elementId?: string;
  elementName?: string;
  handlerType?: string;
  retries?: number | null;
  exceptionMessage?: string | null;
  dueDate?: string | null;
  createTime?: string | null;
  lockOwner?: string | null;
  lockExpirationTime?: string | null;
  tenantId?: string;
}

export interface HistoryJobResponse {
  id: string;
  url?: string;
  scopeType?: string;
  retries?: number | null;
  exceptionMessage?: string | null;
  jobHandlerType?: string;
  createTime?: string | null;
  lockOwner?: string | null;
  tenantId?: string;
}

/** The five job queues the engine keeps, each with its own endpoint. */
export type JobQueue = "async" | "timer" | "suspended" | "deadletter" | "history";

const JOB_PATHS: Record<JobQueue, string> = {
  async: "/management/jobs",
  timer: "/management/timer-jobs",
  suspended: "/management/suspended-jobs",
  deadletter: "/management/deadletter-jobs",
  history: "/management/history-jobs",
};

export interface JobQuery {
  start?: number;
  size?: number;
  sort?: string;
  order?: "asc" | "desc";
  processInstanceId?: string;
  withException?: boolean;
  handlerType?: string;
  tenantId?: string;
}

export interface ActivityInstanceResponse {
  id: string;
  activityId?: string;
  activityName?: string;
  activityType?: string;
  processInstanceId?: string;
  executionId?: string;
  taskId?: string;
  assignee?: string;
  startTime?: string | null;
  endTime?: string | null;
  durationInMillis?: number | null;
}

export interface DeploymentResponse {
  id: string;
  name?: string;
  deploymentTime?: string | null;
  category?: string;
  parentDeploymentId?: string;
  url?: string;
  tenantId?: string;
}

export interface DeploymentResourceResponse {
  id: string;
  url?: string;
  contentUrl?: string;
  mediaType?: string;
  type?: string;
}

export interface EventSubscriptionResponse {
  id: string;
  eventType?: string;
  eventName?: string;
  activityId?: string;
  executionId?: string;
  processInstanceId?: string;
  processDefinitionId?: string;
  scopeId?: string;
  scopeType?: string;
  created?: string | null;
  configuration?: string;
  tenantId?: string;
}

export interface BatchResponse {
  id: string;
  url?: string;
  batchType?: string;
  searchKey?: string;
  searchKey2?: string;
  createTime?: string | null;
  completeTime?: string | null;
  status?: string;
  tenantId?: string;
}

export interface TableResponse {
  name: string;
  url?: string;
  count?: number;
}

export interface TableMetaData {
  tableName: string;
  columnNames: string[];
  columnTypes: string[];
}

export interface EngineInfoResponse {
  name?: string;
  resourceUrl?: string;
  exception?: string;
  version?: string;
}

export interface ExternalWorkerJobResponse {
  id: string;
  processInstanceId?: string;
  processDefinitionId?: string;
  executionId?: string;
  scopeId?: string;
  scopeType?: string;
  elementId?: string;
  elementName?: string;
  retries?: number | null;
  exceptionMessage?: string | null;
  dueDate?: string | null;
  createTime?: string | null;
  lockOwner?: string | null;
  lockExpirationTime?: string | null;
  tenantId?: string;
}

export interface HistoricDecisionExecutionResponse {
  id: string;
  decisionDefinitionId?: string;
  decisionKey?: string;
  decisionName?: string;
  decisionVersion?: string;
  deploymentId?: string;
  instanceId?: string;
  executionId?: string;
  activityId?: string;
  scopeType?: string;
  failed?: boolean;
  startTime?: string | null;
  endTime?: string | null;
  tenantId?: string;
}

export interface ProcessInstanceQuery {
  start?: number;
  size?: number;
  sort?: string;
  order?: "asc" | "desc";
  processInstanceName?: string;
  processInstanceNameLikeIgnoreCase?: string;
  processDefinitionKey?: string;
  processBusinessKeyLike?: string;
  startedBy?: string;
  involvedUser?: string;
  suspended?: boolean;
  excludeSubprocesses?: boolean;
  tenantId?: string;
}

/* ── Jobs ───────────────────────────────────────────────────────────────── */

export class JobApi {
  constructor(private readonly client: ApiClient) {}

  list(
    queue: JobQueue,
    query: JobQuery = {},
    signal?: AbortSignal,
  ): Promise<DataResponse<JobResponse | HistoryJobResponse>> {
    return this.client.request(JOB_PATHS[queue], {
      query: {
        size: 25,
        sort: queue === "history" ? "id" : "dueDate",
        order: "asc",
        ...query,
        tenantId: query.tenantId ?? this.client.tenantId,
      },
      signal,
    });
  }

  /**
   * Runs a job now. This is the "retry" operation for a failed async job — the
   * engine has no separate retry verb; executing it again is the retry.
   */
  execute(queue: JobQueue, jobId: string): Promise<void> {
    return this.client.request(`${JOB_PATHS[queue]}/${encodeURIComponent(jobId)}`, {
      method: "POST",
      body: { action: "execute" },
    });
  }

  /** Moves a dead-letter job back onto the executable queue. */
  moveDeadLetter(jobId: string): Promise<void> {
    return this.client.request(`/management/deadletter-jobs/${encodeURIComponent(jobId)}`, {
      method: "POST",
      body: { action: "move" },
    });
  }

  /** Bulk equivalent — the reason Control exists is to act at volume (§14.4). */
  moveDeadLetters(jobIds: string[]): Promise<void> {
    return this.client.request("/management/deadletter-jobs", {
      method: "POST",
      body: { action: "move", jobIds },
    });
  }

  /** Reschedules a timer job to a new due date. */
  rescheduleTimer(jobId: string, dueDate: string): Promise<void> {
    return this.client.request(`/management/timer-jobs/${encodeURIComponent(jobId)}`, {
      method: "POST",
      body: { action: "reschedule", dueDate },
    });
  }

  delete(queue: JobQueue, jobId: string): Promise<void> {
    return this.client.request(`${JOB_PATHS[queue]}/${encodeURIComponent(jobId)}`, {
      method: "DELETE",
    });
  }

  /** Returns text/plain, so this reads the raw body rather than JSON. */
  async stacktrace(queue: JobQueue, jobId: string, signal?: AbortSignal): Promise<string> {
    const result = await this.client.request<unknown>(
      `${JOB_PATHS[queue]}/${encodeURIComponent(jobId)}/exception-stacktrace`,
      { signal },
    );
    return typeof result === "string" ? result : JSON.stringify(result, null, 2);
  }
}

/* ── Runtime instances ──────────────────────────────────────────────────── */

export class InstanceApi {
  constructor(private readonly client: ApiClient) {}

  query(
    request: ProcessInstanceQuery,
    signal?: AbortSignal,
  ): Promise<DataResponse<ProcessInstanceResponse>> {
    const tenantId = this.client.tenantId;
    const { start, size, sort, order, ...body } = request;
    return this.client.request("/query/process-instances", {
      method: "POST",
      query: { start, size, sort: sort ?? "startTime", order: order ?? "desc" },
      body: tenantId ? { ...body, tenantId } : body,
      signal,
    });
  }

  get(instanceId: string, signal?: AbortSignal): Promise<ProcessInstanceResponse> {
    return this.client.request(`/runtime/process-instances/${encodeURIComponent(instanceId)}`, {
      signal,
    });
  }

  listVariables(instanceId: string, signal?: AbortSignal): Promise<RestVariable[]> {
    return this.client.request(
      `/runtime/process-instances/${encodeURIComponent(instanceId)}/variables`,
      { signal },
    );
  }

  listActivities(
    instanceId: string,
    signal?: AbortSignal,
  ): Promise<DataResponse<ActivityInstanceResponse>> {
    return this.client.request("/runtime/activity-instances", {
      query: { processInstanceId: instanceId, size: 200, sort: "startTime", order: "asc" },
      signal,
    });
  }

  setSuspended(instanceId: string, suspended: boolean): Promise<ProcessInstanceResponse> {
    return this.client.request(`/runtime/process-instances/${encodeURIComponent(instanceId)}`, {
      method: "PUT",
      body: { action: suspended ? "suspend" : "activate" },
    });
  }

  delete(instanceId: string, deleteReason?: string): Promise<void> {
    return this.client.request(`/runtime/process-instances/${encodeURIComponent(instanceId)}`, {
      method: "DELETE",
      query: { deleteReason },
    });
  }

  /** Diagram is a PNG; the URL is used directly as an <img> source. */
  diagramUrl(instanceId: string): string {
    return this.client.buildUrl(
      `/runtime/process-instances/${encodeURIComponent(instanceId)}/diagram`,
    );
  }
}

/* ── Repository: deployments and definitions ────────────────────────────── */

export interface DeploymentQuery {
  start?: number;
  size?: number;
  sort?: string;
  order?: "asc" | "desc";
  nameLike?: string;
  tenantId?: string;
}

export class RepositoryApi {
  constructor(private readonly client: ApiClient) {}

  listDeployments(
    query: DeploymentQuery = {},
    signal?: AbortSignal,
  ): Promise<DataResponse<DeploymentResponse>> {
    return this.client.request("/repository/deployments", {
      query: {
        size: 25,
        sort: "deployTime",
        order: "desc",
        ...query,
        tenantId: query.tenantId ?? this.client.tenantId,
      },
      signal,
    });
  }

  listDeploymentResources(
    deploymentId: string,
    signal?: AbortSignal,
  ): Promise<DeploymentResourceResponse[]> {
    return this.client.request(
      `/repository/deployments/${encodeURIComponent(deploymentId)}/resources`,
      { signal },
    );
  }

  resourceDataUrl(deploymentId: string, resourceName: string): string {
    return this.client.buildUrl(
      `/repository/deployments/${encodeURIComponent(deploymentId)}/resourcedata/${resourceName}`,
    );
  }

  upload(file: File, meta: { deploymentName?: string; tenantId?: string } = {}): Promise<DeploymentResponse> {
    const form = new FormData();
    form.append("file", file, file.name);
    return this.client.request("/repository/deployments", {
      method: "POST",
      query: {
        deploymentName: meta.deploymentName || file.name,
        tenantId: meta.tenantId ?? this.client.tenantId,
      },
      body: form,
    });
  }

  /** Cascade also removes running instances started from this deployment. */
  deleteDeployment(deploymentId: string, cascade = false): Promise<void> {
    return this.client.request(`/repository/deployments/${encodeURIComponent(deploymentId)}`, {
      method: "DELETE",
      query: { cascade },
    });
  }

  /**
   * Suspend/activate a process definition. Only BPMN definitions support this —
   * the CMMN and DMN REST layers expose no equivalent (§7.2).
   */
  setDefinitionSuspended(
    definitionId: string,
    suspended: boolean,
    includeProcessInstances = false,
  ): Promise<unknown> {
    return this.client.request(
      `/repository/process-definitions/${encodeURIComponent(definitionId)}`,
      {
        method: "PUT",
        body: { action: suspended ? "suspend" : "activate", includeProcessInstances },
      },
    );
  }

  listStarters(definitionId: string, signal?: AbortSignal): Promise<RestIdentityLink[]> {
    return this.client.request(
      `/repository/process-definitions/${encodeURIComponent(definitionId)}/identitylinks`,
      { signal },
    );
  }

  addStarter(definitionId: string, identity: { user?: string; group?: string }): Promise<RestIdentityLink> {
    return this.client.request(
      `/repository/process-definitions/${encodeURIComponent(definitionId)}/identitylinks`,
      { method: "POST", body: identity },
    );
  }

  removeStarter(definitionId: string, family: "users" | "groups", identityId: string): Promise<void> {
    return this.client.request(
      `/repository/process-definitions/${encodeURIComponent(definitionId)}/identitylinks/${family}/${encodeURIComponent(identityId)}`,
      { method: "DELETE" },
    );
  }
}

export interface RestIdentityLink {
  url?: string;
  user?: string;
  group?: string;
  type?: string;
}

/* ── System: engine, tables, subscriptions, batches ─────────────────────── */

export class SystemApi {
  constructor(private readonly client: ApiClient) {}

  engine(signal?: AbortSignal): Promise<EngineInfoResponse> {
    return this.client.request("/management/engine", { signal });
  }

  properties(signal?: AbortSignal): Promise<Record<string, string>> {
    return this.client.request("/management/properties", { signal });
  }

  listTables(signal?: AbortSignal): Promise<TableResponse[]> {
    return this.client.request("/management/tables", { signal });
  }

  tableColumns(tableName: string, signal?: AbortSignal): Promise<TableMetaData> {
    return this.client.request(`/management/tables/${encodeURIComponent(tableName)}/columns`, {
      signal,
    });
  }

  tableData(
    tableName: string,
    query: { start?: number; size?: number; orderAscendingColumn?: string } = {},
    signal?: AbortSignal,
  ): Promise<DataResponse<Record<string, unknown>>> {
    return this.client.request(`/management/tables/${encodeURIComponent(tableName)}/data`, {
      query: { size: 25, ...query },
      signal,
    });
  }

  listEventSubscriptions(
    query: { start?: number; size?: number; eventType?: string } = {},
    signal?: AbortSignal,
  ): Promise<DataResponse<EventSubscriptionResponse>> {
    return this.client.request("/runtime/event-subscriptions", {
      query: { size: 25, sort: "created", order: "desc", ...query, tenantId: this.client.tenantId },
      signal,
    });
  }

  listBatches(
    query: { start?: number; size?: number; status?: string } = {},
    signal?: AbortSignal,
  ): Promise<DataResponse<BatchResponse>> {
    return this.client.request("/management/batches", {
      query: { size: 25, ...query, tenantId: this.client.tenantId },
      signal,
    });
  }

  deleteBatch(batchId: string): Promise<void> {
    return this.client.request(`/management/batches/${encodeURIComponent(batchId)}`, {
      method: "DELETE",
    });
  }

  /** Broadcasts a signal, optionally scoped to one execution (§7.2). */
  broadcastSignal(signalName: string, options: { tenantId?: string; async?: boolean } = {}): Promise<void> {
    return this.client.request("/runtime/signals", {
      method: "POST",
      body: {
        signalName,
        tenantId: options.tenantId ?? this.client.tenantId,
        async: options.async ?? false,
      },
    });
  }
}

/** External worker jobs live behind their own servlet (`/external-job-api`). */
export class ExternalWorkerApi {
  constructor(private readonly client: ApiClient) {}

  list(
    query: { start?: number; size?: number; withException?: boolean; locked?: boolean } = {},
    signal?: AbortSignal,
  ): Promise<DataResponse<ExternalWorkerJobResponse>> {
    return this.client.request("/jobs", {
      query: { size: 25, sort: "createTime", order: "desc", ...query },
      signal,
    });
  }
}

/** DMN history lives behind `/dmn-api`. */
export class DecisionHistoryApi {
  constructor(private readonly client: ApiClient) {}

  list(
    query: { start?: number; size?: number; failed?: boolean; decisionKey?: string } = {},
    signal?: AbortSignal,
  ): Promise<DataResponse<HistoricDecisionExecutionResponse>> {
    return this.client.request("/dmn-history/historic-decision-executions", {
      query: { size: 25, sort: "startTime", order: "desc", ...query },
      signal,
    });
  }
}
