import { useMemo, useState } from "react";
import {
  ApiClient,
  DecisionHistoryApi,
  ExternalWorkerApi,
  InstanceApi,
  JobApi,
  RepositoryApi,
  SystemApi,
  ToastProvider,
  useAuth,
  useTenant,
} from "@togetherflow/common";
import { AppShell, type ControlView } from "./features/shell/AppShell";
import { LoginScreen } from "./features/shell/LoginScreen";
import { Instances } from "./features/instances/Instances";
import { Jobs } from "./features/jobs/Jobs";
import { Deployments } from "./features/deployments/Deployments";
import { System } from "./features/system/System";

export interface AppProps {
  apiBase: string;
  dmnBase: string;
  externalJobBase: string;
  fetchImpl?: typeof fetch;
}

export function App({ apiBase, dmnBase, externalJobBase, fetchImpl }: AppProps) {
  const { session, signOut, getAuthHeaders, isInitialising } = useAuth();
  const { tenantId } = useTenant();
  const [view, setView] = useState<ControlView>("instances");

  // Three servlets, three clients — the DMN and external-job APIs are mounted
  // separately from the process API.
  const clients = useMemo(() => {
    const make = (baseUrl: string) =>
      new ApiClient({
        baseUrl,
        fetchImpl,
        getAuthHeaders,
        getTenantId: () => tenantId,
        onUnauthorized: signOut,
      });
    return { process: make(apiBase), dmn: make(dmnBase), externalJob: make(externalJobBase) };
  }, [apiBase, dmnBase, externalJobBase, fetchImpl, getAuthHeaders, tenantId, signOut]);

  const apis = useMemo(
    () => ({
      jobs: new JobApi(clients.process),
      instances: new InstanceApi(clients.process),
      repository: new RepositoryApi(clients.process),
      system: new SystemApi(clients.process),
      decisions: new DecisionHistoryApi(clients.dmn),
      workers: new ExternalWorkerApi(clients.externalJob),
    }),
    [clients],
  );

  if (isInitialising) {
    return (
      <main className="tf-login">
        <div className="tf-login__card">
          <p className="tf-login__subtitle">Signing you in…</p>
        </div>
      </main>
    );
  }

  if (!session) return <LoginScreen />;

  return (
    <AppShell view={view} onViewChange={setView}>
      {view === "instances" ? <Instances instanceApi={apis.instances} /> : null}
      {view === "jobs" ? <Jobs jobApi={apis.jobs} /> : null}
      {view === "deployments" ? <Deployments repositoryApi={apis.repository} /> : null}
      {view === "system" ? (
        <System
          systemApi={apis.system}
          decisionHistoryApi={apis.decisions}
          externalWorkerApi={apis.workers}
        />
      ) : null}
    </AppShell>
  );
}

export function ControlApp(props: AppProps) {
  return (
    <ToastProvider>
      <App {...props} />
    </ToastProvider>
  );
}
