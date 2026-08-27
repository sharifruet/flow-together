/**
 * Exporting and importing an app as a ZIP (W2.3, UI_POLISH_BACKLOG.md I6).
 *
 * Enterprise exports an app and everything it bundles as one archive, and imports it back
 * with clash handling. Ours could publish a bundle to the *engine* — `AppBuilder` already
 * zips one for `deployBundle` — but could not hand a file to a person, which is what
 * moving an app between environments actually needs.
 *
 * The archive is deliberately **not** the engine's deployment bundle. That one is shaped
 * for the app engine and carries no keys, versions or draft metadata, so importing it
 * would lose exactly what an author cares about. This one carries a manifest plus each
 * model's own source, which is what makes the round trip lossless.
 */

import { strToU8, strFromU8, unzipSync, zipSync } from "fflate";
import { MODEL_CATEGORY, modelKindOf, type ModelKind, type ModelResponse } from "@togetherflow/common";
import { exportFileName } from "../library/importExport";

/** Bumped only on a breaking change; `importApp` refuses a version it does not know. */
export const PACKAGE_VERSION = 1;

const MANIFEST = "togetherflow-app.json";

export interface PackagedModel {
  key: string;
  name: string;
  kind: ModelKind;
  /** Path of the model's source inside the archive. */
  file: string;
  /** The original id, used only to rebuild the app's `modelIds` on import. */
  originalId: string;
}

export interface AppManifest {
  tfAppPackage: number;
  app: { key: string; name: string; description?: string };
  models: PackagedModel[];
  exportedAt: string;
}

export interface AppPackageInput {
  app: ModelResponse;
  appSource: string;
  /** Each bundled model with its source; a model whose source failed to load is omitted. */
  models: { model: ModelResponse; source: string }[];
}

export function exportApp({ app, appSource, models }: AppPackageInput): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  const packaged: PackagedModel[] = [];

  for (const { model, source } of models) {
    const kind = modelKindOf(model);
    const key = model.key || model.id;
    // Prefixed by kind so two models of different kinds sharing a key cannot collide
    // inside the archive — which the *engine's* bundle format cannot express.
    const file = `models/${kind}/${exportFileName(kind, key)}`;
    files[file] = strToU8(source);
    packaged.push({ key, name: model.name || key, kind, file, originalId: model.id });
  }

  files[`app/${app.key || app.id}.json`] = strToU8(appSource);
  const manifest: AppManifest = {
    tfAppPackage: PACKAGE_VERSION,
    app: { key: app.key || app.id, name: app.name || app.id },
    models: packaged,
    // Stamped by the caller's clock; only ever shown to a human, never compared.
    exportedAt: new Date().toISOString(),
  };
  files[MANIFEST] = strToU8(JSON.stringify(manifest, null, 2));

  return zipSync(files);
}

export interface ReadPackage {
  manifest: AppManifest;
  appSource: string;
  sources: Map<string, string>;
}

export function readAppPackage(bytes: Uint8Array): ReadPackage {
  const entries = unzipSync(bytes);
  const manifestBytes = entries[MANIFEST];
  if (!manifestBytes) {
    throw new Error("package.notAnApp");
  }
  const manifest = JSON.parse(strFromU8(manifestBytes)) as AppManifest;
  if (manifest.tfAppPackage !== PACKAGE_VERSION) {
    // A newer archive may carry fields this build would silently drop on re-export.
    throw new Error("package.wrongVersion");
  }

  const appEntry = Object.keys(entries).find((name) => name.startsWith("app/"));
  const sources = new Map<string, string>();
  for (const packaged of manifest.models) {
    const raw = entries[packaged.file];
    if (raw) sources.set(packaged.key, strFromU8(raw));
  }
  return {
    manifest,
    appSource: appEntry ? strFromU8(entries[appEntry]) : "{}",
    sources,
  };
}

/** What to do about a key already present in the target environment (I6). */
export type ClashStrategy =
  /** Refuse the whole import. The default: an import that half-applied is worse. */
  | "stop"
  /** Overwrite the existing model's source, keeping its id and version series. */
  | "update"
  /** Import under a new key, leaving the existing model untouched. */
  | "rename";

export interface Clash {
  key: string;
  kind: ModelKind;
  existing: ModelResponse;
}

const CATEGORY_FOR: Record<ModelKind, string> = MODEL_CATEGORY;

/**
 * Which packaged models already exist here.
 *
 * Matched on key *and* kind, for the same reason `resolveReference` does: a form and a
 * process may legitimately share a key, and treating that as a clash would block an
 * import that has no actual conflict.
 */
export function findClashes(manifest: AppManifest, existing: ModelResponse[]): Clash[] {
  const clashes: Clash[] = [];
  for (const packaged of manifest.models) {
    const match = existing.find(
      (candidate) =>
        candidate.key === packaged.key && candidate.category === CATEGORY_FOR[packaged.kind],
    );
    if (match) clashes.push({ key: packaged.key, kind: packaged.kind, existing: match });
  }
  return clashes;
}

/**
 * The key an imported model should take under a given strategy.
 *
 * `rename` appends a numeric suffix rather than a timestamp: a person has to read it, and
 * `invoice_2` says what happened where `invoice_1738271` does not.
 */
export function keyFor(
  packaged: PackagedModel,
  strategy: ClashStrategy,
  existing: ModelResponse[],
): string {
  if (strategy !== "rename") return packaged.key;
  const taken = new Set(
    existing
      .filter((candidate) => candidate.category === CATEGORY_FOR[packaged.kind])
      .map((candidate) => candidate.key),
  );
  let suffix = 2;
  while (taken.has(`${packaged.key}_${suffix}`)) suffix += 1;
  return `${packaged.key}_${suffix}`;
}
