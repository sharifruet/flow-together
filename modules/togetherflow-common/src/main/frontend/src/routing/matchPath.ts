/**
 * Path pattern matching for the in-house router (ADR 0016).
 *
 * Patterns are plain strings with `:param` segments — `/tasks/:taskId`. No wildcards, no
 * optional segments, no regex constraints: the four apps' URL schemes are flat and none
 * of them needs one. Adding a wildcard here is one of the signals the ADR names for
 * reaching for React Router instead.
 */

import { normalisePath } from "./RouterContext";

export type PathParams = Readonly<Record<string, string>>;

/**
 * Returns the captured parameters, or null when the pattern does not match.
 *
 * Null rather than an empty object, so a pattern with no parameters is still
 * distinguishable from a miss — `matchPath("/inbox", "/history")` must not read as
 * "matched, no params".
 */
export function matchPath(pattern: string, path: string): PathParams | null {
  const patternSegments = split(pattern);
  const pathSegments = split(path);
  if (patternSegments.length !== pathSegments.length) return null;

  const params: Record<string, string> = {};
  for (let index = 0; index < patternSegments.length; index++) {
    const expected = patternSegments[index];
    const actual = pathSegments[index];
    if (expected.startsWith(":")) {
      // An empty segment cannot fill a parameter: "/tasks/" is the list, not a task
      // whose id is "".
      if (actual === "") return null;
      params[expected.slice(1)] = decodeURIComponent(actual);
      continue;
    }
    if (expected !== actual) return null;
  }
  return params;
}

/** Fills a pattern's parameters, encoding each — engine ids are opaque and may contain `/`. */
export function buildPath(pattern: string, params: PathParams = {}): string {
  const filled = split(pattern)
    .map((segment) => {
      if (!segment.startsWith(":")) return segment;
      const name = segment.slice(1);
      const value = params[name];
      if (value === undefined) {
        throw new Error(`buildPath: pattern "${pattern}" has no value for ":${name}".`);
      }
      return encodeURIComponent(value);
    })
    .join("/");
  return normalisePath(`/${filled}`);
}

/**
 * Appends a query string, dropping empty values.
 *
 * Empty is dropped rather than serialised so a cleared filter leaves the URL rather than
 * lingering as `?assignee=`, which would then be indistinguishable from "assignee set to
 * the empty string" on the next read.
 */
export function withQuery(path: string, query: Record<string, string | number | boolean | undefined | null>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

function split(path: string): string[] {
  return normalisePath(path).split("/").slice(1);
}
