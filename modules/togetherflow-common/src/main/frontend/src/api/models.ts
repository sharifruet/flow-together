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

/**
 * A save was refused because the stored source changed since this editor last read or
 * wrote it — i.e. somebody else saved in between (UI_POLISH_BACKLOG.md I1).
 *
 * `storedSource` is what is on the server right now, so a caller offering "reload" does
 * not have to fetch it a second time.
 */
export class ConcurrentEditError extends Error {
  readonly modelId: string;
  readonly storedSource: string | null;

  constructor(modelId: string, storedSource: string | null) {
    super(`Model ${modelId} was changed by someone else since it was opened.`);
    this.name = "ConcurrentEditError";
    this.modelId = modelId;
    this.storedSource = storedSource;
  }
}

/**
 * What this browser believes is on the server, per model id.
 *
 * Module-level rather than an instance field on purpose. `ModelApi` is rebuilt by
 * `useMemo` whenever the tenant, the auth headers or the translator change, and a
 * baseline held on the instance would be discarded with it — which would silently
 * disable the guard at exactly the moments a session is most in flux. One browser tab is
 * one editor, so a module-level map is the right lifetime.
 *
 * A model with no entry is unguarded by design: nothing has been read, so there is no
 * "since" to compare against, and refusing the first write of a freshly created row
 * would break `create` → `saveSource`.
 */
const sourceBaselines = new Map<string, string>();

/** Test seam. Never call from app code — the baselines are per-tab session state. */
export function __resetSourceBaselines(): void {
  sourceBaselines.clear();
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
      // Reading establishes the baseline the concurrent-edit guard compares against.
      sourceBaselines.set(modelId, result ?? "");
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
    /*
     * `overwrite`, because the row was created two lines ago: there is nothing to
     * concurrently edit, and this is the one write in the API that is provably safe.
     * Relying on "a new id has no baseline" would work today and break the moment an id
     * is reused — which is exactly what the version tests do.
     */
    await this.saveSource(archived.id, currentSource, { overwrite: true });
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

  /**
   * Writes the source, refusing to clobber somebody else's save (I1).
   *
   * The editors autosave after four idle seconds, and this endpoint is an unconditional
   * PUT, so two people on one model used to overwrite each other repeatedly without
   * either pressing Save. The guard reads what is stored and compares it with what this
   * browser last read or wrote; a difference means someone saved in between, and the
   * write is refused with `ConcurrentEditError` so the caller can offer reload-or-overwrite.
   *
   * **Detect by comparing the source, not by `lastUpdateTime`.** The timestamp does not
   * work: `ModelEntityManagerImpl.insertEditorSourceForModel` calls `updateModel` only
   * when `editorSourceValueId` is null — i.e. on the very first save. Every later source
   * save rewrites the byte array and never touches the `ACT_RE_MODEL` row, so
   * `lastUpdateTime` is frozen from the second save onward.
   *
   * This narrows the window rather than closing it: the read and the write are two
   * requests, so a save landing between them is still lost. Closing it needs a
   * server-side precondition — the model locking in ENTERPRISE_PARITY_PLAN.md W3.1.
   */
  async saveSource(
    modelId: string,
    xml: string,
    options: { overwrite?: boolean } = {},
  ): Promise<void> {
    const baseline = sourceBaselines.get(modelId);
    if (!options.overwrite && baseline !== undefined) {
      const stored = await this.readSourceForGuard(modelId);
      // `undefined` means the check itself failed. A save is not blocked because the
      // guard could not run — that would turn a transient read error into lost work.
      if (stored !== undefined && stored !== baseline) {
        throw new ConcurrentEditError(modelId, stored === "" ? null : stored);
      }
    }

    const form = new FormData();
    form.append("file", new Blob([xml], { type: "application/xml" }), "model.xml");
    await this.client.request(`/repository/models/${encodeURIComponent(modelId)}/source`, {
      method: "PUT",
      body: form,
    });
    // What was just written is the new baseline, so the next autosave compares against
    // this save rather than against whatever was on screen when the editor opened.
    sourceBaselines.set(modelId, xml);
  }

  /**
   * The guard's read. Distinct from `getSource` in two ways that matter: it does not
   * move the baseline (that would defeat the comparison it is about to make), and it
   * reports a failed read as `undefined` rather than flattening it to `null` — which
   * `getSource` does, and which here would be indistinguishable from "the source was
   * deleted" and would refuse every save on a flaky connection.
   */
  private async readSourceForGuard(modelId: string): Promise<string | undefined> {
    try {
      const result = await this.client.request<string | undefined>(
        `/repository/models/${encodeURIComponent(modelId)}/source`,
        { responseType: "text" },
      );
      return result ?? "";
    } catch {
      return undefined;
    }
  }

  /**
   * Declares what this browser believes is stored, without a round trip.
   *
   * An editor that has just written through some other path — a bulk import, a restore —
   * calls this so the next autosave is not refused against a stale baseline.
   */
  trackSource(modelId: string, source: string): void {
    sourceBaselines.set(modelId, source);
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

/* ── Server-side model validation (§7.4.2) ───────────────────────────────── */

/**
 * One problem reported by the engine's own validator.
 *
 * Mirrors both `ValidationErrorResponse` (BPMN, `flowable-process-validation`) and
 * `CaseValidationEntryResponse` (CMMN, `flowable-case-validation`). The two differ only in
 * what they call the offending element — `activityId`/`activityName` versus
 * `itemId`/`itemName` — so both are optional here and `elementIdOf` picks whichever came back.
 */
export interface ServerValidationProblem {
  /** Stable identifier for the problem; prefer it over `defaultDescription` when matching. */
  problem?: string;
  /** English only. The engine has no translated catalogue for these. */
  defaultDescription?: string;
  validatorSetName?: string;
  activityId?: string;
  activityName?: string;
  itemId?: string;
  itemName?: string;
  xmlLineNumber?: number;
  xmlColumnNumber?: number;
  /** A warning does not block deployment; an error does. */
  warning?: boolean;
}

export interface ServerValidationResult {
  /** True when nothing but warnings was reported — i.e. the model would deploy. */
  valid: boolean;
  errorCount: number;
  warningCount: number;
  errors: ServerValidationProblem[];
}

/** The element a problem is attached to, whichever engine reported it. */
export function elementIdOf(problem: ServerValidationProblem): string | undefined {
  return problem.activityId ?? problem.itemId;
}

/**
 * Runs the engine's own validators over authored XML without deploying it.
 *
 * The point is that this is not an approximation: `POST /repository/model-validation` and
 * `POST /cmmn-repository/model-validation` run the very `ProcessValidator` / `CaseValidator`
 * a deployment runs, so a model this call passes is a model the engine accepts. The
 * client-side checks in Design remain useful for instant feedback while typing and for the
 * mistakes that produce a confusing engine message, but they are no longer the last word.
 *
 * Nothing is persisted by either endpoint, which is why the call opts into retry despite
 * being a POST.
 */
export class ModelValidationApi {
  constructor(
    private readonly client: ApiClient,
    /** CMMN validation lives behind the CMMN servlet. */
    private readonly cmmnClient?: ApiClient,
  ) {}

  validateBpmn(xml: string, signal?: AbortSignal): Promise<ServerValidationResult> {
    return this.post(this.client, "/repository/model-validation", xml, signal);
  }

  /** Rejects when Design was built without a CMMN client, rather than posting BPMN's path. */
  validateCmmn(xml: string, signal?: AbortSignal): Promise<ServerValidationResult> {
    if (!this.cmmnClient) {
      return Promise.reject(new Error("No CMMN API is configured, so case models cannot be validated."));
    }
    return this.post(this.cmmnClient, "/cmmn-repository/model-validation", xml, signal);
  }

  private post(
    client: ApiClient,
    path: string,
    xml: string,
    signal?: AbortSignal,
  ): Promise<ServerValidationResult> {
    return client.request(path, {
      method: "POST",
      // Sent verbatim: the endpoints take the XML itself as the body, not a JSON envelope.
      // The charset is explicit so the server decodes UTF-8 rather than falling back.
      contentType: "application/xml;charset=UTF-8",
      body: xml,
      // Safe to replay: validation reads the body and writes nothing.
      retry: true,
      signal,
    });
  }
}
