import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiClient,
  HistoryApi,
  ProcessApi,
  TaskApi,
  ToastProvider,
  useAuth,
  useTenant,
  type TaskResponse,
} from "@togetherflow/common";
import { AppShell, type WorkView } from "./features/shell/AppShell";
import { LoginScreen } from "./features/shell/LoginScreen";
import { TaskInbox } from "./features/tasks/TaskInbox";
import { TaskDetail } from "./features/tasks/TaskDetail";
import { StartWork } from "./features/start/StartWork";
import { MyHistory } from "./features/history/MyHistory";

const VIEW_CYCLE: WorkView[] = ["inbox", "start", "history"];

export interface AppProps {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

export function App({ baseUrl, fetchImpl }: AppProps) {
  const { session, signOut, getAuthHeaders, isInitialising } = useAuth();
  const { tenantId } = useTenant();
  const [view, setView] = useState<WorkView>("inbox");
  const [selectedTask, setSelectedTask] = useState<TaskResponse | undefined>();
  const [refreshToken, setRefreshToken] = useState(0);

  const client = useMemo(
    () =>
      new ApiClient({
        baseUrl,
        fetchImpl,
        // Read through the provider so a silently-renewed token is picked up
        // without rebuilding the client on every refresh.
        getAuthHeaders,
        getTenantId: () => tenantId,
        onUnauthorized: signOut,
      }),
    [baseUrl, fetchImpl, getAuthHeaders, tenantId, signOut],
  );

  const taskApi = useMemo(() => new TaskApi(client), [client]);
  const processApi = useMemo(() => new ProcessApi(client), [client]);
  const historyApi = useMemo(() => new HistoryApi(client), [client]);

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), []);

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
      } else if (event.key === "Escape" && selectedTask) {
        setSelectedTask(undefined);
      } else if (event.key === "/") {
        event.preventDefault();
        document.getElementById("tf-task-search")?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [session, selectedTask]);

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
      view={view}
      onViewChange={(next) => {
        setView(next);
        if (next !== "inbox") setSelectedTask(undefined);
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
      ) : view === "start" ? (
        <StartWork
          processApi={processApi}
          onStarted={() => {
            refresh();
            setView("inbox");
          }}
        />
      ) : (
        <MyHistory historyApi={historyApi} userId={session.userId} />
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
