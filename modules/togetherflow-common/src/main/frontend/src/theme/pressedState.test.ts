/**
 * A toggle button's state has to be visible, not just announced.
 *
 * Nine buttons across common, control and design set `aria-pressed`, and for a long time
 * nothing in the theme styled that attribute. The state was correct in the accessibility
 * tree and invisible on screen: the model library's Cards/Table pair, the data table's
 * density control, and — worst — the BPMN editor's grid and snap toggles, whose only job
 * is to report whether grid and snap are on.
 *
 * Nothing caught it, and nothing *could* have from a component test. jsdom applies no
 * stylesheet, so a rendered toggle reports the attribute either way; `toBeVisible()` reads
 * the attribute too. It took opening a browser and comparing computed styles with hover
 * and focus suppressed. So the check lives here, against the stylesheet itself, which is
 * where the answer actually is.
 *
 * WCAG 1.4.1 is the formal version of the same point: state may not be carried by one
 * channel that some users do not have.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** modules/togetherflow-common/src/main/frontend/src/theme → modules/ */
const MODULES_DIR = resolve(__dirname, "../../../../../..");
const THEME = readFileSync(resolve(__dirname, "components.css"), "utf8");

function sourceFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === "dist" || entry === "target") continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx$/.test(entry) && !entry.includes(".test.")) found.push(full);
    }
  };
  for (const module of readdirSync(MODULES_DIR)) {
    if (!module.startsWith("togetherflow-")) continue;
    const src = join(MODULES_DIR, module, "src/main/frontend/src");
    try {
      if (statSync(src).isDirectory()) walk(src);
    } catch {
      // A module with no frontend — nothing to scan.
    }
  }
  return found;
}

describe("toggle buttons show their state", () => {
  it("styles [aria-pressed=\"true\"], so a pressed button does not look unpressed", () => {
    expect(THEME).toMatch(/\[aria-pressed="true"\]/);
  });

  it("changes more than one property, so the cue survives a colour-blind reader", () => {
    // The rule that does the work, isolated from the hover and primary-variant overrides.
    const rule = THEME.match(
      /\.tf-button\[aria-pressed="true"\]:not\(:disabled\)\s*\{([^}]*)\}/,
    )?.[1];
    expect(rule, "expected a base rule for pressed buttons").toBeTruthy();
    const declared = [...(rule ?? "").matchAll(/^\s*([a-z-]+)\s*:/gm)].map((m) => m[1]);
    // Colour alone is not a cue. Weight and border carry it too.
    expect(declared).toEqual(expect.arrayContaining(["background", "border-color", "font-weight"]));
  });

  it("is still the only styling any aria-pressed button relies on", () => {
    // If a screen grows its own pressed styling, this is the reminder to fold it into the
    // shared rule rather than let four apps drift apart on what "selected" looks like.
    const users = sourceFiles().filter((file) =>
      readFileSync(file, "utf8").includes("aria-pressed"),
    );
    expect(users.length, "no aria-pressed toggles found — has the attribute been renamed?")
      .toBeGreaterThan(0);
    // Recorded rather than asserted exactly: the list grows, and a new toggle inherits the
    // shared rule for free. Naming them keeps the blast radius of a change to it visible.
    expect(users.map((file) => relative(MODULES_DIR, file).replace(/\\/g, "/")).sort())
      .toMatchInlineSnapshot(`
      [
        "togetherflow-common/src/main/frontend/src/components/DataTable.tsx",
        "togetherflow-control/src/main/frontend/src/features/instances/ChangeStateDialog.tsx",
        "togetherflow-design/src/main/frontend/src/features/editors/EditorMenuBar.tsx",
        "togetherflow-design/src/main/frontend/src/features/library/ModelLibrary.tsx",
      ]
    `);
  });
});
