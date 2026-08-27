/**
 * A piece of UI preference that survives a reload, stored per browser.
 *
 * Extracted when `DataTable` needed three of them at once (column visibility, density,
 * page size). The pattern was already written twice by hand — in `useTheme` and in
 * `savedViews` — each with its own try/catch around storage, and a third copy inside the
 * table would have made the "storage can throw" handling something each caller remembers.
 *
 * Per browser, not per account: this repo's REST layer has no per-user preference store,
 * and `savedViews` already documents that limitation rather than implying these sync.
 */

import { useCallback, useState } from "react";

const PREFIX = "togetherflow.pref.";

export function readPreference<T>(key: string, fallback: T, isValid: (value: unknown) => value is T): T {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    // Storage is user-writable; anything that is not the shape we wrote is discarded
    // rather than trusted, which is what keeps a corrupted value from breaking a screen.
    return isValid(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function usePersistentState<T>(
  key: string,
  fallback: T,
  isValid: (value: unknown) => value is T,
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => readPreference(key, fallback, isValid));

  const set = useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.localStorage.setItem(PREFIX + key, JSON.stringify(next));
      } catch {
        // A preference that cannot be persisted still applies for this session.
      }
    },
    [key],
  );

  return [value, set];
}
