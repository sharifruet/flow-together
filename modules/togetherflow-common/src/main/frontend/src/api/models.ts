/**
 * Draft model repository (REQUIREMENTS.md §7.4.1, §5).
 *
 * Two things shape this API, both verified against the engine:
 *
 * 1. Model source is stored as **opaque bytes** — the engine never parses it — so
 *    TogetherFlow stores the native XML (BPMN or DMN) directly rather than inventing
 *    an intermediate editor format. That makes the round trip lossless.
 * 2. There is **no endpoint that deploys a model**. Deployment means re-uploading the
 *    source to `/repository/deployments` (or `/dmn-repository/deployments`) as a
 *    multipart file, so `deploy()` below reads the draft and posts it onward.
 */

import type { ApiClient } from "./client";
import type { DataResponse } from "./types";

export interface ModelResponse {
  id: string;
  url?: string;
  name?: string;
  key?: string;
  category?: string;
  version?: number;
  metaInfo?: string;
  deploymentId?: string;
  tenantId?: string;
  createTime?: string | null;
  lastUpdateTime?: string | null;
  sourceUrl?: string;
  sourceExtraUrl?: string;
}

export interface ModelRequest {
  name?: string;
  key?: string;
  category?: string;
  version?: number;
  metaInfo?: string;
  deploymentId?: string;
  tenantId?: string;
}

export interface ModelQuery {
  start?: number;
  size?: number;
  sort?: "id" | "name" | "key" | "category" | "createTime" | "lastUpdateTime" | "version";
  order?: "asc" | "desc";
  nameLike?: string;
  key?: string;
  latestVersion?: boolean;
  tenantId?: string;
}

/**
 * TogetherFlow records the model's language in `category`, because the engine's model
 * table has no type column and the source bytes are opaque. Reading it back is what
 * lets the library open the right editor.
 */
export type ModelKind = "bpmn" | "dmn" | "cmmn" | "app" | "form" | "event";

export const MODEL_CATEGORY: Record<ModelKind, string> = {
  bpmn: "togetherflow:bpmn",
  dmn: "togetherflow:dmn",
  cmmn: "togetherflow:cmmn",
  app: "togetherflow:app",
  form: "togetherflow:form",
  event: "togetherflow:event",
};

export function modelKindOf(model: ModelResponse): ModelKind {
  if (model.category === MODEL_CATEGORY.dmn) return "dmn";
  if (model.category === MODEL_CATEGORY.cmmn) return "cmmn";
  if (model.category === MODEL_CATEGORY.app) return "app";
  if (model.category === MODEL_CATEGORY.form) return "form";
  if (model.category === MODEL_CATEGORY.event) return "event";
  return "bpmn";
}

export class ModelApi {
  constructor(
    private readonly client: ApiClient,
    /** DMN deployments go to their own servlet. */
    private readonly dmnClient?: ApiClient,
    /** CMMN likewise. */
    private readonly cmmnClient?: ApiClient,
  ) {}

  list(query: ModelQuery = {}, signal?: AbortSignal): Promise<DataResponse<ModelResponse>> {
    return this.client.request("/repository/models", {
      query: {
        size: 50,
        sort: "lastUpdateTime",
        order: "desc",
        ...query,
        tenantId: query.tenantId ?? this.client.tenantId,
      },
      signal,
    });
  }

  get(modelId: string, signal?: AbortSignal): Promise<ModelResponse> {
    return this.client.request(`/repository/models/${encodeURIComponent(modelId)}`, { signal });
  }

  create(request: ModelRequest): Promise<ModelResponse> {
    const tenantId = this.client.tenantId;
    return this.client.request("/repository/models", {
      method: "POST",
      body: tenantId ? { ...request, tenantId } : request,
    });
  }

  update(modelId: string, changes: ModelRequest): Promise<ModelResponse> {
    return this.client.request(`/repository/models/${encodeURIComponent(modelId)}`, {
      method: "PUT",
      body: changes,
    });
  }

  delete(modelId: string): Promise<void> {
    return this.client.request(`/repository/models/${encodeURIComponent(modelId)}`, {
      method: "DELETE",
    });
  }

  /**
   * Returns the stored source verbatim. 404 means the draft has no source yet.
   *
   * Read as text rather than letting the client sniff the body: app, form and event
   * drafts store JSON, which the default parser would hand back as an object — and
   * the draft would then read as empty, silently discarding saved work.
   */
  async getSource(modelId: string, signal?: AbortSignal): Promise<string | null> {
    try {
      const result = await this.client.request<string | undefined>(
        `/repository/models/${encodeURIComponent(modelId)}/source`,
        { signal, responseType: "text" },
      );
      return result ?? null;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      return null;
    }
  }

  /**
   * The source endpoint only accepts multipart, and takes the first file part
   * regardless of its field name.
   */
  saveSource(modelId: string, xml: string): Promise<void> {
    const form = new FormData();
    form.append("file", new Blob([xml], { type: "application/xml" }), "model.xml");
    return this.client.request(`/repository/models/${encodeURIComponent(modelId)}/source`, {
      method: "PUT",
      body: form,
    });
  }

  /**
   * Deploys authored XML.
   *
   * The engine decides how to read an upload from the file name, and falls back to
   * the multipart *field* name when the file name has no recognised suffix — so both
   * are set deliberately here. `.bpmn20.xml` is matched case-sensitively by the
   * engine, hence the exact casing. `deploymentName` is only honoured as a query
   * parameter, not as a form field.
   */
  async deploy(model: ModelResponse, xml: string): Promise<{ id: string }> {
    const kind = modelKindOf(model);
    if (kind === "app") {
      // Apps ship as a zip bundle via AppApi.deployBundle, not as a single resource.
      throw new Error("Apps are published from the app builder, not deployed as a file.");
    }
    if (kind === "event") {
      // Events and channels deploy through EventRegistryApi, one file per call.
      throw new Error("Events are deployed from the event editor.");
    }
    if (kind === "form") {
      // There is no form deployment endpoint; forms ship inside an app bundle.
      throw new Error("Forms are deployed by including them in an app.");
    }
    const baseName = (model.key || model.name || model.id).replace(/[^\w.-]+/g, "-");

    if (kind === "dmn") {
      if (!this.dmnClient) {
        throw new Error("DMN deployment requires the DMN API to be configured.");
      }
      const fileName = `${baseName}.dmn`;
      const form = new FormData();
      form.append(fileName, new Blob([xml], { type: "application/xml" }), fileName);
      return this.dmnClient.request("/dmn-repository/deployments", {
        method: "POST",
        query: { tenantId: this.dmnClient.tenantId },
        body: form,
      });
    }

    if (kind === "cmmn") {
      if (!this.cmmnClient) {
        throw new Error("Case deployment requires the CMMN API to be configured.");
      }
      // The engine accepts .cmmn or .cmmn.xml, matched case-sensitively.
      const fileName = `${baseName}.cmmn`;
      const form = new FormData();
      form.append(fileName, new Blob([xml], { type: "application/xml" }), fileName);
      return this.cmmnClient.request("/cmmn-repository/deployments", {
        method: "POST",
        query: { tenantId: this.cmmnClient.tenantId },
        body: form,
      });
    }

    const fileName = `${baseName}.bpmn20.xml`;
    const form = new FormData();
    form.append(fileName, new Blob([xml], { type: "application/xml" }), fileName);
    return this.client.request("/repository/deployments", {
      method: "POST",
      query: { deploymentName: model.name || baseName, tenantId: this.client.tenantId },
      body: form,
    });
  }
}
