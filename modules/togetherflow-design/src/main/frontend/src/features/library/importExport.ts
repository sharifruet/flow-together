/**
 * Importing and exporting models (REQUIREMENTS.md §7.4.1).
 *
 * The library stores every model type as opaque bytes in one repository, so import and
 * export are really one question: which kind is this file, and what should it be called
 * on disk? Both answers come from the file name and content, not from asking the user —
 * a `.bpmn20.xml` file is unambiguous and making someone classify it would be busywork.
 */

import { MODEL_CATEGORY, type ModelKind, type ModelResponse } from "@togetherflow/common";

/** Extensions offered in the file picker, matching what the engines accept. */
export const IMPORT_ACCEPT = ".bpmn,.bpmn20.xml,.xml,.cmmn,.cmmn.xml,.dmn,.dmn.xml,.form,.event,.channel,.json";

/**
 * Works out which model type a file holds.
 *
 * The extension decides where it is unambiguous. `.xml` and `.json` are not, so the
 * content is sniffed — a BPMN file has a `<definitions>` root in the BPMN namespace, a
 * CMMN file has one in the CMMN namespace, and a form's JSON has a `fields` array while
 * an event's has `payload`. Returning `undefined` means "cannot tell", which the caller
 * reports rather than guessing wrong and creating an undeployable draft.
 */
export function detectKind(fileName: string, content: string): ModelKind | undefined {
  const name = fileName.toLowerCase();

  if (name.endsWith(".bpmn") || name.endsWith(".bpmn20.xml")) return "bpmn";
  if (name.endsWith(".cmmn") || name.endsWith(".cmmn.xml")) return "cmmn";
  if (name.endsWith(".dmn") || name.endsWith(".dmn.xml")) return "dmn";
  if (name.endsWith(".form")) return "form";
  if (name.endsWith(".event") || name.endsWith(".channel")) return "event";

  const head = content.slice(0, 4000);
  if (head.includes("http://www.omg.org/spec/CMMN/")) return "cmmn";
  if (head.includes("http://www.omg.org/spec/DMN/")) return "dmn";
  if (head.includes("http://www.omg.org/spec/BPMN/")) return "bpmn";

  if (name.endsWith(".json") || head.trimStart().startsWith("{")) {
    try {
      const parsed = JSON.parse(content) as Record<string, unknown>;
      if (Array.isArray(parsed.fields)) return "form";
      if (Array.isArray(parsed.payload) || parsed.channelType) return "event";
      if (Array.isArray(parsed.modelIds)) return "app";
    } catch {
      // Not JSON after all; fall through to "cannot tell".
    }
  }
  return undefined;
}

/** File name a model is exported as, carrying the suffix its engine recognises. */
export function exportFileName(kind: ModelKind, key: string): string {
  const base = (key || "model").replace(/[^\w.-]+/g, "-");
  switch (kind) {
    case "cmmn":
      return `${base}.cmmn`;
    case "dmn":
      return `${base}.dmn`;
    case "form":
      return `${base}.form`;
    case "event":
      return `${base}.event`;
    case "app":
      return `${base}.app`;
    default:
      return `${base}.bpmn20.xml`;
  }
}

export function mimeFor(kind: ModelKind): string {
  return kind === "form" || kind === "event" || kind === "app" ? "application/json" : "application/xml";
}

/**
 * Pulls a name and key out of an imported file so the draft is not called
 * "orderProcess.bpmn20.xml".
 *
 * XML models carry them as attributes on the first `process`/`case`/`decision` element;
 * JSON models carry them as top-level properties. Falling back to the file name is
 * always safe.
 */
export function describeImport(
  fileName: string,
  content: string,
  kind: ModelKind,
): { name: string; key: string } {
  const fallbackKey = fileName
    .replace(/\.(bpmn20\.xml|cmmn\.xml|dmn\.xml|bpmn|cmmn|dmn|form|event|channel|json|xml|app)$/i, "")
    .replace(/[^\w.-]+/g, "");
  const fallback = { name: fallbackKey || fileName, key: fallbackKey || "imported" };

  if (kind === "form" || kind === "event" || kind === "app") {
    try {
      const parsed = JSON.parse(content) as { key?: string; name?: string; event?: { key?: string; name?: string } };
      const source = parsed.event ?? parsed;
      return {
        name: source.name ?? fallback.name,
        key: source.key ?? fallback.key,
      };
    } catch {
      return fallback;
    }
  }

  const element = kind === "cmmn" ? "case" : kind === "dmn" ? "decision" : "process";
  const match = new RegExp(`<(?:\\w+:)?${element}\\b[^>]*>`, "i").exec(content);
  if (!match) return fallback;
  const id = /\bid="([^"]+)"/i.exec(match[0])?.[1];
  const name = /\bname="([^"]+)"/i.exec(match[0])?.[1];
  return { name: name ?? id ?? fallback.name, key: id ?? fallback.key };
}

/** The category a draft of this kind is filed under. */
export function categoryFor(kind: ModelKind): string {
  return MODEL_CATEGORY[kind];
}

/**
 * Hands the browser a file to save.
 *
 * The object URL is revoked on the next turn of the event loop rather than immediately:
 * revoking synchronously can cancel the download in some browsers before it starts.
 */
export function downloadFile(fileName: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function exportModel(model: ModelResponse, kind: ModelKind, source: string): void {
  downloadFile(exportFileName(kind, model.key ?? model.id), source, mimeFor(kind));
}
