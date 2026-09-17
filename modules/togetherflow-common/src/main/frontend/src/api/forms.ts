/**
 * The form engine's own REST surface, `/form-api` (FORM_REQUIREMENTS.md §10.2).
 *
 * Distinct from the task and start forms the process and CMMN engines serve under their
 * own prefixes (`TaskApi.getForm`, `ProcessApi.getStartForm`, `CaseApi.getStartForm`):
 * this client is the *repository* — deployments, definitions and the recorded
 * submissions (form instances) — which is what Design deploys into and Control lists.
 */

import type { ApiClient } from "./client";
import type { DataResponse, FormField, FormModelResponse, FormOutcome } from "./types";

export interface FormDeploymentResponse {
  id: string;
  name?: string;
  deploymentTime?: string | null;
  category?: string;
  parentDeploymentId?: string;
  tenantId?: string;
  url?: string;
}

export interface FormDefinitionResponse {
  id: string;
  key: string;
  name?: string;
  description?: string;
  version: number;
  category?: string;
  deploymentId?: string;
  resourceName?: string;
  tenantId?: string;
  url?: string;
}

/** One recorded submission (`ACT_FO_FORM_INSTANCE`). */
export interface FormInstanceResponse {
  id: string;
  formDefinitionId: string;
  taskId?: string | null;
  processInstanceId?: string | null;
  processDefinitionId?: string | null;
  scopeId?: string | null;
  scopeType?: string | null;
  scopeDefinitionId?: string | null;
  submittedDate?: string;
  submittedBy?: string | null;
  formValuesId?: string;
  tenantId?: string;
  url?: string;
}

/** A submission read back as a model: the definition's fields with the recorded values. */
export interface FormInstanceModelResponse extends FormModelResponse {
  formInstanceId: string;
  taskId?: string | null;
  processInstanceId?: string | null;
  processDefinitionId?: string | null;
  fields?: FormField[];
  outcomes?: FormOutcome[];
}

export interface FormDeploymentQuery {
  start?: number;
  size?: number;
  sort?: "id" | "name" | "deployTime" | "tenantId";
  order?: "asc" | "desc";
  name?: string;
  nameLike?: string;
  category?: string;
  parentDeploymentId?: string;
  tenantId?: string;
}

export interface FormDefinitionQuery {
  start?: number;
  size?: number;
  sort?: "name" | "id" | "key" | "category" | "deploymentId" | "version" | "tenantId";
  order?: "asc" | "desc";
  key?: string;
  keyLike?: string;
  name?: string;
  nameLike?: string;
  version?: number;
  latest?: boolean;
  deploymentId?: string;
  parentDeploymentId?: string;
  category?: string;
  tenantId?: string;
}

export interface FormInstanceQuery {
  start?: number;
  size?: number;
  sort?: "submittedDate" | "tenantId";
  order?: "asc" | "desc";
  id?: string;
  formDefinitionId?: string;
  taskId?: string;
  processInstanceId?: string;
  processDefinitionId?: string;
  scopeId?: string;
  scopeType?: string;
  scopeDefinitionId?: string;
  submittedBy?: string;
  submittedByLike?: string;
  tenantId?: string;
}

export interface FormEngineInfo {
  name?: string;
  resourceUrl?: string;
  exception?: string;
  version?: string;
}

export class FormApi {
  constructor(private readonly client: ApiClient) {}

  /* ── Deployments ─────────────────────────────────────────────────────────── */

  listDeployments(
    query: FormDeploymentQuery = {},
    signal?: AbortSignal,
  ): Promise<DataResponse<FormDeploymentResponse>> {
    return this.client.request("/form-repository/deployments", {
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

  getDeployment(deploymentId: string, signal?: AbortSignal): Promise<FormDeploymentResponse> {
    return this.client.request(`/form-repository/deployments/${encodeURIComponent(deploymentId)}`, {
      signal,
    });
  }

  /**
   * Deploys one or more `.form` files, or a `.zip`/`.bar` of them, as a single deployment.
   * The engine names the deployment after the first file unless `deploymentName` is given.
   */
  deploy(
    files: File[],
    options: { deploymentName?: string; tenantId?: string } = {},
  ): Promise<FormDeploymentResponse> {
    const form = new FormData();
    files.forEach((file, index) => form.append(`file${index}`, file, file.name));
    if (options.deploymentName) form.append("deploymentName", options.deploymentName);
    return this.client.request("/form-repository/deployments", {
      method: "POST",
      query: { tenantId: options.tenantId ?? this.client.tenantId },
      body: form,
    });
  }

  /** Deploys a form's JSON straight from an editor, named `<key>.form`. */
  deployJson(
    key: string,
    json: string,
    options: { deploymentName?: string; tenantId?: string } = {},
  ): Promise<FormDeploymentResponse> {
    const fileName = `${(key || "form").replace(/[^\w.-]+/g, "-")}.form`;
    const file = new File([json], fileName, { type: "application/json" });
    return this.deploy([file], { deploymentName: options.deploymentName ?? fileName, tenantId: options.tenantId });
  }

  deleteDeployment(deploymentId: string, cascade = false): Promise<void> {
    return this.client.request(`/form-repository/deployments/${encodeURIComponent(deploymentId)}`, {
      method: "DELETE",
      query: { cascade },
    });
  }

  /* ── Definitions ─────────────────────────────────────────────────────────── */

  listDefinitions(
    query: FormDefinitionQuery = {},
    signal?: AbortSignal,
  ): Promise<DataResponse<FormDefinitionResponse>> {
    return this.client.request("/form-repository/form-definitions", {
      query: {
        size: 25,
        sort: "name",
        order: "asc",
        ...query,
        tenantId: query.tenantId ?? this.client.tenantId,
      },
      signal,
    });
  }

  getDefinition(definitionId: string, signal?: AbortSignal): Promise<FormDefinitionResponse> {
    return this.client.request(
      `/form-repository/form-definitions/${encodeURIComponent(definitionId)}`,
      { signal },
    );
  }

  /** The deployed model — fields, outcomes — without values. */
  getDefinitionModel(definitionId: string, signal?: AbortSignal): Promise<FormModelResponse> {
    return this.client.request(
      `/form-repository/form-definitions/${encodeURIComponent(definitionId)}/model`,
      { signal },
    );
  }

  /** The stored `.form` bytes, for download or inspection. */
  definitionResourceUrl(definitionId: string): string {
    return this.client.buildUrl(
      `/form-repository/form-definitions/${encodeURIComponent(definitionId)}/resourcedata`,
    );
  }

  /**
   * The latest deployed definition for a key, or null when the key was never deployed.
   * Design uses it to tell an author what a Deploy will supersede (FR-A.8).
   */
  async latestDefinition(key: string, signal?: AbortSignal): Promise<FormDefinitionResponse | null> {
    const page = await this.listDefinitions({ key, latest: true, size: 1 }, signal);
    return page.data[0] ?? null;
  }

  /* ── Submissions (form instances) ─────────────────────────────────────────── */

  listInstances(
    query: FormInstanceQuery = {},
    signal?: AbortSignal,
  ): Promise<DataResponse<FormInstanceResponse>> {
    return this.client.request("/form/form-instances", {
      query: {
        size: 25,
        sort: "submittedDate",
        order: "desc",
        ...query,
        tenantId: query.tenantId ?? this.client.tenantId,
      },
      signal,
    });
  }

  getInstance(formInstanceId: string, signal?: AbortSignal): Promise<FormInstanceResponse> {
    return this.client.request(`/form/form-instance/${encodeURIComponent(formInstanceId)}`, {
      signal,
    });
  }

  /** A submission as a model with its recorded values, ready for a read-only render. */
  getInstanceModel(formInstanceId: string, signal?: AbortSignal): Promise<FormInstanceModelResponse> {
    return this.client.request("/form/form-instance-model", {
      method: "POST",
      body: { formInstanceId },
      signal,
    });
  }

  /* ── Engine ───────────────────────────────────────────────────────────────── */

  engine(signal?: AbortSignal): Promise<FormEngineInfo> {
    return this.client.request("/form-management/engine", { signal });
  }
}
