/**
 * List state — filters, sort, page offset — held in the query string (F1: "URL-encode:
 * view, selected entity id, active filters, page offset").
 *
 * Writes `replace` by default. Typing into a filter box is not a navigation the user
 * asked for, and pushing an entry per keystroke turns Back into an undo buffer for text
 * input, which is worse than no history at all.
 */

import { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "./RouterContext";
import { withQuery } from "./matchPath";

export interface QueryStateOptions {
  /** Push a history entry instead of replacing. Off by default — see above. */
  push?: boolean;
}

export type QueryPatch = Record<string, string | number | boolean | undefined | null>;

export interface QueryState {
  query: Readonly<Record<string, string>>;
  /** Reads one key, falling back when absent. */
  get: (key: string, fallback?: string) => string | undefined;
  /** Reads one key as a number, falling back when absent or unparseable. */
  getNumber: (key: string, fallback: number) => number;
  /** Merges a patch into the query string. Empty/undefined values remove their key. */
  setQuery: (patch: QueryPatch, options?: QueryStateOptions) => void;
}

export function useQueryState(): QueryState {
  const { path, query } = useLocation();
  const navigate = useNavigate();

  const setQuery = useCallback(
    (patch: QueryPatch, options: QueryStateOptions = {}) => {
      navigate(withQuery(path, { ...query, ...patch }), { replace: !options.push });
    },
    [navigate, path, query],
  );

  return useMemo(
    () => ({
      query,
      get: (key, fallback) => query[key] ?? fallback,
      getNumber: (key, fallback) => {
        const parsed = Number(query[key]);
        return Number.isFinite(parsed) ? parsed : fallback;
      },
      setQuery,
    }),
    [query, setQuery],
  );
}
