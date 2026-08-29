/**
 * Active-workspace context (ADR 0017, ENTERPRISE_PARITY_PLAN.md W3.1).
 *
 * Sits beside the tenant context and answers a different question. Tenancy decides which
 * rows an engine returns; a workspace decides what a *person* may do with them. Both are
 * read from context rather than threaded through call sites, for the same reason §8 gives
 * for tenancy: retrofitting the parameter later is the expensive path.
 *
 * Three states, and they are not the same:
 *
 *   - **not deployed** — no `workspaceBase`. Design shows one flat library and no
 *     switcher, exactly as before the module existed.
 *   - **deployed, none visible** — the service answered with an empty list. There is a
 *     switcher, and an invitation to create the first workspace.
 *   - **unreachable** — the service is configured but did not answer. This must not
 *     silently look like "not deployed", or a broken deployment presents as a
 *     downgraded one and nobody investigates.
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
import type { WorkspaceApi, WorkspaceCapability, WorkspaceSummary } from "../api/workspaces";

export type WorkspaceStatus = "disabled" | "loading" | "ready" | "unavailable";

export interface WorkspaceContextValue {
  status: WorkspaceStatus;
  /** True where the module is deployed at all. */
  enabled: boolean;
  workspaces: WorkspaceSummary[];
  workspaceId: string | undefined;
  setWorkspaceId: (workspaceId: string | undefined) => void;
  active: WorkspaceSummary | undefined;
  /**
   * Whether the caller may do this in the active workspace.
   *
   * With the module absent this answers `true`: a deployment without workspaces has no
   * workspace rules, and answering `false` would hide every action in Design the moment
   * the service is not configured.
   */
  can: (capability: WorkspaceCapability) => boolean;
  /**
   * The active workspace, read at call time through a stable function.
   *
   * An API client needs the current workspace on every request but must not be *rebuilt*
   * when it changes: the workspace resolves asynchronously after mount, so a client keyed
   * on its value is replaced the moment it arrives and every query holding one refetches.
   * Measured in the running app, that turned one page load into three rounds of every
   * query on screen. Screens that genuinely depend on the value — the model library,
   * whose results the guard filters by it — depend on `workspaceId` directly instead.
   */
  getWorkspaceId: () => string | undefined;
  refresh: () => void;
  error: unknown;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

const STORAGE_KEY = "togetherflow.workspace";

function readStored(): string | undefined {
  // A private window, or a browser told to block site data, throws on access.
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function storeChoice(workspaceId: string | undefined): void {
  try {
    if (workspaceId) {
      window.localStorage.setItem(STORAGE_KEY, workspaceId);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Remembering the choice is a convenience; failing to is not worth an error.
  }
}

export interface WorkspaceProviderProps {
  /** Omitted where the module is not deployed. */
  api?: WorkspaceApi;
  children: ReactNode;
}

export function WorkspaceProvider({ api, children }: WorkspaceProviderProps) {
  const [workspaceId, setChosen] = useState<string | undefined>(readStored);
  const [reloadToken, setReloadToken] = useState(0);
  /*
   * One piece of state, not three. "Not deployed" is derived from `api` rather than
   * stored, so there is no effect that has to write it — and no window in which the
   * three states disagree with each other.
   */
  const [loaded, setLoaded] = useState<{
    status: Exclude<WorkspaceStatus, "disabled">;
    workspaces: WorkspaceSummary[];
    error: unknown;
  }>({ status: "loading", workspaces: [], error: undefined });

  useEffect(() => {
    if (!api) return;
    const controller = new AbortController();
    api
      .list(controller.signal)
      .then((list) => setLoaded({ status: "ready", workspaces: list, error: undefined }))
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setLoaded({ status: "unavailable", workspaces: [], error: cause });
      });
    return () => controller.abort();
  }, [api, reloadToken]);

  const status: WorkspaceStatus = api ? loaded.status : "disabled";
  const workspaces = api ? loaded.workspaces : EMPTY;
  const error = api ? loaded.error : undefined;

  /*
   * Derived, not corrected in an effect.
   *
   * A remembered workspace the user has since lost access to must not stick — it would
   * filter the library to nothing and read as an empty repository — so falling back to
   * the first visible one is the recovery. Doing that by *deriving* rather than by
   * writing the id back means there is no render in which the two disagree, and the
   * stored preference is left alone in case access is restored.
   */
  const active = useMemo(
    () => workspaces.find((workspace) => workspace.id === workspaceId) ?? workspaces[0],
    [workspaces, workspaceId],
  );

  const setWorkspaceId = useCallback((next: string | undefined) => {
    setChosen(next);
    storeChoice(next);
  }, []);

  const can = useCallback(
    (capability: WorkspaceCapability) => {
      if (status === "disabled") return true;
      return active?.capabilities.includes(capability) ?? false;
    },
    [status, active],
  );

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  // Kept in a ref so the accessor below is stable across renders. Written in an effect,
  // not during render, and read only when a request is being made.
  const activeRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    activeRef.current = active?.id;
  }, [active]);
  const getWorkspaceId = useCallback(() => activeRef.current, []);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      status,
      enabled: status !== "disabled",
      workspaces,
      workspaceId: active?.id,
      setWorkspaceId,
      active,
      can,
      getWorkspaceId,
      refresh,
      error,
    }),
    [status, workspaces, active, setWorkspaceId, can, getWorkspaceId, refresh, error],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

/**
 * Never throws when unmounted.
 *
 * Unlike tenancy, three of the four apps have nothing to do with workspaces, and shared
 * components (the shell) render in all four. A hook that threw would make the provider
 * mandatory everywhere to serve one app.
 */
export function useWorkspace(): WorkspaceContextValue {
  return useContext(WorkspaceContext) ?? ABSENT;
}

const EMPTY: WorkspaceSummary[] = [];

const ABSENT: WorkspaceContextValue = {
  status: "disabled",
  enabled: false,
  workspaces: [],
  workspaceId: undefined,
  setWorkspaceId: () => {},
  active: undefined,
  can: () => true,
  getWorkspaceId: () => undefined,
  refresh: () => {},
  error: undefined,
};
