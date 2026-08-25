/**
 * Keyboard shortcuts (REQUIREMENTS.md §14.4).
 *
 * §14.4 asks for "full keyboard navigation (not just tab order — actual shortcuts for
 * claim/complete/next-task in Work, and for common Control actions)". Shared rather than
 * per-app for the same reason the shell is: the guard against firing while someone is
 * typing is easy to get subtly wrong, and four copies of it would drift.
 *
 * Bindings are declarative so the same list drives both the handler and the help dialog —
 * a shortcut nobody can discover is barely a feature, and a help dialog maintained
 * separately from the handler goes stale immediately.
 */

import { useEffect, useRef } from "react";

export interface Shortcut {
  /** Matched against `event.key`, e.g. "j", "?", "Escape". Case-sensitive. */
  key: string;
  /** Shown in the help dialog. Omit to keep a binding out of it. */
  description?: string;
  run: (event: KeyboardEvent) => void;
  /** Suppress the browser's own handling — "/" opens quick-find in some browsers. */
  preventDefault?: boolean;
  /** Skipped when false, so a binding can depend on what is on screen. */
  when?: boolean;
}

/** True while focus is somewhere that treats a keystroke as text, not as a command. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  if (element.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName);
}

export interface ShortcutOptions {
  /** Turns the whole set off, e.g. while signed out. */
  enabled?: boolean;
}

export function useShortcuts(shortcuts: Shortcut[], options: ShortcutOptions = {}): void {
  const { enabled = true } = options;
  /*
   * Held in a ref so the listener is attached once rather than re-attached on every
   * render. The bindings close over current state — passing them through the effect's
   * dependencies would either re-subscribe constantly or capture stale handlers.
   *
   * Written in an effect rather than during render: a ref mutated while rendering is
   * unsafe under concurrent rendering, and effects flush long before anyone presses a key.
   */
  const latest = useRef(shortcuts);
  useEffect(() => {
    latest.current = shortcuts;
  }, [shortcuts]);

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      // A modified key is a browser or OS command, never one of ours.
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const typing = isTypingTarget(event.target);
      for (const shortcut of latest.current) {
        if (shortcut.when === false) continue;
        if (shortcut.key !== event.key) continue;
        // Escape has to work from inside a field — it is how you get out of one.
        if (typing && event.key !== "Escape") continue;
        if (shortcut.preventDefault) event.preventDefault();
        shortcut.run(event);
        return;
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
