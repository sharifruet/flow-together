/**
 * Token discipline, enforced (UI_POLISH_BACKLOG.md F3).
 *
 * F3's acceptance is a negative — "no raw z-index, duration or breakpoint literal remains
 * outside tokens.css; every app's media queries reference the same named breakpoints" —
 * and a negative that nothing checks is a convention, not a rule. It was a convention
 * before, which is how `0.12s ease` ended up in five places and 20/30/60/70/100 in five
 * files.
 *
 * So this reads every stylesheet in every TogetherFlow module off disk and fails on the
 * literals. It scans the real files rather than a curated list, so a new app stylesheet
 * is covered the moment it exists.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/** modules/togetherflow-common/src/main/frontend/src/theme → modules/ */
const MODULES_DIR = resolve(__dirname, "../../../../../..");
const TOKENS_FILE = resolve(__dirname, "tokens.css");

/** Every .css file under any togetherflow-* module's frontend sources. */
function stylesheets(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === "dist" || entry === "target") continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".css")) found.push(full);
    }
  };
  for (const module of readdirSync(MODULES_DIR)) {
    if (!module.startsWith("togetherflow-")) continue;
    const src = join(MODULES_DIR, module, "src/main/frontend/src");
    try {
      if (statSync(src).isDirectory()) walk(src);
    } catch {
      // A module with no frontend (the Java-only gateway and recorder) — nothing to scan.
    }
  }
  return found;
}

/** Strips block comments so a documented literal in prose is not read as code. */
function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function scan(match: (css: string) => string[]): { file: string; hits: string[] }[] {
  return stylesheets()
    .filter((file) => file !== TOKENS_FILE)
    .map((file) => ({
      file: relative(MODULES_DIR, file),
      hits: match(withoutComments(readFileSync(file, "utf8"))),
    }))
    .filter((entry) => entry.hits.length > 0);
}

describe("design tokens", () => {
  it("defines every scale F3 asked for", () => {
    const tokens = readFileSync(TOKENS_FILE, "utf8");
    for (const name of [
      "--tf-duration",
      "--tf-ease",
      "--tf-z-modal",
      "--tf-bp-md",
      "--tf-leading-normal",
      "--tf-weight-semibold",
      "--tf-border-width",
      "--tf-text-3xl",
    ]) {
      expect(tokens, `tokens.css is missing ${name}`).toContain(`${name}:`);
    }
  });

  it("has no raw z-index outside the scale", () => {
    // `z-index: 0|1|auto` is a local stacking decision inside one component, not a
    // position in the app's layer stack, so it does not need a token.
    const offenders = scan((css) =>
      [...css.matchAll(/z-index:\s*([^;]+);/g)]
        .map((hit) => hit[1].trim())
        .filter((value) => !value.startsWith("var(--tf-z-") && !["0", "1", "auto"].includes(value)),
    );
    expect(offenders).toEqual([]);
  });

  it("has no raw transition or animation duration", () => {
    const offenders = scan((css) =>
      [...css.matchAll(/(?:transition|animation)(?:-duration)?:\s*([^;]+);/g)]
        .map((hit) => hit[1])
        .filter((value) => /(?<!var\([^)]*)\b\d*\.?\d+m?s\b/.test(value.replace(/var\([^)]*\)/g, ""))),
    );
    expect(offenders).toEqual([]);
  });

  it("uses only the named breakpoints in media queries", () => {
    const allowed = new Set(["640px", "768px", "1024px", "1280px"]);
    const offenders = scan((css) =>
      [...css.matchAll(/\((?:min|max)-width:\s*([^)]+)\)/g)]
        .map((hit) => hit[1].trim())
        .filter((value) => !allowed.has(value)),
    );
    expect(offenders).toEqual([]);
  });

  it("scans more than just this module, or it is not enforcing anything", () => {
    const modules = new Set(
      stylesheets().map((file) => relative(MODULES_DIR, file).split("/")[0]),
    );
    // common plus the four apps.
    expect(modules.size).toBeGreaterThanOrEqual(5);
  });
});
