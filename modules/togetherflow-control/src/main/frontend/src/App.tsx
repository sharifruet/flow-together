import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiClient,
  CaseApi,
  CaseDefinitionAccessApi,
  DecisionHistoryApi,
  EventRecorderApi,
  EventRegistryApi,
  ExternalWorkerApi,
  InstanceApi,
  JobApi,
  LoginScreen,
  RepositoryApi,
  SystemApi,
  UserProfileApi,
  useAuth,
  useNavigate,
  useRegisterShortcuts,
  useRoute,
  useT,
  useTenant,
  type AppLinks,
  type Shortcut,
} from "@togetherflow/common";
import { AppShell, type ControlCounts } from "./features/shell/AppShell";
import {
  CONTROL_VIEWS,
  ROUTE_TABLE,
  casePath,
  deploymentPath,
  instancePath,
  pathFor,
  type ControlView,
} from "./routes";
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
  /**
   * Base URL of the optional inbound event recorder (§7.2, ADR 0015). Empty — the
   * default — means it is not deployed, and Control offers no received-events view.
   */
  eventRecorderBase?: string;
  fetchImpl?: typeof fetch;
}

export function App({
  apps,
  apiBase,
  dmnBase,
  cmmnBase,
  eventBase,
  externalJobBase,
  eventRecorderBase,
  fetchImpl,
}: AppProps) {
  const t = useT();
  const { session, signOut, getAuthHeaders, isInitialising } = useAuth();
  const { tenantId } = useTenant();
  /*
   * The screen and the open entity come from the URL since W1.3 (F1) — the change F1
   * argues for hardest in this app: "support and ops cannot paste 'look at this
   * instance' into a ticket."
   */
  const route = useRoute(ROUTE_TABLE, "instances");
  const navigate = useNavigate();
  const view = route.id;
  const setView = useCallback((next: ControlView) => navigate(pathFor(next)), [navigate]);
  const [counts, setCounts] = useState<ControlCounts>({});

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
    [t, setView],
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
      // Undefined rather than a client over an empty base: an absent recorder must be
      // distinguishable from one that has recorded nothing.
      eventRecorder: eventRecorderBase ? make(eventRecorderBase) : undefined,
    };
  }, [
    apiBase,
    dmnBase,
    cmmnBase,
    eventBase,
    externalJobBase,
    eventRecorderBase,
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
      eventRecorder: clients.eventRecorder ? new EventRecorderApi(clients.eventRecorder) : undefined,
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


  /*
   * Nav counts (B3). §9 rules out an aggregation API, so each is the `total` off a
   * `size=1` query — three cheap requests rather than a new endpoint. A count that fails
   * to load is simply not shown; it is decoration, not the screen.
   */
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const total = (promise: Promise<{ total: number }>) =>
      promise.then((page) => page.total).catch(() => undefined);
    Promise.all([
      total(apis.instances.query({ size: 1 })),
      total(apis.cases.query({ size: 1 })),
      total(apis.jobs.list("deadletter", { size: 1 })),
    ]).then(([instances, cases, deadLetterJobs]) => {
      if (!cancelled) setCounts({ instances, cases, deadLetterJobs });
    });
    return () => {
      cancelled = true;
    };
  }, [apis, session]);

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
    <AppShell view={view} counts={counts} apps={apps} onChangePassword={changePassword}>
      {view === "instances" ? (
        <Instances
          instanceApi={apis.instances}
          selectedId={route.params.instanceId}
          onSelect={(id) => navigate(id ? instancePath(id) : pathFor("instances"))}
        />
      ) : null}
      {view === "cases" ? (
        <CaseInstances
          caseApi={apis.cases}
          selectedId={route.params.caseId}
          onSelect={(id) => navigate(id ? casePath(id) : pathFor("cases"))}
        />
      ) : null}
      {view === "definitions" ? (
        <Definitions
          repositoryApi={apis.repository}
          caseApi={apis.cases}
          caseAccessApi={apis.caseAccess}
          systemApi={apis.system}
        />
      ) : null}
      {view === "events" ? (
        <EventRegistry eventApi={apis.events} recorderApi={apis.eventRecorder} />
      ) : null}
      {view === "jobs" ? <Jobs jobApi={apis.jobs} /> : null}
      {view === "deployments" ? (
        <Deployments
          repositoryApi={apis.repository}
          selectedId={route.params.deploymentId}
          onSelect={(id) => navigate(id ? deploymentPath(id) : pathFor("deployments"))}
        />
      ) : null}
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
