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
  /**
   * W2.3 (I7): tags and display order, which Enterprise's app editor carries and ours
   * did not. Both are draft-only — the engine's app deployment reads neither — so they
   * describe the app *here*, in the library and the switcher, not once deployed.
   */
  tags?: string[];
  /** Lower sorts first in the library. Unset sorts after everything numbered. */
  displayOrder?: number;
  /**
   * App-level variables (W3.3), matching Flowable Design's own app editor.
   *
   * Draft-only, like `tags` and `displayOrder` above: this distribution's app engine
   * reads none of them, so they document what an app expects rather than seeding it at
   * deployment. The builder says so on screen rather than implying otherwise — a
   * variable that looks configured but is never set is worse than one that is absent.
   */
  variables?: AppVariable[];
}

export interface AppVariable {
  name: string;
  type: "string" | "integer" | "double" | "boolean" | "date";
  /**
   * `value` is overwritten on every deployment; `default` is only applied where the
   * variable has no value yet. Flowable Design draws the same distinction, and it is the
   * one that decides whether redeploying an app resets what people changed at runtime.
   */
  mode: "value" | "default";
  value?: string;
  description?: string;
}

/** A variable name the engine and its expressions can use — same rule as a field id. */
export function isValidVariableName(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
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
        tags: Array.isArray(parsed.tags)
          ? parsed.tags.filter((tag): tag is string => typeof tag === "string")
          : undefined,
        displayOrder:
          typeof parsed.displayOrder === "number" && Number.isFinite(parsed.displayOrder)
            ? parsed.displayOrder
            : undefined,
      };
    } catch {
      // A malformed draft should not block editing; fall through to a fresh one.
    }
  }
  return { key: fallback.key ?? "app", name: fallback.name ?? "App", modelIds: [] };
}
