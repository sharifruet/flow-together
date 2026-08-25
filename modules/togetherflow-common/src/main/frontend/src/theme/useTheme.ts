/**
 * Light/dark preference (REQUIREMENTS.md §7.5).
 *
 * The stylesheet already understood `data-tf-theme` in both directions — a media query
 * for the system default, and explicit `light`/`dark` overrides. What was missing was
 * anyone to set it, so the apps followed the OS with no way to disagree.
 *
 * Three states, not two: "system" is a real choice and the default, distinct from
 * picking light or dark outright. Storing "system" as an absence would make a user who
 * deliberately chose it indistinguishable from one who never chose at all.
 */

import { useCallback, useEffect, useState } from "react";

export type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "togetherflow.theme";

function readStored(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === "light" || value === "dark" || value === "system") return value;
  } catch {
    // Private browsing and blocked site data both throw; the default is fine.
  }
  return "system";
}

/** Applies the preference to the document root, where the token stylesheet reads it. */
function apply(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === "system") root.removeAttribute("data-tf-theme");
  else root.setAttribute("data-tf-theme", preference);
}

export function useTheme(): {
  theme: ThemePreference;
  setTheme: (next: ThemePreference) => void;
} {
  const [theme, setThemeState] = useState<ThemePreference>(readStored);

  // Applied in an effect rather than during render: touching document during render
  // would be a side effect, and React may render without committing.
  useEffect(() => {
    apply(theme);
  }, [theme]);

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // A preference that cannot be persisted still applies for this session.
    }
  }, []);

  return { theme, setTheme };
}
