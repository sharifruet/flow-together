import { describe, expect, it } from "vitest";
import type { FormModelResponse } from "../api/types";
import { asReadOnlyModel, englishMessages, fieldConstraints, validateField } from "./formModel";

describe("date bounds and anchored patterns (FR-M.3)", () => {
  it("reads minDate and maxDate from params", () => {
    expect(fieldConstraints({ id: "d", type: "date", params: { minDate: "2026-01-01", maxDate: "2026-12-31" } }))
      .toMatchObject({ minDate: "2026-01-01", maxDate: "2026-12-31" });
  });

  it("refuses a date outside the bounds and accepts one inside", () => {
    const field = { id: "d", name: "Day", type: "date", params: { minDate: "2026-01-01", maxDate: "2026-12-31" } };
    expect(validateField(field, "2025-12-31", englishMessages)).toBe("Enter 2026-01-01 or later.");
    expect(validateField(field, "2027-01-01", englishMessages)).toBe("Enter 2026-12-31 or earlier.");
    expect(validateField(field, "2026-06-15", englishMessages)).toBeUndefined();
  });

  it("matches a pattern against the whole value, as the engine does", () => {
    const field = { id: "ref", name: "Ref", type: "text", params: { pattern: "doc:[a-z]+" } };
    expect(validateField(field, "doc:letter", englishMessages)).toBeUndefined();
    expect(validateField(field, "xdoc:letter", englishMessages)).toBe("Enter this in the format the form expects.");
    expect(validateField(field, "doc:letter!", englishMessages)).toBe("Enter this in the format the form expects.");
  });

  it("makes every field read-only for a recorded submission, containers included", () => {
    const model: FormModelResponse = {
      fields: [
        { id: "a", type: "text" },
        { id: "c", type: "container", fieldType: "FormContainer", fields: [[{ id: "b", type: "integer" }]] } as never,
      ],
    };
    const readOnly = asReadOnlyModel(model);
    expect(readOnly.fields?.[0]).toMatchObject({ id: "a", readOnly: true });
    expect((readOnly.fields?.[1] as { fields: Array<Array<{ readOnly?: boolean }>> }).fields[0][0]).toMatchObject({ readOnly: true });
    expect(model.fields?.[0]).not.toHaveProperty("readOnly");
  });
});
