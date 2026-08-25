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
 * 3. The model table **is versioned natively** — the query resource exposes `version`
 *    and `latestVersion`, and rows sharing a `key` form a version series. Version
 *    history (§7.4.1) is therefore built on the engine's own model, not on a side table:
 *    see `cutVersion` below.
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

/**
 * A deployment, plus the draft as it stands afterwards.
 *
 * Deploying cuts a version (§7.4.1), which bumps the draft's version number. The row
 * itself is unchanged, so an editor can carry on without re-importing — see `cutVersion`.
 * `draft` is absent when the version could not be recorded.
 */
export interface DeployResult {
  id: string;
  draft?: ModelResponse;
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
  /**
   * Every version of a model, newest first.
   *
   * Rows sharing a `key` are one series; the highest version is the working draft and
   * everything below it is history. Scoped by category as well as key so a form and a
   * process that happen to share a key are not mistaken for one another.
   */
  async listVersions(
    model: ModelResponse,
    signal?: AbortSignal,
  ): Promise<ModelResponse[]> {
    if (!model.key) return [model];
    const page = await this.list(
      { key: model.key, sort: "version", order: "desc", size: 100 },
      signal,
    );
    return page.data.filter((candidate) => candidate.category === model.category);
  }

  /**
   * Cuts a version: moves the working draft on to `version + 1` and writes the content
   * as it stands into a new row at the version just left behind. That row is history
   * from then on.
   *
   * Archives *backward* rather than copying forward. Copying the content into a new row
   * and treating that as the draft was the first design and reads more naturally, but it
   * changes the draft's id — which means the editor re-imports, and the user loses their
   * undo stack every time they deploy. Keeping the draft's id stable is worth the one
   * oddity this introduces: an archive row's `createTime` is the moment the version was
   * cut, not the moment its content was written. `version` is the field that carries the
   * ordering, and it is correct.
   *
   * Returns the updated draft — same id, new version number.
   */
  async cutVersion(model: ModelResponse, currentSource: string): Promise<ModelResponse> {
    const from = model.version ?? 1;
    // Move the draft first, so there is never a moment where two rows share a version.
    const draft = await this.update(model.id, { version: from + 1 });
    const archived = await this.create({
      name: model.name,
      key: model.key,
      category: model.category,
      version: from,
      metaInfo: model.metaInfo,
      tenantId: model.tenantId,
    });
    await this.saveSource(archived.id, currentSource);
    return draft;
  }

  /**
   * Restores an older version into the working draft.
   *
   * Cuts a version first, so the state being rolled back *from* becomes history rather
   * than being lost — a history that silently drops what you undid is worse than none.
   * Never rewrites or deletes an existing version.
   */
  async restoreVersion(
    current: ModelResponse,
    version: ModelResponse,
  ): Promise<ModelResponse> {
    const [restoring, currentSource] = await Promise.all([
      this.getSource(version.id),
      this.getSource(current.id),
    ]);
    const draft = await this.cutVersion(current, currentSource ?? "");
    await this.saveSource(current.id, restoring ?? "");
    return draft;
  }

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
  async deploy(model: ModelResponse, xml: string): Promise<DeployResult> {
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
      const deployment = await this.dmnClient.request<{ id: string }>(
        "/dmn-repository/deployments",
        { method: "POST", query: { tenantId: this.dmnClient.tenantId }, body: form },
      );
      return { ...deployment, draft: await this.cutVersionAfterDeploy(model, xml) };
    }

    if (kind === "cmmn") {
      if (!this.cmmnClient) {
        throw new Error("Case deployment requires the CMMN API to be configured.");
      }
      // The engine accepts .cmmn or .cmmn.xml, matched case-sensitively.
      const fileName = `${baseName}.cmmn`;
      const form = new FormData();
      form.append(fileName, new Blob([xml], { type: "application/xml" }), fileName);
      const deployment = await this.cmmnClient.request<{ id: string }>(
        "/cmmn-repository/deployments",
        { method: "POST", query: { tenantId: this.cmmnClient.tenantId }, body: form },
      );
      return { ...deployment, draft: await this.cutVersionAfterDeploy(model, xml) };
    }

    const fileName = `${baseName}.bpmn20.xml`;
    const form = new FormData();
    form.append(fileName, new Blob([xml], { type: "application/xml" }), fileName);
    const deployment = await this.client.request<{ id: string }>("/repository/deployments", {
      method: "POST",
      query: { deploymentName: model.name || baseName, tenantId: this.client.tenantId },
      body: form,
    });
    return { ...deployment, draft: await this.cutVersionAfterDeploy(model, xml) };
  }

  /**
   * Cuts a version once a deploy has succeeded — §7.4.1's "deployed models are immutable,
   * superseded by a new version instead".
   *
   * Failure here is swallowed on purpose. The deploy already happened and is what the
   * user asked for; turning a bookkeeping failure into a failed deploy would be a lie
   * about what the engine did. The caller gets `undefined` and keeps editing the row it
   * had, so the worst case is a missing history entry rather than a lost model.
   */
  private async cutVersionAfterDeploy(
    model: ModelResponse,
    source: string,
  ): Promise<ModelResponse | undefined> {
    try {
      return await this.cutVersion(model, source);
    } catch {
      return undefined;
    }
  }
}
