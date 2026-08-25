/**
 * Saved filters/views (REQUIREMENTS.md §14.4): "the legacy Task app supported saved task
 * filters — Work (§7.1) and Control (§7.2) should too, rather than making users rebuild
 * the same filter every session."
 *
 * Stored per browser rather than per account: this repo's REST layer has no per-user
 * preference store, and inventing one would mean engine-side work the requirement does
 * not ask for. That is a real limitation — views do not follow a user to another machine
 * — and the UI says so rather than implying they sync.
 *
 * Every read and write is guarded: a private window, cleared site data or a browser set
 * to block storage all throw on access, and a saved view is a convenience the screen must
 * work without.
 */

const PREFIX = "togetherflow.views.";
/** Bounded so a runaway caller cannot fill the origin's storage quota. */
const MAX_VIEWS = 25;

export interface SavedView<T> {
  id: string;
  name: string;
  value: T;
  /** ISO timestamp, so the list can be shown most-recent-first. */
  savedAt: string;
}

function storageKey(namespace: string): string {
  return `${PREFIX}${namespace}`;
}

export function readSavedViews<T>(namespace: string): SavedView<T>[] {
  try {
    const raw = window.localStorage.getItem(storageKey(namespace));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Anything that isn't the shape we wrote is discarded rather than trusted: this
    // is user-writable storage, and a half-valid view would break the screen using it.
    return parsed.filter(isSavedView<T>);
  } catch {
    return [];
  }
}

function isSavedView<T>(candidate: unknown): candidate is SavedView<T> {
  return (
    typeof candidate === "object" &&
    candidate !== null &&
    typeof (candidate as SavedView<T>).id === "string" &&
    typeof (candidate as SavedView<T>).name === "string" &&
    "value" in candidate
  );
}

export function writeSavedViews<T>(namespace: string, views: SavedView<T>[]): void {
  try {
    window.localStorage.setItem(storageKey(namespace), JSON.stringify(views.slice(0, MAX_VIEWS)));
  } catch {
    // Storage unavailable or full — the view simply doesn't persist.
  }
}

export function newViewId(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && "randomUUID" in cryptoObj) return cryptoObj.randomUUID();
  return `view-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
