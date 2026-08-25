/**
 * CMMN runtime and history (REQUIREMENTS.md §7.1 "Case work", §7.2 "Case instances").
 *
 * Verified against a running engine:
 *
 * - The CMMN servlet is mounted separately (`/cmmn-api` by default), and its query
 *   endpoints live under `/cmmn-query`, not `/cmmn-history` — `POST /cmmn-history/...`
 *   answers "Request method 'POST' is not supported".
 * - **The task table is shared between engines.** The BPMN `/query/tasks` endpoint
 *   already returns case tasks, tagged `scopeType: "cmmn"` with `scopeId` holding the
 *   case instance id. Work's inbox therefore needs no second query to show case work —
 *   only the case *context* to go with it.
 * - `stage-overview` is the milestone view: it returns stages and milestones together,
 *   each flagged `current` / `ended`, which is what the engine itself uses to render a
 *   case's progress. There is no `historic-plan-item-instances` endpoint (it 500s with
 *   "No endpoint"), so completed plan items come from the runtime list plus this.
 * - Terminating and deleting are different endpoints: `DELETE …/{id}` terminates (the
 *   case ends, history is kept), `DELETE …/{id}/delete` removes it outright.
 */

import type { ApiClient } from "./client";
import type {
  CaseDefinitionResponse,
  CaseInstanceCreateRequest,
  CaseInstanceResponse,
  DataResponse,
  FormModelResponse,
  RestVariable,
} from "./types";

/**
 * A plan item is one node of a running case: a task, stage, milestone or listener,
 * together with the lifecycle state it is currently in.
 */
export interface PlanItemInstanceResponse {
  id: string;
  name?: string | null;
  state?: string;
  caseInstanceId?: string;
  caseDefinitionId?: string;
  stageInstanceId?: string | null;
  /** True when this plan item is itself a stage (so it can contain others). */
  stage?: boolean;
  elementId?: string;
  planItemDefinitionId?: string;
  planItemDefinitionType?: string;
  createTime?: string;
  lastAvailableTime?: string | null;
  lastEnabledTime?: string | null;
  lastStartedTime?: string | null;
  completedTime?: string | null;
  entryCriterionId?: string | null;
  exitCriterionId?: string | null;
  referenceId?: string | null;
  referenceType?: string | null;
  tenantId?: string;
}

/** One row of `stage-overview`: a stage or milestone and whether it has been reached. */
export interface StageOverviewResponse {
  id: string;
  name?: string | null;
  current: boolean;
  ended: boolean;
  endTime?: string | null;
}

export interface MilestoneInstanceResponse {
  id: string;
  name?: string | null;
  timeStamp?: string;
  caseInstanceId?: string;
  caseDefinitionId?: string;
  elementId?: string;
}

export interface CaseInstanceQuery {
  start?: number;
  size?: number;
  sort?: string;
  order?: "asc" | "desc";
  caseDefinitionKey?: string;
  caseDefinitionId?: string;
  caseInstanceId?: string;
  businessKey?: string;
  involvedUser?: string;
  startedBy?: string;
  state?: string;
  finished?: boolean;
  tenantId?: string;
}

/** The four lifecycle transitions the engine accepts on a plan item. */
export type PlanItemAction = "trigger" | "enable" | "disable" | "start";

/**
 * Which actions may be offered for a plan item in a given state.
 *
 * Two different questions are answered here, and they are not the same:
 *
 * 1. **What will the engine accept?** From `PlanItemInstanceResource`: `start` requires
 *    ENABLED (confirmed by the engine rejecting it on an AVAILABLE item with *"Can only
 *    enable a plan item instance which is in state ENABLED"*), `trigger` applies to an
 *    ACTIVE item, and enable/disable toggle a manually-activated one. An item still
 *    blocked on its sentry accepts nothing — the engine starts it when the criterion is
 *    met. Offering an action the engine would refuse is worse than not offering it.
 *
 * 2. **Should this audience be offered it?** Verified against a running engine:
 *    triggering an ACTIVE **human task** succeeds (204) and *completes that task* —
 *    skipping its form, its assignee and its validation. That is a legitimate admin
 *    escape hatch for an instance stuck on a task nobody can action, but it must not sit
 *    in an end-user's case view next to the task they were supposed to fill in. Work
 *    therefore leaves `allowTriggeringHumanTasks` off; Control turns it on.
 */
export function availablePlanItemActions(
  state: string | undefined,
  options: { planItemDefinitionType?: string; allowTriggeringHumanTasks?: boolean } = {},
): PlanItemAction[] {
  const actions = ((): PlanItemAction[] => {
    switch ((state ?? "").toLowerCase()) {
      case "enabled":
        return ["start", "disable"];
      case "disabled":
        return ["enable"];
      case "active":
        return ["trigger"];
      default:
        // AVAILABLE (blocked on a sentry), COMPLETED, TERMINATED and anything
        // unrecognised offer nothing.
        return [];
    }
  })();

  const isHumanTask = (options.planItemDefinitionType ?? "").toLowerCase() === "humantask";
  if (isHumanTask && !options.allowTriggeringHumanTasks) {
    return actions.filter((action) => action !== "trigger");
  }
  return actions;
}

export class CaseApi {
  constructor(private readonly client: ApiClient) {}

  query(
    request: CaseInstanceQuery = {},
    signal?: AbortSignal,
  ): Promise<DataResponse<CaseInstanceResponse>> {
    const tenantId = this.client.tenantId;
    const { start, size, sort, order, ...body } = request;
    return this.client.request("/cmmn-query/case-instances", {
      method: "POST",
      query: { start, size: size ?? 25, sort: sort ?? "startTime", order: order ?? "desc" },
      body: tenantId ? { ...body, tenantId } : body,
      signal,
    });
  }

  /** Historic cases include finished ones; the runtime query only sees live cases. */
  queryHistoric(
    request: CaseInstanceQuery = {},
    signal?: AbortSignal,
  ): Promise<DataResponse<CaseInstanceResponse>> {
    const tenantId = this.client.tenantId;
    const { start, size, sort, order, ...body } = request;
    return this.client.request("/cmmn-query/historic-case-instances", {
      method: "POST",
      query: { start, size: size ?? 25, sort: sort ?? "startTime", order: order ?? "desc" },
      body: tenantId ? { ...body, tenantId } : body,
      signal,
    });
  }

  get(caseInstanceId: string, signal?: AbortSignal): Promise<CaseInstanceResponse> {
    return this.client.request(
      `/cmmn-runtime/case-instances/${encodeURIComponent(caseInstanceId)}`,
      { signal },
    );
  }

  /** A finished case is gone from the runtime tables but still in history. */
  getHistoric(caseInstanceId: string, signal?: AbortSignal): Promise<CaseInstanceResponse> {
    return this.client.request(
      `/cmmn-history/historic-case-instances/${encodeURIComponent(caseInstanceId)}`,
      { signal },
    );
  }

  listVariables(caseInstanceId: string, signal?: AbortSignal): Promise<RestVariable[]> {
    return this.client.request(
      `/cmmn-runtime/case-instances/${encodeURIComponent(caseInstanceId)}/variables`,
      { signal },
    );
  }

  /**
   * Historic variables come wrapped in a `DataResponse` and each row nests the variable
   * under `variable` — unlike the runtime endpoint, which returns a bare array.
   */
  async listHistoricVariables(
    caseInstanceId: string,
    signal?: AbortSignal,
  ): Promise<RestVariable[]> {
    const page = await this.client.request<DataResponse<{ variable?: RestVariable }>>(
      "/cmmn-history/historic-variable-instances",
      { query: { caseInstanceId, size: 200 }, signal },
    );
    return page.data.map((row) => row.variable).filter((v): v is RestVariable => Boolean(v));
  }

  listPlanItems(
    caseInstanceId: string,
    signal?: AbortSignal,
  ): Promise<DataResponse<PlanItemInstanceResponse>> {
    return this.client.request("/cmmn-runtime/plan-item-instances", {
      query: { caseInstanceId, size: 200, sort: "createTime", order: "asc" },
      signal,
    });
  }

  /** Stages and milestones with their reached/current flags — the case's progress. */
  stageOverview(caseInstanceId: string, signal?: AbortSignal): Promise<StageOverviewResponse[]> {
    return this.client.request(
      `/cmmn-runtime/case-instances/${encodeURIComponent(caseInstanceId)}/stage-overview`,
      { signal },
    );
  }

  listMilestones(
    caseInstanceId: string,
    signal?: AbortSignal,
  ): Promise<DataResponse<MilestoneInstanceResponse>> {
    return this.client.request("/cmmn-history/historic-milestone-instances", {
      query: { caseInstanceId, size: 100 },
      signal,
    });
  }

  performPlanItemAction(planItemInstanceId: string, action: PlanItemAction): Promise<void> {
    return this.client.request(
      `/cmmn-runtime/plan-item-instances/${encodeURIComponent(planItemInstanceId)}`,
      { method: "PUT", body: { action } },
    );
  }

  /** Ends the case but keeps its history. */
  terminate(caseInstanceId: string): Promise<void> {
    return this.client.request(
      `/cmmn-runtime/case-instances/${encodeURIComponent(caseInstanceId)}`,
      { method: "DELETE" },
    );
  }

  /** Removes the case outright, history included. */
  delete(caseInstanceId: string): Promise<void> {
    return this.client.request(
      `/cmmn-runtime/case-instances/${encodeURIComponent(caseInstanceId)}/delete`,
      { method: "DELETE" },
    );
  }

  listDefinitions(
    query: { start?: number; size?: number; latest?: boolean } = {},
    signal?: AbortSignal,
  ): Promise<DataResponse<CaseDefinitionResponse>> {
    return this.client.request("/cmmn-repository/case-definitions", {
      query: {
        size: 100,
        latest: query.latest ?? true,
        start: query.start,
        sort: "name",
        order: "asc",
        tenantId: this.client.tenantId,
      },
      signal,
    });
  }

  start(request: CaseInstanceCreateRequest): Promise<CaseInstanceResponse> {
    const tenantId = this.client.tenantId;
    return this.client.request("/cmmn-runtime/case-instances", {
      method: "POST",
      body: tenantId ? { ...request, tenantId } : request,
    });
  }

  /**
   * The case's start form, where one is defined.
   *
   * The endpoint exists on the CMMN servlet, but answers with an empty body unless a
   * form engine is configured — the stock `flowable-rest` image has none (ADR 0010).
   * Callers treat "no renderable fields" as "use the variable grid", so this degrades
   * rather than breaking.
   */
  async getStartForm(
    caseDefinitionId: string,
    signal?: AbortSignal,
  ): Promise<FormModelResponse | null> {
    const form = await this.client.request<FormModelResponse | undefined>(
      `/cmmn-repository/case-definitions/${encodeURIComponent(caseDefinitionId)}/start-form`,
      { signal },
    );
    return form ?? null;
  }

  /**
   * Diagram is a PNG, used directly as an `<img>` source.
   *
   * Only meaningful when the case definition carries CMMNDI — the engine answers 400
   * ("has no graphical notation") otherwise, which is common for hand-written `.cmmn`
   * files. Callers check `graphicalNotationDefined` before rendering the image.
   */
  diagramUrl(caseInstanceId: string): string {
    return this.client.buildUrl(
      `/cmmn-runtime/case-instances/${encodeURIComponent(caseInstanceId)}/diagram`,
    );
  }

  migrate(caseInstanceId: string, body: unknown): Promise<void> {
    return this.client.request(
      `/cmmn-runtime/case-instances/${encodeURIComponent(caseInstanceId)}/migrate`,
      { method: "POST", body },
    );
  }

  validateMigration(caseInstanceId: string, body: unknown): Promise<unknown> {
    return this.client.request(
      `/cmmn-runtime/case-instances/${encodeURIComponent(caseInstanceId)}/validate-migration`,
      { method: "POST", body },
    );
  }
}
