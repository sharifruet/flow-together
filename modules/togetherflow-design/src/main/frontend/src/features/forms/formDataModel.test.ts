/**
 * The data model a form implies (W3.3).
 *
 * Derived, not declared — so what these pin is the derivation and the three ways a form
 * can be wrong about the variables it writes.
 */

import { describe, expect, it } from "vitest";
import type { FormModelResponse } from "@togetherflow/common";
import { dataModelOf, dataModelProblems, variableTypeFor } from "./formDataModel";

const form = (fields: FormModelResponse["fields"]): FormModelResponse => ({ fields });

describe("dataModelOf", () => {
  it("maps each field to the engine type its answer is stored as", () => {
    // Mirrors formValuesToVariables: the type shown here has to be the type stored.
    const entries = dataModelOf(
      form([
        { id: "note", name: "Note", type: "text" },
        { id: "count", name: "Count", type: "integer" },
        { id: "total", name: "Total", type: "amount" },
        { id: "due", name: "Due", type: "date" },
        { id: "agreed", name: "Agreed", type: "boolean" },
      ]),
    );
    expect(entries.map((entry) => [entry.name, entry.type])).toEqual([
      ["note", "string"],
      ["count", "integer"],
      ["total", "double"],
      ["due", "date"],
      ["agreed", "boolean"],
    ]);
  });

  it("omits fields that write nothing", () => {
    const entries = dataModelOf(
      form([
        { id: "head", name: "Section", type: "headline" },
        { id: "calc", name: "Computed", type: "expression" },
        { id: "kept", name: "Kept", type: "text" },
      ]),
    );
    expect(entries.map((entry) => entry.name)).toEqual(["kept"]);
  });

  it("reads fields inside containers, in reading order", () => {
    const entries = dataModelOf(
      form([
        {
          id: "row",
          type: "container",
          fieldType: "FormContainer",
          fields: [[{ id: "a", name: "A", type: "text" }, { id: "b", name: "B", type: "text" }]],
        },
        { id: "z", name: "Z", type: "text" },
      ]),
    );
    expect(entries.map((entry) => entry.name)).toEqual(["a", "b", "z"]);
  });

  it("collapses two fields writing one variable, and records both", () => {
    const entries = dataModelOf(
      form([
        { id: "amount", name: "Amount", type: "text" },
        { id: "amount", name: "Amount again", type: "text", required: true },
      ]),
    );
    expect(entries).toHaveLength(1);
    expect(entries[0].writtenBy).toEqual(["Amount", "Amount again"]);
    // The stricter rule governs: the engine sees one variable, and one of the two fields
    // says it cannot be empty.
    expect(entries[0].required).toBe(true);
  });
});

describe("dataModelProblems", () => {
  it("reports two fields writing the same variable", () => {
    // Only the last one submitted survives, silently.
    const problems = dataModelProblems(
      form([
        { id: "amount", name: "Amount", type: "text" },
        { id: "amount", name: "Amount again", type: "text" },
      ]),
    );
    expect(problems).toContainEqual({ kind: "duplicate", name: "amount" });
  });

  it("reports an id an expression cannot use", () => {
    // `${amount-due}` is a subtraction, so it evaluates to something surprising rather
    // than failing — worse than a rejected deploy.
    const problems = dataModelProblems(form([{ id: "amount-due", name: "Due", type: "text" }]));
    expect(problems).toContainEqual({ kind: "invalid-name", name: "amount-due" });
  });

  it("reports a field with no id at all", () => {
    expect(dataModelProblems(form([{ id: "", name: "Nameless", type: "text" }]))).toContainEqual({
      kind: "missing-name",
      name: "",
    });
  });

  it("is silent for a form that is fine", () => {
    expect(
      dataModelProblems(
        form([
          { id: "amount", name: "Amount", type: "amount" },
          { id: "_note", name: "Note", type: "text" },
        ]),
      ),
    ).toEqual([]);
  });
});

describe("variableTypeFor", () => {
  it("defaults an unknown field type to string rather than guessing", () => {
    expect(variableTypeFor("people")).toBe("string");
    expect(variableTypeFor("dropdown")).toBe("string");
  });
});
