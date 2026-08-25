/**
 * App engine REST wrappers (REQUIREMENTS.md §7.4.5).
 *
 * Verified against a running engine:
 *
 * - The app engine is mounted at its own servlet (`/app-api` by default).
 * - An app is deployed as a **zip** containing one `.app` file (JSON) plus the process,
 *   case and decision resources it bundles. `POST /app-repository/deployments` accepts
 *   `.app`, `.bar` or `.zip`.
 * - Deploying the bundle also deploys the resources inside it to their own engines —
 *   a BPMN file in the zip becomes a process definition, without a separate call.
 */

import type { ApiClient } from "./client";
import type { DataResponse } from "./types";
import type { ModelKind } from "./models";

export interface AppDefinitionResponse {
  id: string;
  url?: string;
  key: string;
  version: number;
  name?: string;
  description?: string;
  category?: string;
  deploymentId?: string;
  resourceName?: string;
  tenantId?: string;
}

export interface AppDeploymentResponse {
  id: string;
  name?: string;
  category?: string;
  deploymentTime?: string | null;
  url?: string;
  tenantId?: string;
}

/** The `.app` file's JSON shape, matching the engine's BaseAppModel. */
export interface AppFileModel {
  key: string;
  name: string;
  description?: string;
  theme?: string;
  icon?: string;
  usersAccess?: string;
  groupsAccess?: string;
}

export class AppApi {
  constructor(private readonly client: ApiClient) {}

  listDefinitions(
    query: { start?: number; size?: number; latest?: boolean } = {},
    signal?: AbortSignal,
  ): Promise<DataResponse<AppDefinitionResponse>> {
    return this.client.request("/app-repository/app-definitions", {
      query: { size: 50, latest: query.latest ?? true, start: query.start, tenantId: this.client.tenantId },
      signal,
    });
  }

  listDeployments(
    query: { start?: number; size?: number } = {},
    signal?: AbortSignal,
  ): Promise<DataResponse<AppDeploymentResponse>> {
    return this.client.request("/app-repository/deployments", {
      query: { size: 25, sort: "deployTime", order: "desc", ...query, tenantId: this.client.tenantId },
      signal,
    });
  }

  deleteDeployment(deploymentId: string, cascade = false): Promise<void> {
    return this.client.request(`/app-repository/deployments/${encodeURIComponent(deploymentId)}`, {
      method: "DELETE",
      query: { cascade },
    });
  }

  /**
   * Deploys a prepared zip. The multipart field name carries the `.zip` suffix because
   * the engine falls back to it when the file name has no recognised extension.
   */
  deployBundle(zip: Uint8Array, appKey: string): Promise<AppDeploymentResponse> {
    const fileName = `${appKey.replace(/[^\w.-]+/g, "-")}.zip`;
    const form = new FormData();
    // Copy into a fresh buffer so the Blob owns a plain ArrayBuffer.
    const bytes = new Uint8Array(zip);
    form.append(fileName, new Blob([bytes], { type: "application/zip" }), fileName);
    return this.client.request("/app-repository/deployments", {
      method: "POST",
      query: { tenantId: this.client.tenantId },
      body: form,
    });
  }
}

/**
 * File name a model's source must carry inside an app bundle for the engine to
 * recognise it. The suffixes are matched case-sensitively for BPMN and CMMN.
 */
export function bundleFileName(kind: ModelKind, key: string): string {
  const base = (key || "model").replace(/[^\w.-]+/g, "-");
  if (kind === "cmmn") return `${base}.cmmn`;
  if (kind === "dmn") return `${base}.dmn`;
  if (kind === "form") return `${base}.form`;
  return `${base}.bpmn20.xml`;
}
