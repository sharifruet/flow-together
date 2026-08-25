/**
 * The app draft model, kept separate from the builder component so the library can
 * seed a new app without statically importing the editor — which would defeat the
 * lazy chunk the editor is loaded in.
 */

import type { ModelResponse } from "@togetherflow/common";

/** What a `togetherflow:app` draft stores as its source. */
export interface AppDraft {
  key: string;
  name: string;
  description?: string;
  theme?: string;
  icon?: string;
  /** Model ids this app bundles. */
  modelIds: string[];
}

export function emptyAppDraft(key: string, name: string): AppDraft {
  return { key, name, modelIds: [] };
}

export function parseAppDraft(source: string | null, fallback: ModelResponse): AppDraft {
  if (source) {
    try {
      const parsed = JSON.parse(source) as Partial<AppDraft>;
      return {
        key: parsed.key ?? fallback.key ?? "app",
        name: parsed.name ?? fallback.name ?? "App",
        description: parsed.description,
        theme: parsed.theme,
        icon: parsed.icon,
        modelIds: Array.isArray(parsed.modelIds) ? parsed.modelIds : [],
      };
    } catch {
      // A malformed draft should not block editing; fall through to a fresh one.
    }
  }
  return { key: fallback.key ?? "app", name: fallback.name ?? "App", modelIds: [] };
}
