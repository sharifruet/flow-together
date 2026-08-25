/**
 * Catalogue conformance checking (REQUIREMENTS.md §8).
 *
 * Externalizing strings is only half the requirement; the other half is that they stay
 * externalized and stay resolvable. Two things rot silently otherwise:
 *
 *   - a key typo'd at the call site renders as the raw key, which looks like copy nobody
 *     wrote rather than like a bug;
 *   - a translation added later drifts out of step with `en` and shows English in the
 *     middle of another language.
 *
 * Both become test failures here. Imported only from tests — it reads the filesystem, so
 * it is deliberately not re-exported from the package index, which would drag `node:fs`
 * into the browser bundle.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Catalogues, Messages } from "../i18n/I18nContext";

/** `t("some.key")` and `t(\`some.key\`)`, but never a template with a substitution. */
const STATIC_KEY = /\bt\(\s*["'`]([A-Za-z][\w.-]*)["'`]/g;
/** `t(`prefix.${expr}`)` — the prefix is checkable even though the whole key is not. */
const DYNAMIC_KEY = /\bt\(\s*`([A-Za-z][\w.-]*\.)\$\{/g;
/**
 * Any quoted dotted literal. Keys are not always written at the call site: a screen may
 * map an enum to keys (`ACTION_KEYS[action]`) and pass the result to `t`. Matching a
 * literal against the catalogue exactly — rather than guessing from its shape — makes
 * those visible without inventing usage that isn't there.
 */
const KEY_LITERAL = /["'`]([A-Za-z][\w-]*(?:\.[\w-]+)+)["'`]/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === "generated" || entry === "node_modules" ? [] : sourceFiles(full);
    }
    if (!/\.tsx?$/.test(entry)) return [];
    if (/\.test\.|\.test-d\./.test(entry)) return [];
    return [full];
  });
}

export interface KeyUsage {
  /** Keys written out in full at a `t(...)` call, which must resolve exactly. */
  staticKeys: Set<string>;
  /** Prefixes of computed keys — at least one key must start with each. */
  dynamicPrefixes: Set<string>;
  /** Every dotted string literal in the source, for keys referenced indirectly. */
  literals: Set<string>;
}

export function collectKeyUsage(srcDir: string): KeyUsage {
  const staticKeys = new Set<string>();
  const dynamicPrefixes = new Set<string>();
  const literals = new Set<string>();

  for (const file of sourceFiles(srcDir)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(STATIC_KEY)) staticKeys.add(match[1]);
    for (const match of source.matchAll(DYNAMIC_KEY)) dynamicPrefixes.add(match[1]);
    for (const match of source.matchAll(KEY_LITERAL)) literals.add(match[1]);
  }
  return { staticKeys, dynamicPrefixes, literals };
}

/**
 * Keys a screen asks for that no catalogue supplies. Plural forms count as present when
 * either the bare key or its `.other` variant exists.
 */
export function missingKeys(usage: KeyUsage, messages: Messages): string[] {
  const has = (key: string) => key in messages || `${key}.other` in messages;
  const missing = [...usage.staticKeys].filter((key) => !has(key));

  for (const prefix of usage.dynamicPrefixes) {
    if (!Object.keys(messages).some((key) => key.startsWith(prefix))) {
      missing.push(`${prefix}* (computed)`);
    }
  }
  return missing.sort();
}

/** Keys a catalogue defines that nothing asks for — dead copy, or a renamed call site. */
export function unusedKeys(usage: KeyUsage, messages: Messages): string[] {
  const isUsed = (key: string): boolean => {
    if (usage.staticKeys.has(key) || usage.literals.has(key)) return true;
    // A plural variant is used when its stem is: `t("items", {count})` reads `items.one`.
    const stem = key.replace(/\.(one|other|zero|two|few|many)$/, "");
    if (usage.staticKeys.has(stem) || usage.literals.has(stem)) return true;
    return [...usage.dynamicPrefixes].some((prefix) => key.startsWith(prefix));
  };
  return Object.keys(messages).filter((key) => !isUsed(key)).sort();
}

/** Locales whose key set differs from the source locale's. */
export function localeGaps(catalogues: Catalogues, sourceLocale = "en"): Record<string, string[]> {
  const source = Object.keys(catalogues[sourceLocale] ?? {});
  const gaps: Record<string, string[]> = {};
  for (const [locale, messages] of Object.entries(catalogues)) {
    if (locale === sourceLocale) continue;
    const missing = source.filter((key) => !(key in messages));
    if (missing.length > 0) gaps[locale] = missing;
  }
  return gaps;
}
