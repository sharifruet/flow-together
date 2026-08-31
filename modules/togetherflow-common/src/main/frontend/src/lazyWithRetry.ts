/**
 * `React.lazy` that survives a failed chunk load.
 *
 * `lazy()` caches the promise it is given — including a rejected one. So a dynamic import
 * that fails once fails forever: the error boundary's "Retry" re-renders, `lazy` hands
 * back the same rejection, and the screen is permanently dead until a full page reload.
 * The user sees "This screen stopped working" and nothing they do on that screen helps.
 *
 * Two causes, both real and neither the app's fault:
 *
 * - **A stale entry.** After a deploy the hashed chunk filenames change, so any tab open
 *   across the deploy asks for a chunk that no longer exists. This is the common one in
 *   production and it affects every lazily-loaded screen at once.
 * - **A transient network failure**, or — in development — Vite re-optimising its
 *   dependencies and invalidating the `?v=` hash a loaded page is still holding.
 *
 * So: retry a couple of times for the transient case, then reload the page once for the
 * stale-entry case, because reloading is the only thing that *can* fix a chunk that is
 * genuinely gone. The reload is guarded — see `alreadyReloadedFor` — since a reload loop
 * would be far worse than the error it replaces.
 */

import { lazy, type ComponentType } from "react";

const RETRIES = 2;
const RETRY_DELAY_MS = 300;
const STORAGE_PREFIX = "togetherflow.chunkReload.";

/**
 * Has this build already reloaded once trying to fetch this chunk?
 *
 * `sessionStorage`, so the guard lasts the tab's life and not beyond: a genuinely broken
 * deploy should not leave a user unable to auto-recover tomorrow. Every access is guarded
 * — private windows and blocked site data both throw, and a hardening measure must not
 * itself become a crash.
 */
function alreadyReloadedFor(key: string): boolean {
  try {
    return window.sessionStorage.getItem(STORAGE_PREFIX + key) === "1";
  } catch {
    // Storage unavailable: treat it as "already reloaded" so we never loop.
    return true;
  }
}

function markReloadedFor(key: string): void {
  try {
    window.sessionStorage.setItem(STORAGE_PREFIX + key, "1");
  } catch {
    // Nothing to do; the read above fails closed for the same reason.
  }
}

/** Cleared on a successful load, so a later genuine failure can reload again. */
function clearReloadFor(key: string): void {
  try {
    window.sessionStorage.removeItem(STORAGE_PREFIX + key);
  } catch {
    // As above.
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- React.lazy's own constraint.
export function lazyWithRetry<T extends ComponentType<any>>(
  load: () => Promise<{ default: T }>,
  /** Names the chunk in the reload guard. Must be stable across renders. */
  key: string,
): ReturnType<typeof lazy<T>> {
  return lazy(async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      try {
        const module = await load();
        clearReloadFor(key);
        return module;
      } catch (error) {
        lastError = error;
        if (attempt < RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)));
        }
      }
    }

    /*
     * Retrying did not help, so the chunk is probably gone rather than briefly
     * unreachable. Reload once — which re-fetches the entry and with it the current chunk
     * names. If that still does not work, fall through to the error boundary rather than
     * reloading again.
     */
    if (!alreadyReloadedFor(key)) {
      markReloadedFor(key);
      window.location.reload();
      // Never settles; the reload takes the page. Returning would flash the boundary.
      return new Promise<{ default: T }>(() => {});
    }
    throw lastError;
  });
}
