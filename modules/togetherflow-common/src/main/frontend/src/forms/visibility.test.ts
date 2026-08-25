import { describe, expect, it } from "vitest";
import type { FormField, FormModelResponse } from "../api/types";
import { validateForm } from "./formModel";
import {
  getVisibilityRule,
  hiddenFieldIds,
  isFieldVisible,
  withVisibilityRule,
} from "./visibility";

const base: FormField = { id: "notes", name: "Notes", type: "text" };

const withRule = (rule: Parameters<typeof withVisibilityRule>[1]) =>
  withVisibilityRule(base, rule);

describe("withVisibilityRule / getVisibilityRule", () => {
  it("round-trips a rule through the engine's params map", () => {
    const field = withRule({ field: "reason", operator: "equals", value: "other" });
    expect(field.params?.tfVisibleWhen).toEqual({
      field: "reason",
      operator: "equals",
      value: "other",
    });
    expect(getVisibilityRule(field)).toEqual({
      field: "reason",
      operator: "equals",
      value: "other",
    });
  });

  /** A field with no rule must not carry an empty params object into the deployment. */
  it("removes params entirely when the rule is cleared", () => {
    const field = withVisibilityRule(withRule({ field: "a", operator: "isSet" }), undefined);
    expect(field.params).toBeUndefined();
    expect(getVisibilityRule(field)).toBeUndefined();
  });

  it("keeps other params when clearing the rule", () => {
    const seeded: FormField = { ...base, params: { somethingElse: 1 } };
    const cleared = withVisibilityRule(
      withVisibilityRule(seeded, { field: "a", operator: "isSet" }),
      undefined,
    );
    expect(cleared.params).toEqual({ somethingElse: 1 });
  });

  it("ignores a malformed rule rather than throwing", () => {
    expect(getVisibilityRule({ ...base, params: { tfVisibleWhen: "nonsense" } })).toBeUndefined();
    expect(getVisibilityRule({ ...base, params: { tfVisibleWhen: { field: "a" } } })).toBeUndefined();
  });
});

describe("isFieldVisible", () => {
  it("shows a field with no rule", () => {
    expect(isFieldVisible(base, {})).toBe(true);
  });

  it("isSet / isEmpty follow whether the other field has an answer", () => {
    const shown = withRule({ field: "reason", operator: "isSet" });
    expect(isFieldVisible(shown, {})).toBe(false);
    expect(isFieldVisible(shown, { reason: "" })).toBe(false);
    expect(isFieldVisible(shown, { reason: "late" })).toBe(true);

    const hidden = withRule({ field: "reason", operator: "isEmpty" });
    expect(isFieldVisible(hidden, {})).toBe(true);
    expect(isFieldVisible(hidden, { reason: "late" })).toBe(false);
  });

  it("treats an unticked checkbox as no answer", () => {
    const shown = withRule({ field: "agree", operator: "isSet" });
    expect(isFieldVisible(shown, { agree: false })).toBe(false);
    expect(isFieldVisible(shown, { agree: true })).toBe(true);
  });

  it("compares equals/notEquals as strings, so 3 and \"3\" agree", () => {
    const shown = withRule({ field: "count", operator: "equals", value: "3" });
    expect(isFieldVisible(shown, { count: 3 })).toBe(true);
    expect(isFieldVisible(shown, { count: 4 })).toBe(false);

    const other = withRule({ field: "count", operator: "notEquals", value: "3" });
    expect(isFieldVisible(other, { count: 4 })).toBe(true);
  });

  /**
   * A typo in a condition must never silently remove an input. Showing the field is the
   * safe failure; hiding it would lose data with no visible cause.
   */
  it("shows the field when the rule points at a field with no value", () => {
    const shown = withRule({ field: "typo", operator: "equals", value: "" });
    expect(isFieldVisible(shown, {})).toBe(true);
  });
});

describe("hiddenFieldIds", () => {
  it("finds hidden fields inside layout containers too", () => {
    const model: FormModelResponse = {
      fields: [
        { id: "reason", name: "Reason", type: "text" },
        {
          id: "row",
          name: "Row",
          type: "container",
          fieldType: "FormContainer",
          fields: [[withVisibilityRule({ id: "detail", name: "Detail", type: "text" }, { field: "reason", operator: "isSet" })]],
        } as FormField,
      ],
    };

    expect([...hiddenFieldIds(model, {})]).toEqual(["detail"]);
    expect([...hiddenFieldIds(model, { reason: "x" })]).toEqual([]);
  });
});

describe("validateForm with visibility", () => {
  /** Requiring an answer to a question nobody can see makes a form unsubmittable. */
  it("does not require a hidden field", () => {
    const model: FormModelResponse = {
      fields: [
        { id: "other", name: "Other?", type: "boolean" },
        withVisibilityRule(
          { id: "explain", name: "Explain", type: "text", required: true },
          { field: "other", operator: "isSet" },
        ),
      ],
    };

    expect(validateForm(model, {})).toEqual({});
    expect(validateForm(model, { other: true })).toEqual({
      explain: "Explain is required.",
    });
    expect(validateForm(model, { other: true, explain: "because" })).toEqual({});
  });
});
