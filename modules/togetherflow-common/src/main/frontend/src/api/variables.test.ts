import { describe, expect, it } from "vitest";
import {
  displayValue,
  normalizeType,
  toEditable,
  toRestVariable,
  toRestVariables,
  validateVariable,
  validateVariables,
} from "./variables";

describe("normalizeType", () => {
  it("maps Flowable type aliases onto the editable set", () => {
    expect(normalizeType("int")).toBe("integer");
    expect(normalizeType("Long")).toBe("long");
    expect(normalizeType("float")).toBe("double");
    expect(normalizeType("bool")).toBe("boolean");
    expect(normalizeType("localDateTime")).toBe("date");
    expect(normalizeType(undefined)).toBe("string");
    expect(normalizeType("somethingUnknown")).toBe("string");
  });
});

describe("toEditable", () => {
  it("keeps the declared type so it survives the round trip", () => {
    const editable = toEditable({ name: "amount", type: "long", value: 42 });
    expect(editable).toEqual({ name: "amount", type: "long", input: "42", scope: undefined });
  });

  it("pretty-prints JSON values for editing", () => {
    const editable = toEditable({ name: "payload", type: "json", value: { a: 1 } });
    expect(editable.input).toBe('{\n  "a": 1\n}');
  });

  it("renders null as an empty input rather than the string 'null'", () => {
    expect(toEditable({ name: "x", type: "string", value: null }).input).toBe("");
  });
});

describe("validateVariable", () => {
  it("requires a name", () => {
    expect(validateVariable({ name: "  ", type: "string", input: "x" })).toBe("Name is required.");
  });

  it("accepts an empty value as a null assignment", () => {
    expect(validateVariable({ name: "x", type: "integer", input: "" })).toBeUndefined();
  });

  it("rejects non-numeric input for numeric types", () => {
    expect(validateVariable({ name: "x", type: "integer", input: "abc" })).toBe("Must be a number.");
  });

  it("rejects a fractional value for whole-number types", () => {
    expect(validateVariable({ name: "x", type: "integer", input: "1.5" })).toBe(
      "Must be a whole number.",
    );
    expect(validateVariable({ name: "x", type: "double", input: "1.5" })).toBeUndefined();
  });

  it("validates booleans, dates and JSON", () => {
    expect(validateVariable({ name: "x", type: "boolean", input: "yes" })).toBe(
      "Must be true or false.",
    );
    expect(validateVariable({ name: "x", type: "boolean", input: "TRUE" })).toBeUndefined();
    expect(validateVariable({ name: "x", type: "date", input: "not-a-date" })).toBe(
      "Must be a valid date.",
    );
    expect(validateVariable({ name: "x", type: "json", input: "{oops}" })).toBe(
      "Must be valid JSON.",
    );
  });
});

describe("validateVariables", () => {
  it("flags duplicate names, which the engine would otherwise silently collapse", () => {
    const errors = validateVariables([
      { name: "dup", type: "string", input: "a" },
      { name: "dup", type: "string", input: "b" },
    ]);
    expect(errors).toContainEqual({ name: "dup", message: "Duplicate variable name." });
  });
});

describe("toRestVariable", () => {
  it("coerces each type to the wire representation the engine expects", () => {
    expect(toRestVariable({ name: "n", type: "integer", input: "7" }).value).toBe(7);
    expect(toRestVariable({ name: "n", type: "double", input: "1.5" }).value).toBe(1.5);
    expect(toRestVariable({ name: "n", type: "boolean", input: "true" }).value).toBe(true);
    expect(toRestVariable({ name: "n", type: "json", input: '{"a":1}' }).value).toEqual({ a: 1 });
    expect(toRestVariable({ name: "n", type: "string", input: "hi" }).value).toBe("hi");
  });

  it("sends an empty input as null rather than an empty string", () => {
    expect(toRestVariable({ name: "n", type: "string", input: "" }).value).toBeNull();
  });

  it("serialises dates as ISO-8601", () => {
    const value = toRestVariable({ name: "d", type: "date", input: "2026-03-05T10:00:00Z" }).value;
    expect(value).toBe("2026-03-05T10:00:00.000Z");
  });

  it("trims the name so a stray space cannot create a second variable", () => {
    expect(toRestVariable({ name: "  n  ", type: "string", input: "v" }).name).toBe("n");
  });
});

describe("toRestVariables", () => {
  it("drops unnamed rows left behind by the editor", () => {
    const result = toRestVariables([
      { name: "keep", type: "string", input: "1" },
      { name: "   ", type: "string", input: "2" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("keep");
  });
});

describe("displayValue", () => {
  it("renders absent values as an em dash and objects as JSON", () => {
    expect(displayValue({ name: "x", value: null })).toBe("—");
    expect(displayValue({ name: "x", value: undefined })).toBe("—");
    expect(displayValue({ name: "x", value: { a: 1 } })).toBe('{"a":1}');
    expect(displayValue({ name: "x", value: false })).toBe("false");
  });
});
