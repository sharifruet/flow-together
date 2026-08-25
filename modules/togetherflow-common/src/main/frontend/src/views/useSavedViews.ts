import { useCallback, useState } from "react";
import { newViewId, readSavedViews, writeSavedViews, type SavedView } from "./savedViews";

export interface SavedViewsApi<T> {
  views: SavedView<T>[];
  /** Saving over an existing name replaces it, rather than growing a list of duplicates. */
  save: (name: string, value: T) => void;
  remove: (id: string) => void;
}

/**
 * @param namespace Scopes the views to one list, e.g. "work.inbox" or "control.instances".
 */
export function useSavedViews<T>(namespace: string): SavedViewsApi<T> {
  const [views, setViews] = useState<SavedView<T>[]>(() => readSavedViews<T>(namespace));

  const persist = useCallback(
    (next: SavedView<T>[]) => {
      setViews(next);
      writeSavedViews(namespace, next);
    },
    [namespace],
  );

  const save = useCallback(
    (name: string, value: T) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const existing = views.find((view) => view.name === trimmed);
      const entry: SavedView<T> = {
        id: existing?.id ?? newViewId(),
        name: trimmed,
        value,
        savedAt: new Date().toISOString(),
      };
      persist([entry, ...views.filter((view) => view.id !== entry.id)]);
    },
    [views, persist],
  );

  const remove = useCallback(
    (id: string) => persist(views.filter((view) => view.id !== id)),
    [views, persist],
  );

  return { views, save, remove };
}
