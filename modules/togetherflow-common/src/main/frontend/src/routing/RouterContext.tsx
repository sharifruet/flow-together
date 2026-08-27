/**
 * The in-house router ([ADR 0016](../../../../../../docs/ui/adr/0016-in-house-router.md),
 * UI_POLISH_BACKLOG.md F1).
 *
 * Small on purpose. `history.pushState`, `popstate`, `URL` and `URLSearchParams` are the
 * three hard parts and the platform already ships all of them; what is left is pattern
 * matching, a context, and a `<Link>` that knows which clicks are the browser's to
 * handle. The API is named after React Router's so the knowledge transfers, and so that
 * the swap the ADR's revisit trigger describes is mechanical.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export interface Location {
  /** Path with no trailing slash, always starting with "/". "/" for the root. */
  path: string;
  /** Query string parameters, flattened — no list screen needs a repeated key. */
  query: Readonly<Record<string, string>>;
}

export interface NavigateOptions {
  /**
   * Replace the current entry instead of pushing a new one. Used for state the user did
   * not ask to navigate to — a filter edit, a corrected default — so Back still means
   * "the screen before this one" rather than "the same screen, one keystroke ago".
   */
  replace?: boolean;
}

export type Navigate = (to: string, options?: NavigateOptions) => void;

interface RouterValue {
  location: Location;
  navigate: Navigate;
  /** Base path the app is served under, stripped from `location.path`. */
  basePath: string;
  registerBlocker: (blocker: NavigationBlocker) => () => void;
}

/**
 * Asked before a navigation leaves the current screen. Returning false cancels it.
 * The Design editors use this: they autosave, and a navigation that silently discarded
 * an unsaved change would be the same class of defect as W1.1's.
 */
export type NavigationBlocker = (to: string) => boolean;

const RouterContext = createContext<RouterValue | null>(null);

/** Normalises "", "/x/", "//x" to "/x", and anything empty to "/". */
export function normalisePath(path: string): string {
  const trimmed = path.replace(/\/+$/, "").replace(/\/{2,}/g, "/");
  if (trimmed === "" || trimmed === "/") return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function readQuery(search: string): Record<string, string> {
  const query: Record<string, string> = {};
  new URLSearchParams(search).forEach((value, key) => {
    query[key] = value;
  });
  return query;
}

function locationFrom(basePath: string): Location {
  const raw = normalisePath(window.location.pathname);
  const base = normalisePath(basePath);
  const path =
    base !== "/" && (raw === base || raw.startsWith(`${base}/`))
      ? normalisePath(raw.slice(base.length))
      : raw;
  return { path, query: readQuery(window.location.search) };
}

export interface RouterProviderProps {
  /**
   * Where the app is mounted, when it is not at the origin root. Each app ships as a
   * static SPA in a jar (ADR 0002) and may be served under a context path, so the router
   * cannot assume "/" — a hard-coded root is how a deep link 404s in production and
   * works in dev.
   */
  basePath?: string;
  children: ReactNode;
}

export function RouterProvider({ basePath = "/", children }: RouterProviderProps) {
  const base = normalisePath(basePath);
  const [location, setLocation] = useState<Location>(() => locationFrom(base));
  const blockers = useRef(new Set<NavigationBlocker>());

  useEffect(() => {
    const onPopState = () => setLocation(locationFrom(base));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [base]);

  const registerBlocker = useCallback((blocker: NavigationBlocker) => {
    blockers.current.add(blocker);
    return () => {
      blockers.current.delete(blocker);
    };
  }, []);

  const navigate = useCallback<Navigate>(
    (to, options = {}) => {
      for (const blocker of blockers.current) {
        if (!blocker(to)) return;
      }
      const target = to.startsWith("/") ? to : `/${to}`;
      const href = base === "/" ? target : `${base}${target}`;
      // Same URL: don't stack a duplicate entry the user then has to press Back through.
      const current = `${window.location.pathname}${window.location.search}`;
      if (href !== current) {
        window.history[options.replace ? "replaceState" : "pushState"]({}, "", href);
      }
      setLocation(locationFrom(base));
    },
    [base],
  );

  const value = useMemo<RouterValue>(
    () => ({ location, navigate, basePath: base, registerBlocker }),
    [location, navigate, base, registerBlocker],
  );

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

function useRouter(): RouterValue {
  const value = useContext(RouterContext);
  if (!value) {
    throw new Error("useRouter must be used inside a <RouterProvider>.");
  }
  return value;
}

export function useLocation(): Location {
  return useRouter().location;
}

export function useNavigate(): Navigate {
  return useRouter().navigate;
}

/** Turns an app-relative path into an href, so `<a>` and the router agree. */
export function useHref(): (to: string) => string {
  const { basePath } = useRouter();
  return useCallback(
    (to: string) => {
      const target = to.startsWith("/") ? to : `/${to}`;
      return basePath === "/" ? target : `${basePath}${target}`;
    },
    [basePath],
  );
}

/**
 * Blocks navigation while `shouldBlock` holds — an unsaved editor, a half-filled form.
 *
 * Also wires `beforeunload`, because a reload or a closed tab is the same loss and the
 * router cannot see either.
 */
export function useNavigationBlock(shouldBlock: boolean, confirm: () => boolean): void {
  const { registerBlocker } = useRouter();
  // Synced in an effect, not during render: writing a ref mid-render is unsafe under
  // concurrent rendering. The blocker below only reads it when a navigation happens, by
  // which point the effect has run.
  const confirmRef = useRef(confirm);
  useEffect(() => {
    confirmRef.current = confirm;
  }, [confirm]);

  useEffect(() => {
    if (!shouldBlock) return;
    const release = registerBlocker(() => confirmRef.current());
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Browsers ignore custom copy here and show their own prompt; returnValue is
      // still what triggers it in some of them.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      release();
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [shouldBlock, registerBlocker]);
}
