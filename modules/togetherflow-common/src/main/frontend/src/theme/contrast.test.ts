/**
 * Colour contrast, checked against the tokens themselves (REQUIREMENTS.md §13.6, §14.2).
 *
 * This exists because the automated accessibility tests cannot do it: axe runs in jsdom,
 * which applies no stylesheet and has no canvas, so `color-contrast` is switched off there
 * and says nothing. §13.6 treats automated axe as only half the requirement — this is a
 * piece of the other half that a machine *can* check, done by reading the palette rather
 * than a rendered page.
 *
 * It was written after a real report: fields in the BPMN properties panel were "hard to
 * see". The text was fine; the *boundaries* were not. `--tf-border-strong` sat at 1.90:1
 * against white and 1.87:1 against the dark surface, where WCAG 1.4.11 requires 3:1 for
 * the visual boundary of a user-interface component. Below that threshold an input is
 * text floating on a panel.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(__dirname, "tokens.css"), "utf8");

/**
 * Reads a token from a specific block, because the dark values are declared twice — once
 * under `prefers-color-scheme` and once under an explicit `[data-tf-theme="dark"]`.
 */
function token(name: string, theme: "light" | "dark", depth = 0): string {
  const blocks = css.split(/@media \(prefers-color-scheme: dark\)|:root\[data-tf-theme="dark"\]/);
  const block = theme === "light" ? blocks[0] : blocks.slice(1).join("\n");
  const match = block.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`No --${name} in the ${theme} palette`);

  const value = match[1].trim();
  if (value.startsWith("#")) return value;

  // Some tokens alias another, e.g. `--tf-info: var(--tf-blue-700)`. Follow one hop at a
  // time, with a bound so a circular alias fails loudly rather than hanging the suite.
  const alias = value.match(/var\(\s*--([\w-]+)/);
  if (alias && depth < 5) return token(alias[1], theme, depth + 1);
  throw new Error(`--${name} in the ${theme} palette is not a colour: ${value}`);
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

/** WCAG 2.1: 4.5:1 for body text, 3:1 for large text and for UI component boundaries. */
const TEXT = 4.5;
const NON_TEXT = 3;

describe.each(["light", "dark"] as const)("%s theme contrast", (theme) => {
  const get = (name: string) => token(name, theme);

  it("gives body text enough contrast on every surface it lands on", () => {
    for (const surface of ["tf-bg", "tf-bg-subtle", "tf-bg-raised"]) {
      const ratio = contrast(get("tf-text"), get(surface));
      expect(ratio, `--tf-text on --${surface} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(TEXT);
    }
  });

  it("gives muted text enough contrast, since hints carry real meaning", () => {
    // Hints explain what a field does — they are not decoration, so they meet the text bar.
    for (const surface of ["tf-bg", "tf-bg-subtle", "tf-bg-raised"]) {
      const ratio = contrast(get("tf-text-muted"), get(surface));
      expect(ratio, `--tf-text-muted on --${surface} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(TEXT);
    }
  });

  it("makes input boundaries visible against the surfaces they sit on", () => {
    /*
     * The regression this file was written for. An input's border is the only thing that
     * says where the field is, so it is a UI component boundary under WCAG 1.4.11.
     */
    for (const surface of ["tf-bg", "tf-bg-subtle", "tf-bg-raised"]) {
      const ratio = contrast(get("tf-border-strong"), get(surface));
      expect(
        ratio,
        `--tf-border-strong on --${surface} is ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(NON_TEXT);
    }
  });

  it("keeps status colours legible on their own backgrounds", () => {
    for (const status of ["success", "warning", "danger", "info"]) {
      const ratio = contrast(get(`tf-${status}`), get(`tf-${status}-bg`));
      expect(ratio, `--tf-${status} on --tf-${status}-bg is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
        NON_TEXT,
      );
    }
  });
});
