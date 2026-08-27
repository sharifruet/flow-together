/**
 * A list screen's state — filters, sort, page — held in the URL (F1: "URL-encode: view,
 * selected entity id, active filters, page offset").
 *
 * Written once here because every list screen in all four apps wants exactly this, and
 * the alternative is each screen inventing its own encoding — which is how one screen's
 * `?q=` becomes another's `?search=` and a saved link stops meaning anything.
 *
 * Three encoding decisions worth stating, because each is load-bearing:
 *
 * 1. **A filter at its default is omitted.** A URL that spelled out every default would
 *    be unreadable, and — more importantly — `?due=any` and "due not set" would then be
 *    two ways of saying one thing that the next reader has to reconcile.
 * 2. **`page` is 1-based, `start` is not.** The REST resources page by offset; people
 *    read page numbers. The conversion happens here so no screen does it twice.
 * 3. **Page size is remembered per list *and* in the URL** (C2 asks for both). The URL
 *    wins when present, so a shared link shows the sender's page rather than silently
 *    re-paginating to the recipient's saved preference.
 */

import { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "./RouterContext";
import { withQuery } from "./matchPath";
import { usePersistentState } from "../hooks/usePersistentState";

export type SortOrder = "asc" | "desc";

export interface SortState {
  key: string;
  order: SortOrder;
}

export const PAGE_SIZES = [25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

const isPageSize = (value: unknown): value is PageSize =>
  PAGE_SIZES.includes(value as PageSize);

/** Filters are strings because that is what a query string holds. */
export type Filters = Record<string, string>;

export interface ListStateOptions<F extends Filters> {
  /** Every filter key, with the value that means "not filtered". */
  defaults: F;
  defaultSize?: PageSize;
  /** Omit to leave the list unsorted, which also hides the sort affordances. */
  defaultSort?: SortState;
  /** Namespaces the remembered page size — "work.inbox". */
  preferenceKey: string;
}

export interface ListState<F extends Filters> {
  filters: F;
  /** Merges a patch and returns to page 1 — a filtered list's page 3 is meaningless. */
  setFilters: (patch: Partial<F>) => void;
  /** Replaces every filter at once, for applying a saved view. */
  replaceFilters: (next: F) => void;
  /** True when anything differs from the defaults — drives the "clear filters" affordance. */
  isFiltered: boolean;
  clearFilters: () => void;

  /** Row offset, which is what the REST resources take. */
  start: number;
  setStart: (start: number) => void;
  size: PageSize;
  setSize: (size: PageSize) => void;

  sort: SortState | undefined;
  setSort: (sort: SortState) => void;
}

export function useListState<F extends Filters>({
  defaults: givenDefaults,
  defaultSize = 25,
  defaultSort: givenSort,
  preferenceKey,
}: ListStateOptions<F>): ListState<F> {
  const { path, query } = useLocation();
  const navigate = useNavigate();

  /*
   * Callers pass `defaults` and `defaultSort` as object literals — which is the natural
   * way to write them and gives a fresh identity on every render. Depending on that
   * identity makes every memo below recompute, which hands the screen a new query object,
   * which refetches, which re-renders: an infinite loop that only shows up once a screen
   * is wired to a live API.
   *
   * So identity is derived from the *content*. The serialised form is the dependency and
   * the parsed value is what everything downstream uses, which makes a literal safe to
   * pass and needs nothing of the caller.
   */
  const defaultsKey = JSON.stringify(givenDefaults);
  const defaults = useMemo(() => JSON.parse(defaultsKey) as F, [defaultsKey]);
  const sortKey = JSON.stringify(givenSort ?? null);
  const defaultSort = useMemo(() => JSON.parse(sortKey) as SortState | null, [sortKey]);
  const [rememberedSize, rememberSize] = usePersistentState<PageSize>(
    `${preferenceKey}.pageSize`,
    defaultSize,
    isPageSize,
  );

  /*
   * `query` is rebuilt from the URL on every location change, so it too is a fresh object
   * each time even when nothing changed. Same fix, same reason as above.
   */
  const queryKey = JSON.stringify(query);

  const filters = useMemo(() => {
    const resolved = { ...defaults };
    for (const key of Object.keys(defaults)) {
      const value = query[key];
      if (value !== undefined) (resolved as Filters)[key] = value;
    }
    return resolved;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaults, queryKey]);

  const size = isPageSize(Number(query.size)) ? (Number(query.size) as PageSize) : rememberedSize;
  const page = Math.max(1, Number(query.page) || 1);
  const start = (page - 1) * size;

  const sort = useMemo<SortState | undefined>(() => {
    if (!defaultSort) return undefined;
    const key = query.sort ?? defaultSort.key;
    const order = query.order === "desc" || query.order === "asc" ? query.order : defaultSort.order;
    return { key, order };
  }, [defaultSort, query.sort, query.order]);



  /** Drops anything at its default, so the URL carries only what the user chose. */
  const encode = useCallback(
    (next: Partial<Record<string, string | number | undefined>>) => {
      const merged: Record<string, string | number | undefined> = { ...query, ...next };
      for (const [key, fallback] of Object.entries(defaults)) {
        if (merged[key] === fallback) merged[key] = undefined;
      }
      if (merged.page === 1) merged.page = undefined;
      if (Number(merged.size) === defaultSize) merged.size = undefined;
      if (defaultSort && merged.sort === defaultSort.key && merged.order === defaultSort.order) {
        merged.sort = undefined;
        merged.order = undefined;
      }
      return merged;
    },
    // queryKey rather than query: see above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryKey, defaults, defaultSize, defaultSort],
  );

  const push = useCallback(
    (next: Partial<Record<string, string | number | undefined>>, options?: { push?: boolean }) => {
      navigate(withQuery(path, encode(next)), { replace: !options?.push });
    },
    [navigate, path, encode],
  );

  const setFilters = useCallback(
    (patch: Partial<F>) => push({ ...(patch as Filters), page: undefined }),
    [push],
  );

  const replaceFilters = useCallback(
    (next: F) => {
      // Every key is written, so a saved view that omits a filter resets it rather than
      // inheriting whatever the user had typed.
      const patch: Record<string, string> = {};
      for (const key of Object.keys(defaults)) patch[key] = next[key] ?? defaults[key];
      push({ ...patch, page: undefined });
    },
    [push, defaults],
  );

  const isFiltered = useMemo(
    () => Object.keys(defaults).some((key) => filters[key] !== defaults[key]),
    [defaults, filters],
  );

  return {
    filters,
    setFilters,
    replaceFilters,
    isFiltered,
    clearFilters: useCallback(() => replaceFilters(defaults), [replaceFilters, defaults]),

    start,
    // Pushed, not replaced: paging is a navigation the user asked for, so Back should
    // return to the previous page rather than skipping the whole list.
    setStart: useCallback(
      (nextStart: number) => push({ page: Math.floor(nextStart / size) + 1 }, { push: true }),
      [push, size],
    ),
    size,
    setSize: useCallback(
      (nextSize: PageSize) => {
        rememberSize(nextSize);
        push({ size: nextSize, page: undefined });
      },
      [push, rememberSize],
    ),

    sort,
    setSort: useCallback((next: SortState) => push({ sort: next.key, order: next.order, page: undefined }), [push]),
  };
}
