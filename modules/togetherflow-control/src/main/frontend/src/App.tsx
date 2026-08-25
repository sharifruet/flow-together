import { useCallback, useMemo, useState } from "react";
import {
  ApiClient,
  CaseApi,
  CaseDefinitionAccessApi,
  DecisionHistoryApi,
  EventRegistryApi,
  ExternalWorkerApi,
  InstanceApi,
  JobApi,
  LoginScreen,
  RepositoryApi,
  SystemApi,
  UserProfileApi,
  useAuth,
  useRegisterShortcuts,
  useT,
  useTenant,
  type AppLinks,
  type Shortcut,
} from "@togetherflow/common";
import { AppShell, CONTROL_VIEWS, type ControlView } from "./features/shell/AppShell";
import { Instances } from "./features/instances/Instances";
import { CaseInstances } from "./features/cases/CaseInstances";
import { Definitions } from "./features/definitions/Definitions";
import { EventRegistry } from "./features/events/EventRegistry";
import { Jobs } from "./features/jobs/Jobs";
import { Deployments } from "./features/deployments/Deployments";
import { System } from "./features/system/System";

export interface AppProps {
  /** Sibling app URLs for the shell switcher (§7.5). */
  apps?: AppLinks;
  apiBase: string;
  dmnBase: string;
  cmmnBase: string;
  eventBase: string;
  externalJobBase: string;
  fetchImpl?: typeof fetch;
}

export function App({
  apps,
  apiBase,
  dmnBase,
  cmmnBase,
  eventBase,
  externalJobBase,
  fetchImpl,
}: AppProps) {
  const t = useT();
  const { session, signOut, getAuthHeaders, isInitialising } = useAuth();
  const { tenantId } = useTenant();
  const [view, setView] = useState<ControlView>("instances");

  /*
   * §14.4 argues hardest for keyboard support in exactly this app — admins triaging at
   * volume. Section jumping is the app-level half; the screens register their own
   * actions. Digits rather than letters because Control has seven sections and mnemonic
   * letters would collide (Deployments/Definitions, Cases/Control).
   */
  const shortcuts = useMemo<Shortcut[]>(
    () =>
      CONTROL_VIEWS.map((id, index) => ({
        key: String(index + 1),
        description: t("shortcuts.goTo", { section: t(`nav.${id}`) }),
        run: () => setView(id),
      })),
    [t],
  );
  useRegisterShortcuts(shortcuts);

  // Each engine is a separate servlet, so each gets its own client over the same
  // auth and tenant wiring.
  const clients = useMemo(() => {
    const make = (baseUrl: string) =>
      new ApiClient({
        baseUrl,
        fetchImpl,
        getAuthHeaders,
        getTenantId: () => tenantId,
        onUnauthorized: signOut,
        // Error copy the user sees comes from the active catalogue, not English (§8).
        translate: t,
      });
    return {
      process: make(apiBase),
      dmn: make(dmnBase),
      cmmn: make(cmmnBase),
      event: make(eventBase),
      externalJob: make(externalJobBase),
    };
  }, [
    apiBase,
    dmnBase,
    cmmnBase,
    eventBase,
    externalJobBase,
    fetchImpl,
    getAuthHeaders,
    tenantId,
    signOut,
    t,
  ]);

  const apis = useMemo(
    () => ({
      jobs: new JobApi(clients.process),
      instances: new InstanceApi(clients.process),
      repository: new RepositoryApi(clients.process),
      system: new SystemApi(clients.process),
      decisions: new DecisionHistoryApi(clients.dmn),
      cases: new CaseApi(clients.cmmn),
      caseAccess: new CaseDefinitionAccessApi(clients.cmmn),
      events: new EventRegistryApi(clients.event),
      workers: new ExternalWorkerApi(clients.externalJob),
    }),
    [clients],
  );
  /**
   * Self-service password change (§7.5). The identity resource that owns this lives on
   * the *process* API, so every app can offer it without carrying an IDM client.
   */
  const changePassword = useCallback(
    async (password: string) => {
      if (!session) return;
      await new UserProfileApi(clients.process).changePassword(session.userId, password);
    },
    [clients, session],
  );


  if (isInitialising) {
    return (
      <main className="tf-login">
        <div className="tf-login__card">
          <p className="tf-login__subtitle">{t("app.starting")}</p>
        </div>
      </main>
    );
  }

  if (!session) return <LoginScreen app="control" />;

  return (
    <AppShell view={view} onViewChange={setView} apps={apps} onChangePassword={changePassword}>
      {view === "instances" ? <Instances instanceApi={apis.instances} /> : null}
      {view === "cases" ? <CaseInstances caseApi={apis.cases} /> : null}
      {view === "definitions" ? (
        <Definitions
          repositoryApi={apis.repository}
          caseApi={apis.cases}
          caseAccessApi={apis.caseAccess}
          systemApi={apis.system}
        />
      ) : null}
      {view === "events" ? <EventRegistry eventApi={apis.events} /> : null}
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

/** Public entry point; the provider stack lives in `AppRoot` (`main.tsx`). */
export function ControlApp(props: AppProps) {
  return <App {...props} />;
}
