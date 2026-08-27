/**
 * Operations/admin REST wrappers (REQUIREMENTS.md §7.2).
 *
 * Job, deployment, table and batch management all live under `/management` and
 * `/repository` on the process API. External worker jobs and DMN history sit behind
 * their own servlets, so those take separately-configured clients.
 */

import type { ApiClient } from "./client";
import type {
  DataResponse,
  ProcessDefinitionResponse,
  ProcessInstanceResponse,
  RestVariable,
} from "./types";

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

/**
 * The twelve comparisons `QueryVariable.QueryVariableOperation` accepts. Confirmed against
 * this fork's own source in W2.1's discovery step, not assumed from documentation.
 */
export type VariableOperation =
  | "equals"
  | "notEquals"
  | "equalsIgnoreCase"
  | "notEqualsIgnoreCase"
  | "like"
  | "likeIgnoreCase"
  | "greaterThan"
  | "greaterThanOrEquals"
  | "lessThan"
  | "lessThanOrEquals"
  | "exists"
  | "notExists";

/** Operations that compare against nothing — the value is omitted rather than sent empty. */
export const UNARY_VARIABLE_OPERATIONS: VariableOperation[] = ["exists", "notExists"];

export interface VariableFilter {
  name: string;
  operation: VariableOperation;
  /** Omitted for `exists`/`notExists`. Strings, numbers and booleans all round-trip. */
  value?: string | number | boolean;
}

export interface ProcessInstanceQuery {
  start?: number;
  size?: number;
  sort?: string;
  order?: "asc" | "desc";
  processInstanceName?: string;
  processInstanceNameLikeIgnoreCase?: string;
  processDefinitionKey?: string;
  processBusinessKey?: string;
  processBusinessKeyLike?: string;
  startedBy?: string;
  involvedUser?: string;
  suspended?: boolean;
  excludeSubprocesses?: boolean;
  /** ISO instants. The engine's own `startedAfter`/`startedBefore`. */
  startedAfter?: string;
  startedBefore?: string;
  /** Variable-value filters (W2.1). Sent in the POST body — they have no query-string form. */
  variables?: VariableFilter[];
  tenantId?: string;
}

/**
 * Just enough of the engine's `BpmnModel` JSON to walk it for activity ids.
 *
 * Deliberately partial: the full serialised model is large and its shape is the engine's
 * object graph rather than a designed contract, so typing all of it would be a liability.
 * `$type` is how the serialiser names the element class.
 */
interface BpmnFlowElement {
  id?: string;
  name?: string;
  $type?: string;
  flowElements?: BpmnFlowElement[];
}

interface BpmnModelResponse {
  mainProcess?: { flowElements?: BpmnFlowElement[] };
  processes?: { flowElements?: BpmnFlowElement[] }[];
}

/* ── Migration (W2.1) ───────────────────────────────────────────────────────
 * Shapes taken from `ProcessInstanceMigrationDocumentConstants` and
 * `ProcessInstanceMigrationDocumentConverter`, which is what the engine actually parses.
 */

/**
 * A one-to-one activity mapping, optionally re-stamping the task it lands on.
 *
 * The engine also understands one-to-many and many-to-one mappings; the client would send
 * them, but no UI authors them — see docs/ui/WAVE2_DISCOVERY.md for why.
 */
export interface ActivityMigrationMapping {
  fromActivityId: string;
  toActivityId: string;
  newAssignee?: string;
  newOwner?: string;
  newDueDate?: string;
  newPriority?: number;
  newName?: string;
  newCandidateUsers?: string[];
  newCandidateGroups?: string[];
}

export interface MigrationDocument {
  /** One of these two identifies the target; the id form is what the UI sends. */
  toProcessDefinitionId?: string;
  toProcessDefinitionKey?: string;
  toProcessDefinitionVersion?: number;
  toProcessDefinitionTenantId?: string;
  activityMappings?: ActivityMigrationMapping[];
  processInstanceVariables?: Record<string, unknown>;
}

/** What `/migrate/validate` answers. `validationMessages` is empty when it would succeed. */
export interface MigrationValidationResult {
  validationMessages?: string[];
  migrationValid?: boolean;
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

  /**
   * Creates or updates one variable on a *running* instance (W2.1).
   *
   * PUT on the single-variable resource rather than the collection: the collection's PUT
   * replaces the whole set, so editing one variable through it would delete every other
   * variable that was not sent.
   */
  setVariable(instanceId: string, variable: RestVariable): Promise<RestVariable> {
    return this.client.request(
      `/runtime/process-instances/${encodeURIComponent(instanceId)}/variables/${encodeURIComponent(variable.name)}`,
      { method: "PUT", body: { ...variable, scope: variable.scope ?? "global" } },
    );
  }

  /** Adds a variable that does not exist yet. POST rejects a name already present. */
  createVariable(instanceId: string, variable: RestVariable): Promise<RestVariable[]> {
    return this.client.request(
      `/runtime/process-instances/${encodeURIComponent(instanceId)}/variables`,
      { method: "POST", body: [{ ...variable, scope: variable.scope ?? "global" }] },
    );
  }

  deleteVariable(instanceId: string, name: string): Promise<void> {
    return this.client.request(
      `/runtime/process-instances/${encodeURIComponent(instanceId)}/variables/${encodeURIComponent(name)}`,
      { method: "DELETE" },
    );
  }

  /**
   * Moves execution state (W2.1): cancel these activities, start those.
   *
   * Deliberately presented as exactly what `ExecutionChangeActivityStateRequest` is. A
   * friendlier abstraction — "move the token from A to B" — would be inventing a model the
   * engine does not have, and would mislead the moment a cancel and a start are not paired.
   */
  changeState(
    instanceId: string,
    change: { cancelActivityIds?: string[]; startActivityIds?: string[] },
  ): Promise<void> {
    return this.client.request(
      `/runtime/process-instances/${encodeURIComponent(instanceId)}/change-state`,
      { method: "POST", body: change },
    );
  }

  /**
   * Dry-runs a migration. Always called before `migrate` — the engine offers the check, and
   * an operator moving live instances between definitions should see what will break first.
   */
  validateMigration(
    instanceId: string,
    document: MigrationDocument,
    signal?: AbortSignal,
  ): Promise<MigrationValidationResult> {
    return this.client.request(
      `/runtime/process-instances/${encodeURIComponent(instanceId)}/migrate/validate`,
      { method: "POST", body: document, signal },
    );
  }

  migrate(instanceId: string, document: MigrationDocument): Promise<void> {
    return this.client.request(
      `/runtime/process-instances/${encodeURIComponent(instanceId)}/migrate`,
      { method: "POST", body: document },
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

  /**
   * Deletes several instances in one call (W2.1).
   *
   * A real engine endpoint, not a loop of single deletes: `bulkDeleteProcessInstances`
   * runs in one transaction, so an operator clearing 200 stuck instances gets all or
   * nothing rather than a partial result they then have to reconcile. `action` is
   * required and the engine rejects anything but "delete".
   */
  bulkDelete(instanceIds: string[], deleteReason?: string): Promise<void> {
    return this.client.request("/runtime/process-instances/delete", {
      method: "POST",
      body: { action: "delete", instanceIds, deleteReason },
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
   * Lists process definitions **without** filtering on suspension.
   *
   * `ProcessApi.listDefinitions` defaults `suspended: false` because Work only offers
   * startable processes; an admin screen that inherited that default would hide exactly
   * the definitions it exists to un-suspend.
   */
  listProcessDefinitions(
    query: {
      latest?: boolean;
      size?: number;
      nameLike?: string;
      suspended?: boolean;
      /** Every version of one definition — W2.1's migration targets. Pair with `latest: false`. */
      key?: string;
    } = {},
    signal?: AbortSignal,
  ): Promise<DataResponse<ProcessDefinitionResponse>> {
    return this.client.request("/repository/process-definitions", {
      query: {
        latest: query.latest ?? true,
        size: query.size ?? 100,
        nameLike: query.nameLike,
        suspended: query.suspended,
        key: query.key,
        sort: "name",
        tenantId: this.client.tenantId,
      },
      signal,
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

  getProcessDefinition(
    definitionId: string,
    signal?: AbortSignal,
  ): Promise<ProcessDefinitionResponse> {
    return this.client.request(
      `/repository/process-definitions/${encodeURIComponent(definitionId)}`,
      { signal },
    );
  }

  /**
   * The activity ids in a definition, for W2.1's migration mapping editor.
   *
   * `/model` hands back the whole `BpmnModel` as JSON. Only the flow elements are wanted,
   * so this flattens it here rather than handing a caller a shape whose depth is an
   * accident of the engine's object graph. Sub-process children are included and prefixed
   * by nothing — activity ids are unique within a definition, which is what makes a flat
   * mapping list correct.
   */
  async listActivityIdsFor(
    definitionId: string,
    signal?: AbortSignal,
  ): Promise<{ id: string; name?: string; type?: string }[]> {
    const model = await this.client.request<BpmnModelResponse>(
      `/repository/process-definitions/${encodeURIComponent(definitionId)}/model`,
      { signal },
    );

    const found: { id: string; name?: string; type?: string }[] = [];
    const walk = (elements: BpmnFlowElement[] | undefined) => {
      for (const element of elements ?? []) {
        // Sequence flows have ids too and are never a migration target.
        if (element.id && element.$type !== "sequenceFlow") {
          found.push({ id: element.id, name: element.name, type: element.$type });
        }
        walk(element.flowElements);
      }
    };
    walk(model.mainProcess?.flowElements ?? model.processes?.[0]?.flowElements);
    return found;
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

/**
 * Authorized starters for a **case** definition.
 *
 * The CMMN servlet exposes the same identity-link shape as BPMN, on its own base URL,
 * so this takes a separate client rather than duplicating the whole repository API.
 */
export class CaseDefinitionAccessApi {
  constructor(private readonly client: ApiClient) {}

  listStarters(definitionId: string, signal?: AbortSignal): Promise<RestIdentityLink[]> {
    return this.client.request(
      `/cmmn-repository/case-definitions/${encodeURIComponent(definitionId)}/identitylinks`,
      { signal },
    );
  }

  addStarter(definitionId: string, identity: { user?: string; group?: string }): Promise<RestIdentityLink> {
    return this.client.request(
      `/cmmn-repository/case-definitions/${encodeURIComponent(definitionId)}/identitylinks`,
      { method: "POST", body: identity },
    );
  }

  removeStarter(definitionId: string, family: "users" | "groups", identityId: string): Promise<void> {
    return this.client.request(
      `/cmmn-repository/case-definitions/${encodeURIComponent(definitionId)}/identitylinks/${family}/${encodeURIComponent(identityId)}`,
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
