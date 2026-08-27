/**
 * Model relations (W2.3, I4).
 *
 * The derivation is best-effort by necessity — the engine stores model source as opaque
 * bytes, so there is nothing to query and the references have to be read out of the text.
 * What is pinned here is that the approximation is honest: expressions are skipped rather
 * than reported as a model named `${x}`, a form key is not matched to a process that
 * shares it, and an unmatched reference is surfaced rather than dropped.
 */

import { describe, expect, it } from "vitest";
import { MODEL_CATEGORY, type ModelResponse } from "@togetherflow/common";
import { buildRelationIndex, isExpression, referencesIn, resolveReference } from "./modelRelations";

const model = (over: Partial<ModelResponse> = {}): ModelResponse => ({
  id: "m1",
  key: "invoice",
  name: "Invoice",
  category: MODEL_CATEGORY.bpmn,
  ...over,
});

describe("referencesIn", () => {
  it("finds a called process", () => {
    const source = '<callActivity id="c1" calledElement="subProcess" />';
    expect(referencesIn(model(), source)).toEqual([
      { key: "subProcess", expects: "bpmn", via: "calledElement" },
    ]);
  });

  it("finds a decision and a form", () => {
    const source =
      '<serviceTask flowable:decisionRef="discounts" /><userTask flowable:formKey="approval" />';
    expect(referencesIn(model(), source)).toEqual([
      { key: "discounts", expects: "dmn", via: "decisionRef" },
      { key: "approval", expects: "form", via: "formKey" },
    ]);
  });

  it("skips an expression rather than inventing a model named after it", () => {
    // `calledElement="${target}"` is common and resolving it needs runtime values.
    const source = '<callActivity calledElement="${target}" /><callActivity calledElement="#{other}" />';
    expect(referencesIn(model(), source)).toEqual([]);
  });

  it("deduplicates the same target referenced twice", () => {
    const source =
      '<callActivity calledElement="sub" /><callActivity calledElement="sub" />';
    expect(referencesIn(model(), source)).toHaveLength(1);
  });

  it("reads an app's bundled model ids, which are ids and not keys", () => {
    const app = model({ category: MODEL_CATEGORY.app });
    expect(referencesIn(app, JSON.stringify({ modelIds: ["m2", "m3"] }))).toEqual([
      { key: "m2", expects: "bpmn", via: "app" },
      { key: "m3", expects: "bpmn", via: "app" },
    ]);
  });

  it("survives an app whose source is not valid JSON", () => {
    const app = model({ category: MODEL_CATEGORY.app });
    expect(referencesIn(app, "{ not json")).toEqual([]);
  });

  it("returns nothing for a model with no source", () => {
    expect(referencesIn(model(), null)).toEqual([]);
  });
});

describe("resolveReference", () => {
  const form = model({ id: "f1", key: "shared", category: MODEL_CATEGORY.form });
  const process = model({ id: "p1", key: "shared", category: MODEL_CATEGORY.bpmn });

  it("does not match a form key to a process that shares it", () => {
    // A form and a process may legitimately share a key; the attribute decides which.
    expect(resolveReference({ key: "shared", expects: "form", via: "formKey" }, [form, process])).toBe(
      form,
    );
    expect(
      resolveReference({ key: "shared", expects: "bpmn", via: "calledElement" }, [form, process]),
    ).toBe(process);
  });

  it("matches an app entry by id, not key", () => {
    expect(resolveReference({ key: "p1", expects: "bpmn", via: "app" }, [form, process])).toBe(process);
  });

  it("answers undefined for a target that does not exist yet", () => {
    expect(resolveReference({ key: "nope", expects: "bpmn", via: "calledElement" }, [process])).toBeUndefined();
  });
});

describe("buildRelationIndex", () => {
  const parent = model({ id: "p", key: "parent" });
  const child = model({ id: "c", key: "child" });

  it("records both directions", () => {
    const index = buildRelationIndex([
      { model: parent, source: '<callActivity calledElement="child" />' },
      { model: child, source: null },
    ]);
    expect(index.uses.get("p")).toEqual([child]);
    expect(index.usedBy.get("c")).toEqual([parent]);
  });

  it("reports a reference that matches nothing rather than dropping it", () => {
    const index = buildRelationIndex([
      { model: parent, source: '<callActivity calledElement="missing" />' },
    ]);
    expect(index.uses.get("p")).toBeUndefined();
    expect(index.unresolved.get("p")).toEqual([
      { key: "missing", expects: "bpmn", via: "calledElement" },
    ]);
  });

  it("does not list a recursive model as using itself", () => {
    const index = buildRelationIndex([
      { model: parent, source: '<callActivity calledElement="parent" />' },
    ]);
    expect(index.uses.get("p")).toBeUndefined();
  });
});

describe("isExpression", () => {
  it("recognises both expression syntaxes the engine accepts", () => {
    expect(isExpression("${a}")).toBe(true);
    expect(isExpression("#{a}")).toBe(true);
    expect(isExpression("plain")).toBe(false);
  });
});
