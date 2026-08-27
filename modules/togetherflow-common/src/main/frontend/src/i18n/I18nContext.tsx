/**
 * TogetherFlow's in-house i18n layer (REQUIREMENTS.md §8: "all user-facing strings
 * externalized from day one").
 *
 * In-house rather than `react-i18next` for the same reason the design system is
 * ([ADR 0001](../../../../../../docs/ui/adr/0001-in-house-design-system.md)): the surface
 * an app actually needs here is a lookup, an interpolation and a plural rule, all three of
 * which the platform already provides through `Intl`. A dependency would buy backends,
 * detectors and namespaces this product has no use for, and would still need the same
 * catalogue discipline.
 *
 * Catalogues are flat `Record<string, string>` keyed by dotted ids. Each module owns its
 * own — `commonMessages` here, plus one per app — and the provider merges them, so a
 * shared component's copy lives beside the component rather than in every app.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { commonEn } from "./messages";

export type Messages = Record<string, string>;

/** locale tag -> catalogue. `en` is the source of truth and the final fallback. */
export type Catalogues = Record<string, Messages>;

export type MessageParams = Record<string, string | number>;

export interface TFunction {
  (key: string, params?: MessageParams): string;
}

export interface I18nContextValue {
  t: TFunction;
  locale: string;
  setLocale: (locale: string) => void;
  /** Every locale the merged catalogues actually carry, `en` first. */
  locales: string[];
}

const DEFAULT_LOCALE = "en";
const STORAGE_KEY = "togetherflow.locale";

/**
 * The catalogue used when no provider is mounted. Seeded with the shared messages so a
 * component from this package renders correct copy on its own — in a unit test, in
 * isolation, or before an app has wired the provider — rather than throwing or showing
 * raw message keys.
 *
 * An app extends it with its own catalogue via `registerFallbackMessages`, which is what
 * lets a component test render a screen directly without every such test having to build
 * a provider. Production always mounts `AppRoot`, so this is a floor, not the path.
 */
let fallbackMessages: Messages = { ...commonEn };

/** Adds an app's English catalogue to the no-provider fallback. */
export function registerFallbackMessages(catalogues: Catalogues, locale = DEFAULT_LOCALE): void {
  fallbackMessages = { ...fallbackMessages, ...(catalogues[locale] ?? {}) };
}

const fallbackI18n: I18nContextValue = {
  t: (key, params) => {
    // Through `resolveKey`, not a bare lookup: a plural key exists only as its `.one` /
    // `.other` variants, so a direct read misses every one of them and renders the key.
    // The fallback is here so a shared component is correct on its own, which it is not
    // if half the catalogue resolves.
    const message = resolveKey(fallbackMessages, key, params, DEFAULT_LOCALE);
    if (message === undefined) {
      warnMissing(key, DEFAULT_LOCALE);
      return key;
    }
    return interpolate(message, params);
  },
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  locales: [DEFAULT_LOCALE],
};

const I18nContext = createContext<I18nContextValue | null>(null);

/**
 * Warn once per missing key. A missing string renders as its own key, which is ugly on
 * purpose — silently falling back to something plausible is how untranslated copy ships
 * unnoticed.
 */
const warned = new Set<string>();

/** Vite substitutes this at build time; anywhere else it is simply absent. */
function isProduction(): boolean {
  return (
    (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process?.env?.NODE_ENV ===
    "production"
  );
}

function warnMissing(key: string, locale: string): void {
  if (isProduction()) return;
  const id = `${locale}:${key}`;
  if (warned.has(id)) return;
  warned.add(id);
  console.warn(`[togetherflow-i18n] missing message "${key}" for locale "${locale}"`);
}

/** `de-AT` resolves through `de` to `en`. */
export function localeChain(locale: string, defaultLocale = DEFAULT_LOCALE): string[] {
  const chain = [locale];
  const base = locale.split("-")[0];
  if (base && base !== locale) chain.push(base);
  if (!chain.includes(defaultLocale)) chain.push(defaultLocale);
  return chain;
}

/** Replaces `{name}` placeholders. An unmatched placeholder is left verbatim so it shows up. */
export function interpolate(template: string, params?: MessageParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/**
 * Picks a plural variant when `count` is supplied: `key` is tried as `key.one` /
 * `key.other` (whatever `Intl.PluralRules` selects for the locale) before falling back to
 * the bare key, so a message with no plural forms still resolves.
 */
function resolveKey(catalogue: Messages, key: string, params: MessageParams | undefined, locale: string): string | undefined {
  if (params && typeof params.count === "number") {
    let category: string;
    try {
      category = new Intl.PluralRules(locale).select(params.count);
    } catch {
      category = params.count === 1 ? "one" : "other";
    }
    const plural = catalogue[`${key}.${category}`] ?? catalogue[`${key}.other`];
    if (plural !== undefined) return plural;
  }
  return catalogue[key];
}

export interface I18nProviderProps {
  /** Merged catalogues; typically `mergeCatalogues(commonMessages, appMessages)`. */
  catalogues: Catalogues;
  /** Forces a locale. Omit to negotiate from storage, then the browser. */
  locale?: string;
  defaultLocale?: string;
  children: ReactNode;
}

function negotiate(catalogues: Catalogues, defaultLocale: string): string {
  const supported = Object.keys(catalogues);
  const stored = readStoredLocale();
  const candidates = [
    ...(stored ? [stored] : []),
    ...(typeof navigator !== "undefined" ? [...(navigator.languages ?? []), navigator.language] : []),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (supported.includes(candidate)) return candidate;
    const base = candidate.split("-")[0];
    if (base && supported.includes(base)) return base;
  }
  return defaultLocale;
}

function readStoredLocale(): string | undefined {
  // A private window or a browser configured to block site data throws on access, so a
  // stored preference is a convenience the provider must work without.
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function I18nProvider({
  catalogues,
  locale: forced,
  defaultLocale = DEFAULT_LOCALE,
  children,
}: I18nProviderProps) {
  const [chosen, setChosen] = useState<string>(() => forced ?? negotiate(catalogues, defaultLocale));
  const locale = forced ?? chosen;

  const setLocale = useCallback((next: string) => {
    setChosen(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Preference simply doesn't persist; the app still switches for this session.
    }
  }, []);

  useEffect(() => {
    // Screen readers and browser hyphenation both key off this, and it is wrong by
    // default: index.html ships `lang="en"` whatever the negotiated locale turns out to be.
    document.documentElement.lang = locale;
  }, [locale]);

  const t = useCallback<TFunction>(
    (key, params) => {
      for (const candidate of localeChain(locale, defaultLocale)) {
        const catalogue = catalogues[candidate];
        if (!catalogue) continue;
        const message = resolveKey(catalogue, key, params, candidate);
        if (message !== undefined) return interpolate(message, params);
      }
      warnMissing(key, locale);
      return key;
    },
    [catalogues, locale, defaultLocale],
  );

  const value = useMemo<I18nContextValue>(() => {
    const locales = Object.keys(catalogues).sort((a, b) =>
      a === defaultLocale ? -1 : b === defaultLocale ? 1 : a.localeCompare(b),
    );
    return { t, locale, setLocale, locales };
  }, [t, locale, setLocale, catalogues, defaultLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext) ?? fallbackI18n;
}

/** The common case: a component only needs to translate. */
export function useT(): TFunction {
  return useI18n().t;
}

/** Merges catalogues locale by locale; later sources win on a key collision. */
export function mergeCatalogues(...sources: Catalogues[]): Catalogues {
  const merged: Catalogues = {};
  for (const source of sources) {
    for (const [locale, messages] of Object.entries(source)) {
      merged[locale] = { ...merged[locale], ...messages };
    }
  }
  return merged;
}
