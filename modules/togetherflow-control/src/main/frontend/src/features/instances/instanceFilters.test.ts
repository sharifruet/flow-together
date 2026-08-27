/**
 * The variable-filter URL codec (W2.1).
 *
 * Variable filters are a `POST /query` body and have no natural query-string form, so
 * rather than let a variable-filtered list be the one list that cannot be linked — which
 * would defeat F1 for exactly the query an operator most wants to paste into a ticket —
 * they are encoded into the URL. That codec is the thing most likely to be quietly wrong,
 * because the values people filter on contain the separators.
 */

import { describe, expect, it } from "vitest";
import { decodeFilters, encodeFilters } from "./InstanceFilters";

describe("variable filter codec", () => {
  it("round-trips a simple filter", () => {
    const filters = [{ name: "amount", operation: "greaterThan" as const, value: "1000" }];
    expect(decodeFilters(encodeFilters(filters))).toEqual(filters);
  });

  it("round-trips several", () => {
    const filters = [
      { name: "amount", operation: "greaterThan" as const, value: "1000" },
      { name: "region", operation: "equals" as const, value: "EMEA" },
    ];
    expect(decodeFilters(encodeFilters(filters))).toEqual(filters);
  });

  it("survives a value containing the separators", () => {
    /*
     * A time, a URL with a tilde, and a comma. The tilde case is the one that caught a
     * real bug: `encodeURIComponent` does not escape `~`, so an earlier tilde separator
     * truncated this value silently.
     */
    const filters = [
      { name: "cutoff", operation: "equals" as const, value: "10:30" },
      { name: "callback", operation: "like" as const, value: "https://x.test/a~b?c=1" },
      { name: "csv", operation: "equals" as const, value: "a,b,c" },
    ];
    expect(decodeFilters(encodeFilters(filters))).toEqual(filters);
  });

  it("survives a name containing a colon", () => {
    const filters = [{ name: "ns:amount", operation: "equals" as const, value: "1" }];
    expect(decodeFilters(encodeFilters(filters))).toEqual(filters);
  });

  it("omits the value for a unary operation rather than sending an empty one", () => {
    const encoded = encodeFilters([{ name: "approved", operation: "notExists" }]);
    expect(decodeFilters(encoded)).toEqual([{ name: "approved", operation: "notExists" }]);
    // No `value` key at all — `exists` compares against nothing, and an empty string
    // would be a comparison the engine would try to make.
    expect(decodeFilters(encoded)[0]).not.toHaveProperty("value");
  });

  it("drops a nameless filter, which matches nothing server-side", () => {
    expect(encodeFilters([{ name: "  ", operation: "equals", value: "x" }])).toBe("");
  });

  it("returns nothing for absent or empty input", () => {
    expect(decodeFilters(undefined)).toEqual([]);
    expect(decodeFilters("")).toEqual([]);
  });

  it("ignores entries it cannot parse rather than throwing", () => {
    // The query string is user-editable; a malformed entry must not break the screen.
    expect(decodeFilters("garbage")).toEqual([]);
    expect(decodeFilters("name:notAnOperation:1")).toEqual([]);
    expect(decodeFilters(":equals:1")).toEqual([]);
    expect(decodeFilters("a:equals:1,garbage")).toEqual([
      { name: "a", operation: "equals", value: "1" },
    ]);
  });

  it("keeps an empty value, which is a real filter", () => {
    // "equals empty string" is different from "not set", and both are expressible.
    expect(decodeFilters("note:equals:")).toEqual([
      { name: "note", operation: "equals", value: "" },
    ]);
  });
});
