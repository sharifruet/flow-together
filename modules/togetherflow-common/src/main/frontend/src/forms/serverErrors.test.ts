import { describe, expect, it } from "vitest";
import { ApiError } from "../api/client";
import type { FormModelResponse } from "../api/types";
import { englishMessages } from "./formModel";
import { isFormValidationError, serverFormErrors } from "./serverErrors";

const MODEL: FormModelResponse = {
  id: "def-1",
  key: "salesClearanceForm",
  fields: [
    { id: "outstandingCollection", name: "Outstanding collection", type: "amount", required: true, params: { min: "0" } },
    { id: "decision", name: "Decision", type: "radio-buttons", fieldType: "OptionFormField", options: [{ id: "approve", name: "Approve" }] } as never,
    { id: "letterRef", name: "Letter", type: "text", params: { pattern: "doc:.*", patternMessage: "Must start with doc:" } },
    { id: "lastDay", name: "Last day", type: "date", params: { maxDate: "2026-12-31" } },
  ],
  outcomes: [{ id: "ok", name: "OK" }],
};

function refusal(fields: Array<{ id: string | null; code: string; message: string }>) {
  return new ApiError("Bad request", 400, "corr-1", { message: "Form validation failed", fields });
}

describe("serverFormErrors", () => {
  it("recognises the engine's refusal and nothing else", () => {
    expect(isFormValidationError(refusal([]))).toBe(true);
    expect(isFormValidationError(new ApiError("Bad request", 400, "corr-2", { message: "x" }))).toBe(false);
    expect(isFormValidationError(new ApiError("Boom", 500, "corr-3", { fields: [] }))).toBe(false);
    expect(isFormValidationError(new Error("offline"))).toBe(false);
    expect(serverFormErrors(new Error("offline"), MODEL, englishMessages)).toBeNull();
  });

  it("translates every code through the same messages the browser check uses", () => {
    const result = serverFormErrors(
      refusal([
        { id: "outstandingCollection", code: "required", message: "engine words" },
        { id: "outstandingCollection", code: "min", message: "second error on the same field is dropped" },
        { id: "decision", code: "option", message: "engine words" },
        { id: "letterRef", code: "pattern", message: "engine words" },
        { id: "lastDay", code: "maxDate", message: "engine words" },
        { id: null, code: "outcome", message: "engine words" },
        { id: "mystery", code: "quantum", message: "kept verbatim" },
      ]),
      MODEL,
      englishMessages,
    );
    expect(result).not.toBeNull();
    expect(result!.fields).toEqual({
      outstandingCollection: "Outstanding collection is required.",
      decision: "Choose one of the listed options.",
      letterRef: "Must start with doc:",
      lastDay: "Enter 2026-12-31 or earlier.",
      mystery: "kept verbatim",
    });
    expect(result!.general).toEqual(["That outcome is not one this form offers."]);
  });

  it("copes with a model it cannot see", () => {
    const result = serverFormErrors(refusal([{ id: "x", code: "required", message: "m" }]), undefined, englishMessages);
    expect(result!.fields.x).toBe("x is required.");
  });
});
