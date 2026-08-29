/**
 * Every CSS class the apps render must exist in a stylesheet (F6, F2).
 *
 * This exists because sixteen dialogs shipped broken and nobody noticed. W1.4 introduced
 * `Modal` and deleted the `.tf-dialog` styles it replaced, but only converted some call
 * sites — so every unconverted dialog rendered as an ordinary block in the page flow,
 * below the fold, with no backdrop and no focus trap. It reached a user as "the New case
 * button doesn't work".
 *
 * Nothing caught it: unit tests assert on roles and text, not on layout; the visual
 * baselines never open a dialog; and the type system has no opinion about strings. A
 * `grep` would have caught it on the day, which is exactly what this is.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const MODULES = resolve(__dirname, "../../../../../..");

function walk(dir: string, match: RegExp): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (entry === "node_modules" || entry === "dist" || entry === "target") return [];
    if (statSync(full).isDirectory()) return walk(full, match);
    return match.test(entry) ? [full] : [];
  });
}

/** Class names the apps actually render, from every `className="..."` literal. */
/**
 * Classes that are rendered but deliberately carry no rule of their own — structural
 * hooks, or elements styled through a parent selector (`.tf-check input`, `.tf-variables
 * td`). Listed rather than ignored by pattern, so adding one is a decision someone makes.
 *
 * A ratchet, not a target: the bug this guards against is a class that *stops* being
 * styled, and every entry here has been checked to carry no layout.
 */
const UNSTYLED_BY_DESIGN = new Set([
  "tf-attachments", "tf-brand__mark", "tf-breadcrumb__item", "tf-check__input",
  "tf-comments__item", "tf-data-model", "tf-detail__empty-hint", "tf-detail__empty-title",
  "tf-editor__identity", "tf-flip-x", "tf-form-canvas", "tf-form__container",
  "tf-illustration", "tf-pagination__size-label", "tf-people-tab", "tf-planitems__item",
  "tf-profile__info", "tf-properties__hint", "tf-properties__row", "tf-properties__rows",
  "tf-sentries__actions", "tf-sentries__part", "tf-variables", "tf-variables__name",
  "tf-variables__type", "tf-variables__value",
]);

function renderedClasses(): Map<string, string> {
  const found = new Map<string, string>();
  for (const app of readdirSync(MODULES).filter((d) => d.startsWith("togetherflow-"))) {
    const src = join(MODULES, app, "src/main/frontend/src");
    let files: string[];
    try {
      files = walk(src, /\.tsx$/);
    } catch {
      continue; // A Java-only module has no frontend.
    }
    for (const file of files) {
      if (/\.test\.tsx$/.test(file)) continue;
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/className="([^"{}]+)"/g)) {
        for (const name of match[1]
          .split(/\s+/)
          .filter((n) => n.startsWith("tf-") && !UNSTYLED_BY_DESIGN.has(n))) {
          if (!found.has(name)) found.set(name, file.replace(MODULES, ""));
        }
      }
    }
  }
  return found;
}

/** Every class any stylesheet defines. */
function definedClasses(): Set<string> {
  const defined = new Set<string>();
  for (const app of readdirSync(MODULES).filter((d) => d.startsWith("togetherflow-"))) {
    const src = join(MODULES, app, "src/main/frontend/src");
    let files: string[];
    try {
      files = walk(src, /\.css$/);
    } catch {
      continue;
    }
    for (const file of files) {
      for (const match of readFileSync(file, "utf8").matchAll(/\.(tf-[A-Za-z0-9_-]+)/g)) {
        defined.add(match[1]);
      }
    }
  }
  return defined;
}

describe("rendered classes", () => {
  it("are all defined by some stylesheet", () => {
    const defined = definedClasses();
    const orphans = [...renderedClasses()]
      .filter(([name]) => !defined.has(name))
      .map(([name, file]) => `${name}  (${file})`)
      .sort();

    expect(orphans).toEqual([]);
  });
});
