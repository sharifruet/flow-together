/**
 * Saved filters (REQUIREMENTS.md §14.4). The storage they live in can be absent or
 * hostile — a private window, cleared site data, a browser set to block it — so the
 * behaviour that matters is that none of that reaches the screen using them.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { readSavedViews, writeSavedViews } from "./savedViews";

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

interface Filter {
  filter: string;
}

describe("saved views", () => {
  it("round-trips a view", () => {
    writeSavedViews<Filter>("work.inbox", [
      { id: "1", name: "Overdue", value: { filter: "mine" }, savedAt: "2026-01-01T00:00:00Z" },
    ]);
    expect(readSavedViews<Filter>("work.inbox")).toEqual([
      { id: "1", name: "Overdue", value: { filter: "mine" }, savedAt: "2026-01-01T00:00:00Z" },
    ]);
  });

  it("scopes views per namespace, so Control's do not leak into Work's", () => {
    writeSavedViews<Filter>("work.inbox", [
      { id: "1", name: "Mine", value: { filter: "mine" }, savedAt: "x" },
    ]);
    expect(readSavedViews<Filter>("control.instances")).toEqual([]);
  });

  it("returns nothing when the stored value is not an array", () => {
    window.localStorage.setItem("togetherflow.views.work.inbox", '{"not":"an array"}');
    expect(readSavedViews("work.inbox")).toEqual([]);
  });

  it("discards entries that are not the shape we wrote — storage is user-writable", () => {
    window.localStorage.setItem(
      "togetherflow.views.work.inbox",
      JSON.stringify([{ id: "1", name: "ok", value: {} }, { garbage: true }]),
    );
    expect(readSavedViews("work.inbox")).toHaveLength(1);
  });

  it("returns nothing rather than throwing when storage is unreadable", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readSavedViews("work.inbox")).toEqual([]);
  });

  it("does not throw when storage refuses a write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() =>
      writeSavedViews("work.inbox", [{ id: "1", name: "x", value: {}, savedAt: "x" }]),
    ).not.toThrow();
  });

  it("caps how many are kept, so a runaway caller cannot fill the quota", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      id: String(i),
      name: `view ${i}`,
      value: {},
      savedAt: "x",
    }));
    writeSavedViews("work.inbox", many);
    expect(readSavedViews("work.inbox")).toHaveLength(25);
  });
});
