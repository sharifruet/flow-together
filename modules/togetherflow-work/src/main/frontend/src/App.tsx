import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiClient,
  CaseApi,
  HistoryApi,
  ProcessApi,
  TaskApi,
  ToastProvider,
  UserProfileApi,
  useAuth,
  useTenant,
  type CaseInstanceResponse,
  type TaskResponse,
  type AppLinks,
} from "@togetherflow/common";
import { AppShell, type WorkView } from "./features/shell/AppShell";
import { LoginScreen } from "./features/shell/LoginScreen";
import { TaskInbox } from "./features/tasks/TaskInbox";
import { TaskDetail } from "./features/tasks/TaskDetail";
import { StartWork } from "./features/start/StartWork";
import { MyHistory } from "./features/history/MyHistory";
import { MyCases } from "./features/cases/MyCases";
import { CaseDetail } from "./features/cases/CaseDetail";

const VIEW_CYCLE: WorkView[] = ["inbox", "cases", "start", "history"];

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
  const { session, signOut, getAuthHeaders, isInitialising } = useAuth();
  const { tenantId } = useTenant();
  const [view, setView] = useState<WorkView>("inbox");
  const [selectedTask, setSelectedTask] = useState<TaskResponse | undefined>();
  const [selectedCase, setSelectedCase] = useState<CaseInstanceResponse | undefined>();
  const [refreshToken, setRefreshToken] = useState(0);

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
      }),
    [fetchImpl, getAuthHeaders, tenantId, signOut],
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
    setSelectedTask(undefined);
    refresh();
  }, [refresh]);

  // Power-user shortcuts (§14.4): high-volume triage shouldn't require the mouse.
  useEffect(() => {
    if (!session) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === "g") {
        setView((current) => VIEW_CYCLE[(VIEW_CYCLE.indexOf(current) + 1) % VIEW_CYCLE.length]);
      } else if (event.key === "Escape" && (selectedTask || selectedCase)) {
        setSelectedTask(undefined);
        setSelectedCase(undefined);
      } else if (event.key === "/") {
        event.preventDefault();
        document.getElementById("tf-task-search")?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [session, selectedTask, selectedCase]);

  // Completing an OIDC redirect is asynchronous; showing the login screen during it
  // would flash a sign-in prompt at an already-authenticated user.
  if (isInitialising) {
    return (
      <main className="tf-login">
        <div className="tf-login__card">
          <p className="tf-login__subtitle">Signing you in…</p>
        </div>
      </main>
    );
  }

  if (!session) {
    return <LoginScreen />;
  }

  return (
    <AppShell
      apps={apps}
      onChangePassword={changePassword}
      view={view}
      onViewChange={(next) => {
        setView(next);
        if (next !== "inbox") setSelectedTask(undefined);
        if (next !== "cases") setSelectedCase(undefined);
      }}
    >
      {view === "inbox" ? (
        <div className="tf-work-layout">
          <TaskInbox
            taskApi={taskApi}
            userId={session.userId}
            selectedTaskId={selectedTask?.id}
            onSelectTask={setSelectedTask}
            refreshToken={refreshToken}
            onStartWork={() => setView("start")}
          />
          <TaskDetail
            taskApi={taskApi}
            taskId={selectedTask?.id}
            userId={session.userId}
            onCompleted={onTaskCompleted}
            onChanged={refresh}
            onClose={() => setSelectedTask(undefined)}
          />
        </div>
      ) : view === "cases" ? (
        <div className="tf-work-layout">
          <MyCases
            caseApi={caseApi}
            userId={session.userId}
            selectedCaseId={selectedCase?.id}
            onSelectCase={setSelectedCase}
            refreshToken={refreshToken}
          />
          <CaseDetail
            caseApi={caseApi}
            instance={selectedCase}
            onClose={() => setSelectedCase(undefined)}
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

export function WorkApp(props: AppProps) {
  return (
    <ToastProvider>
      <App {...props} />
    </ToastProvider>
  );
}
