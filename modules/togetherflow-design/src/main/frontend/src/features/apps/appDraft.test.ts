import { describe, expect, it } from "vitest";
import type { ModelResponse } from "@togetherflow/common";
import { emptyAppDraft, parseAppDraft } from "./appDraft";

const model: ModelResponse = { id: "m1", name: "Onboarding App", key: "onboardingApp" };

describe("emptyAppDraft", () => {
  it("starts with no bundled models", () => {
    expect(emptyAppDraft("k", "N")).toEqual({ key: "k", name: "N", modelIds: [] });
  });
});

describe("parseAppDraft", () => {
  it("reads a saved draft", () => {
    const draft = parseAppDraft(
      JSON.stringify({ key: "app1", name: "App One", icon: "glyphicon-cog", modelIds: ["a", "b"] }),
      model,
    );
    expect(draft).toEqual({
      key: "app1",
      name: "App One",
      description: undefined,
      theme: undefined,
      icon: "glyphicon-cog",
      modelIds: ["a", "b"],
    });
  });

  it("falls back to the model's own name and key when there is no source yet", () => {
    const draft = parseAppDraft(null, model);
    expect(draft.key).toBe("onboardingApp");
    expect(draft.name).toBe("Onboarding App");
    expect(draft.modelIds).toEqual([]);
  });

  it("recovers from a malformed draft rather than throwing", () => {
    const draft = parseAppDraft("{not json", model);
    expect(draft.key).toBe("onboardingApp");
    expect(draft.modelIds).toEqual([]);
  });

  it("coerces a non-array modelIds to an empty list", () => {
    const draft = parseAppDraft(JSON.stringify({ key: "k", name: "n", modelIds: "oops" }), model);
    expect(draft.modelIds).toEqual([]);
  });
});
