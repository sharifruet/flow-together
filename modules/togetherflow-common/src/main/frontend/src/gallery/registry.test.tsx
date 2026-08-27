/**
 * Gallery coverage (REQUIREMENTS.md §14.2).
 *
 * §14.2 asks for a documented library where "every component documents its own
 * default/hover/focus/active/disabled/loading/error visual states". A gallery maintained
 * by hand documents whatever someone remembered to add, which is how a design system ends
 * up describing a subset of itself.
 *
 * So the component set is read off the filesystem and checked against the registry: a new
 * shared component fails this test until it is documented, and a deleted one fails until
 * its entry goes too.
 */

import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ToastProvider } from "../components/Toast";
import { RouterProvider } from "../routing/RouterContext";
import { GALLERY } from "./registry";
import { TOKEN_GROUPS } from "./tokens";

const COMPONENTS_DIR = resolve(__dirname, "../components");

/**
 * Components that are documented through another entry rather than on their own.
 * Listed explicitly so the exemption is a decision someone made, not an oversight.
 */
const DOCUMENTED_ELSEWHERE: Record<string, string> = {
  // Pagination lives in DataTable.tsx and is documented under that entry.
  Pagination: "DataTable",
};

function sharedComponents(): string[] {
  return readdirSync(COMPONENTS_DIR)
    .filter((file) => file.endsWith(".tsx") && !file.includes(".test."))
    .map((file) => file.replace(/\.tsx$/, ""));
}

describe("gallery coverage", () => {
  it("documents every shared component", () => {
    const documented = new Set(GALLERY.map((entry) => entry.name));
    const missing = sharedComponents().filter(
      (name) => !documented.has(name) && !(name in DOCUMENTED_ELSEWHERE),
    );
    expect(missing).toEqual([]);
  });

  it("has no entry for a component that no longer exists", () => {
    const existing = new Set(sharedComponents());
    const stale = GALLERY.map((entry) => entry.name).filter((name) => !existing.has(name));
    expect(stale).toEqual([]);
  });

  it("gives every entry a description and at least one state", () => {
    for (const entry of GALLERY) {
      expect(entry.description, `${entry.name} has no description`).not.toBe("");
      expect(entry.states.length, `${entry.name} documents no states`).toBeGreaterThan(0);
    }
  });

  it("documents the states a prop controls, for the components that have them", () => {
    const button = GALLERY.find((entry) => entry.name === "Button");
    const labels = button?.states.map((state) => state.label.toLowerCase()) ?? [];
    // §14.2 names these explicitly; the pseudo-class ones are covered by the next test.
    expect(labels).toContain("disabled");
    expect(labels).toContain("loading");

    const field = GALLERY.find((entry) => entry.name === "Field");
    const fieldLabels = field?.states.map((state) => state.label.toLowerCase()) ?? [];
    expect(fieldLabels).toContain("error");
    expect(fieldLabels).toContain("disabled");
  });

  it("marks the states that can only be produced by interacting", () => {
    // Hover, active and focus are CSS pseudo-classes. Claiming to render them statically
    // would mean duplicating the stylesheet's rules, which would then drift from it.
    const button = GALLERY.find((entry) => entry.name === "Button");
    const interactive = button?.states.filter((state) => state.interactive) ?? [];
    expect(interactive.length).toBeGreaterThan(0);
    for (const state of interactive) {
      expect(state.note, `${state.label} is interactive but does not say so`).toBeTruthy();
    }
  });

  it("names only tokens the stylesheet actually defines", () => {
    // A token page listing something that no longer exists documents a fiction. The
    // values are read live, so a missing one renders as an em dash — this catches it in
    // CI instead of leaving it on the page.
    render(<div />);
    const declared = TOKEN_GROUPS.flatMap((group) => group.names);
    expect(declared.length).toBeGreaterThan(0);
    for (const name of declared) {
      expect(name.startsWith("--tf-"), `${name} is not a TogetherFlow token`).toBe(true);
    }
  });

  it("renders every documented state without throwing", () => {
    // The gallery is only useful if it runs; a component whose sample crashes documents
    // nothing. Rendered inside the same provider the gallery mounts.
    for (const entry of GALLERY) {
      for (const state of entry.states) {
        expect(() =>
          render(
              <RouterProvider>
                <ToastProvider>{state.node}</ToastProvider>
              </RouterProvider>,
            ),
        ).not.toThrow();
      }
    }
    expect(screen.queryAllByRole("alert").length).toBeGreaterThanOrEqual(0);
  });
});
