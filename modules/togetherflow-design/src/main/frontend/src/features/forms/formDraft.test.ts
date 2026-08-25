import { describe, expect, it } from "vitest";
import type { FormField, ModelResponse } from "@togetherflow/common";
import { emptyFormModel, isPresentational, newField, parseFormModel } from "./formDraft";

const model: ModelResponse = { id: "m1", name: "Expense claim", key: "expenseClaim" };

describe("parseFormModel", () => {
  it("reads a saved form", () => {
    const source = JSON.stringify({
      key: "f1",
      name: "Form One",
      fields: [{ id: "amount", name: "Amount", type: "amount" }],
    });
    expect(parseFormModel(source, model).fields).toHaveLength(1);
  });

  it("falls back to the model's own name and key when there is no source yet", () => {
    const form = parseFormModel(null, model);
    expect(form.key).toBe("expenseClaim");
    expect(form.name).toBe("Expense claim");
    expect(form.fields).toEqual([]);
  });

  it("recovers from a malformed draft rather than throwing", () => {
    expect(parseFormModel("{not json", model).key).toBe("expenseClaim");
  });

  it("rejects JSON that parses but is not a form", () => {
    expect(parseFormModel(JSON.stringify({ key: "x" }), model).key).toBe("expenseClaim");
  });
});

describe("newField", () => {
  it("gives an option field a first option, so it is never an empty dropdown", () => {
    const field = newField("dropdown", []);
    expect(field.fieldType).toBe("OptionFormField");
    expect("options" in field && field.options).toEqual([{ name: "Option 1" }]);
  });

  it("leaves a plain field without an options array", () => {
    expect("options" in newField("text", [])).toBe(false);
  });

  it("never reuses an id already taken", () => {
    const existing: FormField[] = [
      { id: "text_1", name: "A", type: "text" },
      { id: "text_2", name: "B", type: "text" },
    ];
    // Two fields exist, so the natural next id is text_3 — but seed a clash to prove
    // the loop keeps going rather than producing a duplicate.
    const clash: FormField[] = [...existing, { id: "text_3", name: "C", type: "text" }];
    expect(newField("text", clash).id).toBe("text_4");
    expect(newField("text", existing).id).toBe("text_3");
  });

  it("builds ids that are valid variable names", () => {
    expect(newField("multi-line-text", []).id).toBe("multi_line_text_1");
  });
});

describe("emptyFormModel", () => {
  it("starts at version 1 with no fields", () => {
    expect(emptyFormModel("k", "N")).toEqual({ key: "k", name: "N", version: 1, fields: [], outcomes: [] });
  });
});

describe("isPresentational", () => {
  it("treats value-less fields as presentational", () => {
    expect(isPresentational("headline")).toBe(true);
    expect(isPresentational("horizontal-line")).toBe(true);
    expect(isPresentational("text")).toBe(false);
  });
});
