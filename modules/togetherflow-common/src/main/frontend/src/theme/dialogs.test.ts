/**
 * Every dialog goes through the shared `Modal` (UI_POLISH_BACKLOG.md F6).
 *
 * This exists because the alternative failed in exactly the way an unchecked convention
 * does. W1.4 added `Modal` with its own `.tf-modal-*` classes and deleted the old
 * `.tf-dialog-backdrop` / `.tf-dialog` rules — but seventeen screens across all four apps
 * were still writing that markup by hand. They did not error; they rendered *unstyled and
 * inline*, so "New process" dropped a bare form into the middle of the model list.
 *
 * F6's acceptance was already "no screen writes `.tf-dialog` markup directly". It was true
 * of the component and false of the app screens, and nothing checked.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** modules/togetherflow-common/src/main/frontend/src/theme → modules/ */
const MODULES_DIR = resolve(__dirname, "../../../../../..");

function sourceFiles(extension: string): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === "dist" || entry === "target") continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(extension) && !entry.includes(".test.")) found.push(full);
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

/**
 * Classes that were the old hand-rolled dialog's *chrome*. Each is now `Modal`'s job.
 *
 * `.tf-dialog__row` and `.tf-dialog__warning` are deliberately absent: they are layout
 * helpers apps use *inside* a modal body, they are still styled, and they never carried
 * dialog behaviour.
 */
const RETIRED = ["tf-dialog-backdrop", "tf-dialog__title", "tf-dialog__actions", "tf-dialog__description"];

describe("dialog chrome", () => {
  it("is not hand-rolled in any screen", () => {
    const offenders = sourceFiles(".tsx")
      .map((file) => ({
        file: relative(MODULES_DIR, file),
        hits: RETIRED.filter((cls) => readFileSync(file, "utf8").includes(`"${cls}`)),
      }))
      .filter((entry) => entry.hits.length > 0);
    expect(offenders).toEqual([]);
  });

  it("has no orphaned class — every dialog class in markup is styled somewhere", () => {
    /*
     * The other half of the same failure: markup referencing a class no stylesheet
     * defines renders unstyled, and nothing complains. Scanned across every module,
     * because the styles live in `togetherflow-common` and the markup does not.
     */
    const css = sourceFiles(".css")
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");

    const used = new Set<string>();
    for (const file of sourceFiles(".tsx")) {
      for (const match of readFileSync(file, "utf8").matchAll(/className="([^"{]+)"/g)) {
        for (const cls of match[1].split(/\s+/)) {
          if (cls.startsWith("tf-dialog") || cls.startsWith("tf-modal")) used.add(cls);
        }
      }
    }

    const orphaned = [...used].filter((cls) => !css.includes(`.${cls}`));
    expect(orphaned).toEqual([]);
  });
});
