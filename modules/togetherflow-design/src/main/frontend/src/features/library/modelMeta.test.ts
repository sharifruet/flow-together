/**
 * `metaInfo` round-tripping (W2.3, I5/I9).
 *
 * `metaInfo` is a free-text column that may hold whatever a previous tool put there, so
 * what matters is that reading it never throws and writing it never silently discards
 * another key's value.
 */

import { describe, expect, it } from "vitest";
import type { ModelResponse } from "@togetherflow/common";
import { collectTags, readMeta, writeMeta } from "./modelMeta";

const model = (metaInfo?: string): ModelResponse => ({ id: "m1", metaInfo });

describe("readMeta", () => {
  it("reads what writeMeta wrote", () => {
    const stored = writeMeta(model(), { template: true, tags: ["finance"], description: "x" });
    expect(readMeta(model(stored))).toEqual({
      template: true,
      tags: ["finance"],
      description: "x",
    });
  });

  it("treats absent, empty and unparseable metaInfo as no meta", () => {
    expect(readMeta(model())).toEqual({});
    expect(readMeta(model(""))).toEqual({});
    // A previous tool's content, or plain prose. Must not throw.
    expect(readMeta(model("not json at all"))).toEqual({});
    expect(readMeta(model("[1,2,3]")).template).toBeFalsy();
  });

  it("ignores values of the wrong type rather than trusting them", () => {
    const meta = readMeta(model(JSON.stringify({ tfMeta: 1, tags: "finance", template: "yes" })));
    expect(meta.tags).toBeUndefined();
    // Only a real boolean true marks a template; a truthy string does not.
    expect(meta.template).toBe(false);
  });
});

describe("writeMeta", () => {
  it("merges rather than replacing", () => {
    const first = writeMeta(model(), { tags: ["a"] });
    const second = writeMeta(model(first), { template: true });
    expect(readMeta(model(second))).toEqual({ template: true, tags: ["a"] });
  });

  it("returns undefined when nothing is left, so metaInfo goes back to null", () => {
    const withTag = writeMeta(model(), { tags: ["a"] });
    expect(writeMeta(model(withTag), { tags: [] })).toBeUndefined();
  });

  it("omits a false template rather than storing it", () => {
    expect(writeMeta(model(), { template: false })).toBeUndefined();
  });
});

describe("collectTags", () => {
  it("returns every distinct tag, sorted", () => {
    const a = model(writeMeta(model(), { tags: ["ops", "finance"] }));
    const b = model(writeMeta(model(), { tags: ["finance"] }));
    expect(collectTags([a, b, model()])).toEqual(["finance", "ops"]);
  });
});
