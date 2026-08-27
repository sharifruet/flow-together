/**
 * "Uses" and "Used by" between models (W2.3, UI_POLISH_BACKLOG.md I4).
 *
 * Derived by parsing stored sources, because the engine records no relationships: model
 * source is opaque bytes to it (see `ModelApi`'s own note), so there is nothing to query.
 * That makes this a *best-effort* index and the UI says so rather than presenting it as
 * authoritative.
 *
 * **What is honestly detectable**, and nothing beyond it:
 *
 * - BPMN `calledElement` on a call activity → the process it calls.
 * - BPMN/CMMN `decisionRef`/`decisionTaskRef` → a DMN decision by key.
 * - BPMN `formKey` and CMMN `formKey` → a form by key.
 * - CMMN `processRef` on a process task → a process by key.
 * - An app model's `modelIds` → the models it bundles, which is a real stored list.
 *
 * **What is not**, and is not guessed at: anything behind an expression. `calledElement`
 * is frequently `${targetProcess}`, and resolving that needs runtime values this screen
 * does not have. Those are skipped rather than reported as a reference to a model named
 * `${targetProcess}`.
 */

import { MODEL_CATEGORY, modelKindOf, type ModelResponse } from "@togetherflow/common";

export interface ModelReference {
  /** The `key` being referenced — not an id; sources reference by key. */
  key: string;
  /** What kind of model the reference expects, so a form key is not matched to a process. */
  expects: "bpmn" | "cmmn" | "dmn" | "form";
  /** Where in the source it was found, for explaining the link. */
  via: string;
}

/** True for a value that is an expression rather than a literal key. */
export function isExpression(value: string): boolean {
  return value.includes("${") || value.includes("#{");
}

const ATTRIBUTE_REFERENCES: { pattern: RegExp; expects: ModelReference["expects"]; via: string }[] = [
  { pattern: /calledElement\s*=\s*"([^"]+)"/g, expects: "bpmn", via: "calledElement" },
  { pattern: /decisionRef\s*=\s*"([^"]+)"/g, expects: "dmn", via: "decisionRef" },
  { pattern: /decisionTaskRef\s*=\s*"([^"]+)"/g, expects: "dmn", via: "decisionTaskRef" },
  { pattern: /processRef\s*=\s*"([^"]+)"/g, expects: "bpmn", via: "processRef" },
  { pattern: /caseRef\s*=\s*"([^"]+)"/g, expects: "cmmn", via: "caseRef" },
  { pattern: /formKey\s*=\s*"([^"]+)"/g, expects: "form", via: "formKey" },
];

/**
 * Reads the references out of one model's source.
 *
 * Regex rather than a parser, deliberately. The alternative is importing the BPMN and
 * CMMN moddles into the library screen — the two heaviest chunks in the app — to read six
 * attributes, and the library is the first thing anyone sees. The cost of being
 * approximate here is a missed or spurious link in a panel that already says it is
 * best-effort; the cost of the parser is the library screen loading two canvas engines.
 */
export function referencesIn(model: ModelResponse, source: string | null): ModelReference[] {
  if (!source) return [];
  const kind = modelKindOf(model);

  if (kind === "app") {
    // An app's model list is a stored array of *ids*, not keys — the one exact case.
    try {
      const draft = JSON.parse(source) as { modelIds?: unknown };
      if (!Array.isArray(draft.modelIds)) return [];
      return draft.modelIds
        .filter((id): id is string => typeof id === "string")
        .map((id) => ({ key: id, expects: "bpmn", via: "app" }));
    } catch {
      return [];
    }
  }

  if (kind === "form" || kind === "event") return [];

  const found = new Map<string, ModelReference>();
  for (const { pattern, expects, via } of ATTRIBUTE_REFERENCES) {
    // A fresh regex each pass: /g patterns carry lastIndex between calls.
    const scan = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = scan.exec(source)) !== null) {
      const value = match[1].trim();
      if (!value || isExpression(value)) continue;
      const dedupe = `${expects}:${value}`;
      if (!found.has(dedupe)) found.set(dedupe, { key: value, expects, via });
    }
  }
  return [...found.values()];
}

const EXPECTED_CATEGORY: Record<ModelReference["expects"], string> = {
  bpmn: MODEL_CATEGORY.bpmn,
  cmmn: MODEL_CATEGORY.cmmn,
  dmn: MODEL_CATEGORY.dmn,
  form: MODEL_CATEGORY.form,
};

/**
 * Matches a reference to a model in the library.
 *
 * An app's entries are ids and everything else is a key, so both are tried. A reference
 * that matches nothing is a real answer — it usually means the target has not been
 * created yet — and is reported rather than dropped.
 */
export function resolveReference(
  reference: ModelReference,
  candidates: ModelResponse[],
): ModelResponse | undefined {
  if (reference.via === "app") {
    return candidates.find((candidate) => candidate.id === reference.key);
  }
  return candidates.find(
    (candidate) =>
      candidate.key === reference.key &&
      // A form and a process may legitimately share a key; the attribute says which.
      candidate.category === EXPECTED_CATEGORY[reference.expects],
  );
}

export interface RelationIndex {
  /** modelId → the models it references. */
  uses: Map<string, ModelResponse[]>;
  /** modelId → the models that reference it. */
  usedBy: Map<string, ModelResponse[]>;
  /** References that matched no model, keyed by the model that made them. */
  unresolved: Map<string, ModelReference[]>;
}

/** Builds both directions in one pass over `(model, source)` pairs. */
export function buildRelationIndex(
  entries: { model: ModelResponse; source: string | null }[],
): RelationIndex {
  const models = entries.map((entry) => entry.model);
  const uses = new Map<string, ModelResponse[]>();
  const usedBy = new Map<string, ModelResponse[]>();
  const unresolved = new Map<string, ModelReference[]>();

  for (const { model, source } of entries) {
    for (const reference of referencesIn(model, source)) {
      const target = resolveReference(reference, models);
      if (!target) {
        unresolved.set(model.id, [...(unresolved.get(model.id) ?? []), reference]);
        continue;
      }
      // A model referencing itself — a recursive call activity — is real but not a
      // useful thing to list under "uses".
      if (target.id === model.id) continue;
      uses.set(model.id, [...(uses.get(model.id) ?? []), target]);
      usedBy.set(target.id, [...(usedBy.get(target.id) ?? []), model]);
    }
  }
  return { uses, usedBy, unresolved };
}
