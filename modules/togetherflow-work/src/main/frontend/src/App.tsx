import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiClient,
  CaseApi,
  HistoryApi,
  LoginScreen,
  ProcessApi,
  TaskApi,
  UserProfileApi,
  useAuth,
  useNavigate,
  useRegisterShortcuts,
  useRoute,
  useT,
  useTenant,
  type Shortcut,
  type CaseInstanceResponse,
  type AppLinks,
} from "@togetherflow/common";
import { AppShell } from "./features/shell/AppShell";
import { ROUTE_TABLE, WORK_VIEWS, casePath, pathFor, taskPath, type WorkView } from "./routes";
import { TaskInbox } from "./features/tasks/TaskInbox";
import { TaskDetail } from "./features/tasks/TaskDetail";
import { StartWork } from "./features/start/StartWork";
import { MyHistory } from "./features/history/MyHistory";
import { MyCases } from "./features/cases/MyCases";
import { CaseDetail } from "./features/cases/CaseDetail";

export interface AppProps {
  /** Sibling app URLs for the shell switcher (§7.5). */
  apps?: AppLinks;
  baseUrl: string;
  /** CMMN runs on its own servlet, so case work needs a second base URL. */
  cmmnBase: string;
  /** Attachment gateway base URL; empty for the default `db` provider (§7.6). */
  attachmentGateway?: string;
  fetchImpl?: typeof fetch;
}

export function App({
  apps,
  baseUrl,
  cmmnBase,
  attachmentGateway,
  fetchImpl,
}: AppProps) {
  const t = useT();
  const { session, signOut, getAuthHeaders, isInitialising } = useAuth();
  const { tenantId } = useTenant();
  /*
   * The screen and the open entity both come from the URL now (F1). Keeping them in
   * state was what made a task un-linkable, Back leave the app, and a refresh land on
   * the inbox with the filters cleared.
   */
  const route = useRoute(ROUTE_TABLE, "inbox");
  const navigate = useNavigate();
  const view = route.id;
  const selectedTaskId = route.params.taskId;
  const selectedCaseId = route.params.caseId;

  /*
   * The case *row*, cached alongside the id so the inspector opened from the list renders
   * without a second fetch. The id is the source of truth — a deep link arrives with an
   * id and no row — so a cached row that no longer matches the URL is simply ignored,
   * derived during render rather than cleared in an effect.
   *
   * Tasks need no equivalent: `TaskDetail` takes an id and fetches, so a cached row would
   * be state nothing reads.
   */
  const [cachedCase, setCachedCase] = useState<CaseInstanceResponse | undefined>();
  const selectedCase = cachedCase?.id === selectedCaseId ? cachedCase : undefined;
  const [refreshToken, setRefreshToken] = useState(0);
  const [inboxCount, setInboxCount] = useState<number | undefined>();

  const setView = useCallback((next: WorkView) => navigate(pathFor(next)), [navigate]);

  const makeClient = useCallback(
    (base: string) =>
      new ApiClient({
        baseUrl: base,
        fetchImpl,
        // Read through the provider so a silently-renewed token is picked up
        // without rebuilding the client on every refresh.
        getAuthHeaders,
        getTenantId: () => tenantId,
        onUnauthorized: signOut,
        // Error copy the user sees comes from the active catalogue, not English (§8).
        translate: t,
      }),
    [fetchImpl, getAuthHeaders, tenantId, signOut, t],
  );

  const client = useMemo(() => makeClient(baseUrl), [makeClient, baseUrl]);
  const cmmnClient = useMemo(() => makeClient(cmmnBase), [makeClient, cmmnBase]);

  const taskApi = useMemo(
    () => new TaskApi(client, attachmentGateway || undefined),
    [client, attachmentGateway],
  );
  const processApi = useMemo(() => new ProcessApi(client), [client]);
  const historyApi = useMemo(() => new HistoryApi(client), [client]);
  const caseApi = useMemo(() => new CaseApi(cmmnClient), [cmmnClient]);

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), []);
  /**
   * Self-service password change (§7.5). The identity resource that owns this lives on
   * the *process* API, so every app can offer it without carrying an IDM client.
   */
  const changePassword = useCallback(
    async (password: string) => {
      if (!session) return;
      await new UserProfileApi(makeClient(baseUrl)).changePassword(session.userId, password);
    },
    [makeClient, baseUrl, session],
  );


  const onTaskCompleted = useCallback(() => {
    navigate(pathFor("inbox"));
    refresh();
  }, [navigate, refresh]);

  /*
   * Inbox depth for the nav badge (B3). §9 rules out an aggregation API, so this is the
   * `total` off a `size=1` query — one cheap request, not a second endpoint.
   */
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    taskApi
      .query({ assignee: session.userId, size: 1 })
      .then((page) => {
        if (!cancelled) setInboxCount(page.total);
      })
      // A count is decoration; failing to fetch it must not surface as an error.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [taskApi, session, refreshToken]);

  /*
   * App-level shortcuts (§14.4): high-volume triage shouldn't require the mouse. The
   * per-screen ones — move through the list, claim, complete — are registered by the
   * screens that own those actions, so they only exist while that screen is on.
   */
  const shortcuts = useMemo<Shortcut[]>(
    () => [
      {
        key: "g",
        description: t("shortcuts.cycleViews"),
        run: () => setView(WORK_VIEWS[(WORK_VIEWS.indexOf(view) + 1) % WORK_VIEWS.length]),
      },
      {
        key: "/",
        description: t("shortcuts.search"),
        // Some browsers open quick-find on "/".
        preventDefault: true,
        run: () => document.getElementById("tf-task-search")?.focus(),
      },
      {
        key: "Escape",
        // Closes the detail pane by navigating back to the list, so Escape and Back
        // agree about what "close" means.
        run: () => navigate(pathFor(view)),
        when: Boolean(selectedTaskId || selectedCaseId),
      },
    ],
    [t, view, selectedTaskId, selectedCaseId, navigate, setView],
  );
  useRegisterShortcuts(shortcuts);

  // Completing an OIDC redirect is asynchronous; showing the login screen during it
  // would flash a sign-in prompt at an already-authenticated user.
  if (isInitialising) {
    return (
      <main className="tf-login">
        <div className="tf-login__card">
          <p className="tf-login__subtitle">{t("app.starting")}</p>
        </div>
      </main>
    );
  }

  if (!session) {
    return <LoginScreen app="work" />;
  }

  return (
    <AppShell apps={apps} onChangePassword={changePassword} view={view} inboxCount={inboxCount}>
      {view === "inbox" ? (
        <div className="tf-work-layout">
          <TaskInbox
            taskApi={taskApi}
            processApi={processApi}
            userId={session.userId}
            selectedTaskId={selectedTaskId}
            onSelectTask={(task) => navigate(taskPath(task.id))}
            refreshToken={refreshToken}
            onStartWork={() => setView("start")}
          />
          <TaskDetail
            taskApi={taskApi}
            taskId={selectedTaskId}
            userId={session.userId}
            onCompleted={onTaskCompleted}
            onChanged={refresh}
            onClose={() => navigate(pathFor("inbox"))}
          />
        </div>
      ) : view === "cases" ? (
        <div className="tf-work-layout">
          <MyCases
            caseApi={caseApi}
            userId={session.userId}
            selectedCaseId={selectedCaseId}
            onSelectCase={(instance) => {
              setCachedCase(instance);
              navigate(casePath(instance.id));
            }}
            refreshToken={refreshToken}
          />
          <CaseDetail
            caseApi={caseApi}
            instance={selectedCase}
            caseId={selectedCaseId}
            onClose={() => navigate(pathFor("cases"))}
            onChanged={refresh}
          />
        </div>
      ) : view === "start" ? (
        <StartWork
          processApi={processApi}
          caseApi={caseApi}
          onStarted={(kind) => {
            refresh();
            setView(kind === "case" ? "cases" : "inbox");
          }}
        />
      ) : (
        <MyHistory historyApi={historyApi} caseApi={caseApi} userId={session.userId} />
      )}
    </AppShell>
  );
}

/**
 * Kept as the module's public entry point. The provider stack it used to own now lives
 * in `AppRoot` (`main.tsx`), so tests and embedders that render `<WorkApp/>` get the
 * component itself rather than a second, divergent set of providers.
 */
export function WorkApp(props: AppProps) {
  return <App {...props} />;
}
