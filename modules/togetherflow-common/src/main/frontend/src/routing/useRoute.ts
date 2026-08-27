/**
 * Resolves the current location against an app's route table (ADR 0016).
 *
 * Deliberately shaped to replace the `useState<WorkView>("inbox")` each app holds today:
 * a route table is a list of ids and patterns, and what comes back is the id plus its
 * captured parameters. That keeps every screen's existing `view === "inbox"` switch
 * intact and moves only where the value comes from.
 */

import { useLocation } from "./RouterContext";
import { matchPath, type PathParams } from "./matchPath";

export interface RouteDefinition<Id extends string> {
  id: Id;
  /** e.g. "/inbox" or "/inbox/:taskId". Matched in table order, so put the more specific first. */
  pattern: string;
}

export interface RouteMatch<Id extends string> {
  id: Id;
  params: PathParams;
  query: Readonly<Record<string, string>>;
  /** True when nothing matched and the fallback was used — the app's 404. */
  fallback: boolean;
}

export function useRoute<Id extends string>(
  routes: RouteDefinition<Id>[],
  fallbackId: Id,
): RouteMatch<Id> {
  const { path, query } = useLocation();

  /*
   * Not memoised by hand. A route table is a handful of patterns and the match is a
   * string split, so the work is far cheaper than the bookkeeping — and a `useMemo` keyed
   * on the `routes` array cannot be proven stable by the compiler, which is what the
   * `preserve-manual-memoization` lint was reporting.
   */
  for (const route of routes) {
    const params = matchPath(route.pattern, path);
    if (params) return { id: route.id, params, query, fallback: false };
  }
  return { id: fallbackId, params: {}, query, fallback: true };
}
