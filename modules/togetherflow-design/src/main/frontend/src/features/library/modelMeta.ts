/**
 * What TogetherFlow stores in a model's `metaInfo` (W2.3, UI_POLISH_BACKLOG.md I5, I9).
 *
 * `metaInfo` is a free-text column the engine never reads, which makes it the only place
 * to put per-model UI state without an engine change. `category` is already spent on the
 * model kind and `tenantId` on tenancy, so this is what is left — and the plan's E0.3
 * warns against leaning on the same trick for *workspaces*, where the lack of server-side
 * enforcement would matter. Templates and tags are cosmetic; a workspace is not.
 *
 * Written as JSON with a version marker so a later shape change can be recognised rather
 * than guessed at. Anything unparseable is treated as absent — `metaInfo` may hold
 * whatever a previous tool put there, and a library screen must not break on it.
 */

import type { ModelResponse } from "@togetherflow/common";

export interface ModelMeta {
  /** Offered in the create dialog as a starting point (I5). */
  template?: boolean;
  /** Free-text tags for the library's grouping and filtering (I9). */
  tags?: string[];
  /** One-line summary, shown on the library card. */
  description?: string;
}

interface StoredMeta extends ModelMeta {
  tfMeta: 1;
}

export function readMeta(model: ModelResponse): ModelMeta {
  if (!model.metaInfo) return {};
  try {
    const parsed: unknown = JSON.parse(model.metaInfo);
    if (typeof parsed !== "object" || parsed === null) return {};
    const meta = parsed as Partial<StoredMeta>;
    return {
      template: meta.template === true,
      tags: Array.isArray(meta.tags) ? meta.tags.filter((tag) => typeof tag === "string") : undefined,
      description: typeof meta.description === "string" ? meta.description : undefined,
    };
  } catch {
    // Not ours, or not JSON. Either way there is nothing to read.
    return {};
  }
}

/**
 * Merges a patch into a model's stored meta.
 *
 * Returns `undefined` when nothing is left, so a model that had its last tag removed goes
 * back to a null `metaInfo` rather than carrying `{"tfMeta":1}` forever.
 */
export function writeMeta(model: ModelResponse, patch: ModelMeta): string | undefined {
  const merged: ModelMeta = { ...readMeta(model), ...patch };
  const cleaned: ModelMeta = {
    ...(merged.template ? { template: true } : {}),
    ...(merged.tags && merged.tags.length > 0 ? { tags: merged.tags } : {}),
    ...(merged.description ? { description: merged.description } : {}),
  };
  if (Object.keys(cleaned).length === 0) return undefined;
  return JSON.stringify({ tfMeta: 1, ...cleaned } satisfies StoredMeta);
}

/** Every distinct tag across a set of models, sorted — the library's filter list. */
export function collectTags(models: ModelResponse[]): string[] {
  const tags = new Set<string>();
  for (const model of models) {
    for (const tag of readMeta(model).tags ?? []) tags.add(tag);
  }
  return [...tags].sort((a, b) => a.localeCompare(b));
}
