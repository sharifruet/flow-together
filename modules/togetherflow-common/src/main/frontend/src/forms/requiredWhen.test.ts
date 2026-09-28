import { describe, expect, it } from "vitest";
import type { FormField, FormModelResponse } from "../api/types";
import { validateForm } from "./formModel";
import { getRequiredRule, isFieldRequired, withRequiredRule } from "./requiredWhen";
import { withVisibilityRule } from "./visibility";

const remarks: FormField = { id: "remarks", name: "Remarks", type: "multi-line-text" };

/** The resignation approvals: a Yes/No radio storing the option id, plus free-text remarks. */
const approvalForm = (fields: FormField[]): FormModelResponse =>
  ({ id: "f", key: "approve", name: "Approve", fields }) as FormModelResponse;

const decision: FormField = {
  id: "approved",
  name: "Approve?",
  type: "radio-buttons",
  required: true,
  options: [
    { id: "true", name: "Yes" },
    { id: "false", name: "No" },
  ],
} as FormField;

const conditionalRemarks = withRequiredRule(remarks, {
  field: "approved",
  operator: "equals",
  value: "false",
});

describe("withRequiredRule / getRequiredRule", () => {
  it("round-trips a rule through the engine's params map", () => {
    expect(conditionalRemarks.params?.tfRequiredWhen).toEqual({
      field: "approved",
      operator: "equals",
      value: "false",
    });
    expect(getRequiredRule(conditionalRemarks)).toEqual({
      field: "approved",
      operator: "equals",
      value: "false",
    });
  });

  it("removes params entirely when the rule is cleared", () => {
    const cleared = withRequiredRule(conditionalRemarks, undefined);
    expect(cleared.params).toBeUndefined();
    expect(getRequiredRule(cleared)).toBeUndefined();
  });

  /** A visibility rule and a required rule on the same field are independent. */
  it("leaves a visibility rule on the same field alone", () => {
    const both = withVisibilityRule(conditionalRemarks, { field: "approved", operator: "isSet" });
    expect(getRequiredRule(both)).toBeDefined();
    expect(both.params?.tfVisibleWhen).toEqual({ field: "approved", operator: "isSet" });
  });

  it("ignores a malformed rule rather than throwing", () => {
    expect(getRequiredRule({ ...remarks, params: { tfRequiredWhen: "nonsense" } })).toBeUndefined();
    expect(
      getRequiredRule({ ...remarks, params: { tfRequiredWhen: { operator: "isSet" } } }),
    ).toBeUndefined();
  });
});

describe("isFieldRequired", () => {
  it("is optional with no rule and no declared requirement", () => {
    expect(isFieldRequired(remarks, {})).toBe(false);
  });

  it("follows the rule: demanded on reject, optional on approve", () => {
    expect(isFieldRequired(conditionalRemarks, { approved: "false" })).toBe(true);
    expect(isFieldRequired(conditionalRemarks, { approved: "true" })).toBe(false);
  });

  /** Nothing is decided yet, so nothing is demanded yet. */
  it("is optional while the field it depends on is unanswered", () => {
    expect(isFieldRequired(conditionalRemarks, {})).toBe(false);
  });

  it("keeps a declared requirement whatever the rule says", () => {
    const always = withRequiredRule({ ...remarks, required: true }, {
      field: "approved",
      operator: "equals",
      value: "false",
    });
    expect(isFieldRequired(always, { approved: "true" })).toBe(true);
  });
});

describe("validateForm with a conditional requirement", () => {
  it("refuses a rejection with no remarks, and accepts an approval without any", () => {
    const model = approvalForm([decision, conditionalRemarks]);

    expect(validateForm(model, { approved: "false", remarks: "" })).toEqual({
      remarks: "Remarks is required.",
    });
    expect(validateForm(model, { approved: "false", remarks: "   " })).toEqual({
      remarks: "Remarks is required.",
    });
    expect(validateForm(model, { approved: "false", remarks: "Not this quarter" })).toEqual({});
    expect(validateForm(model, { approved: "true", remarks: "" })).toEqual({});
  });

  /** A demand the filler cannot see is a demand they cannot meet (visibility.ts). */
  it("does not demand an answer to a hidden field", () => {
    const hidden = withVisibilityRule(conditionalRemarks, {
      field: "approved",
      operator: "equals",
      value: "true",
    });
    expect(validateForm(approvalForm([decision, hidden]), { approved: "false", remarks: "" })).toEqual(
      {},
    );
  });

  it("leaves other rules on the field working — length still applies", () => {
    const limited = { ...conditionalRemarks, params: { ...conditionalRemarks.params, minLength: 5 } };
    expect(validateForm(approvalForm([decision, limited]), { approved: "false", remarks: "no" })).toEqual(
      { remarks: "Enter at least 5 characters." },
    );
  });
});
