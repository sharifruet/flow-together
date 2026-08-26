import { Suspense, lazy, useCallback, useMemo, useState } from "react";
import {
  ApiClient,
  AppApi,
  EventRegistryApi,
  LoginScreen,
  ModelApi,
  IdmApi,
  ModelValidationApi,
  ProcessApi,
  Skeleton,
  UserProfileApi,
  modelKindOf,
  useAsync,
  useAuth,
  useT,
  useTenant,
  type ModelResponse,
  type AppLinks,
} from "@togetherflow/common";
import { AppShell } from "./features/shell/AppShell";
import { ModelLibrary } from "./features/library/ModelLibrary";
import { useIdentities } from "./features/bpmn/useIdentities";

/**
 * bpmn-js and dmn-js are large. Loading them lazily keeps the library screen — the
 * first thing anyone sees — from paying for two canvas engines it does not render.
 */
const BpmnEditor = lazy(() =>
  import("./features/bpmn/BpmnEditor").then((m) => ({ default: m.BpmnEditor })),
);
const DmnEditor = lazy(() =>
  import("./features/dmn/DmnEditor").then((m) => ({ default: m.DmnEditor })),
);
const CmmnEditor = lazy(() =>
  import("./features/cmmn/CmmnEditor").then((m) => ({ default: m.CmmnEditor })),
);
const AppBuilder = lazy(() =>
  import("./features/apps/AppBuilder").then((m) => ({ default: m.AppBuilder })),
);
const FormBuilder = lazy(() =>
  import("./features/forms/FormBuilder").then((m) => ({ default: m.FormBuilder })),
);
const EventEditor = lazy(() =>
  import("./features/events/EventEditor").then((m) => ({ default: m.EventEditor })),
);

export interface AppProps {
  /** Sibling app URLs for the shell switcher (§7.5). */
  apps?: AppLinks;
  apiBase: string;
  dmnBase: string;
  cmmnBase: string;
  /**
   * IDM API, used to suggest real users and groups when assigning a task rather than
   * leaving the modeller to remember ids. Optional: a deployment without IDM still
   * models perfectly well, it just types the ids itself.
   */
  idmBase?: string;
  appBase: string;
  eventBase: string;
  fetchImpl?: typeof fetch;
}

export function App({ apps,
  apiBase, dmnBase, cmmnBase, idmBase, appBase, eventBase, fetchImpl }: AppProps) {
  const t = useT();
  const { session, signOut, getAuthHeaders, isInitialising } = useAuth();
  const { tenantId } = useTenant();
  const [editing, setEditing] = useState<ModelResponse | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const makeClient = useCallback(
    (baseUrl: string) =>
      new ApiClient({
        baseUrl,
        fetchImpl,
        getAuthHeaders,
        getTenantId: () => tenantId,
        // Error copy the user sees comes from the active catalogue, not English (§8).
        translate: t,
        onUnauthorized: signOut,
      }),
    [fetchImpl, getAuthHeaders, tenantId, signOut, t],
  );

  const modelApi = useMemo(
    () => new ModelApi(makeClient(apiBase), makeClient(dmnBase), makeClient(cmmnBase)),
    [makeClient, apiBase, dmnBase, cmmnBase],
  );
  /** Server-side model validation (§7.4.2); CMMN validates behind its own servlet. */
  const validationApi = useMemo(
    () => new ModelValidationApi(makeClient(apiBase), makeClient(cmmnBase)),
    [makeClient, apiBase, cmmnBase],
  );
  /**
   * Ids the modeller's reference fields suggest.
   *
   * Suggestions only — never a constraint. An assignee is often an expression
   * (`${initiator}`) or a user this IDM does not know about, and a call activity may name
   * a process not deployed yet, so every field stays free text and a failed fetch costs
   * nothing but the convenience.
   */
  const idmApi = useMemo(
    () => (idmBase ? new IdmApi(makeClient(idmBase)) : null),
    [makeClient, idmBase],
  );
  const processApi = useMemo(() => new ProcessApi(makeClient(apiBase)), [makeClient, apiBase]);
  const identities = useIdentities(idmApi, processApi);

  const appApi = useMemo(() => new AppApi(makeClient(appBase)), [makeClient, appBase]);
  const eventApi = useMemo(
    () => new EventRegistryApi(makeClient(eventBase)),
    [makeClient, eventBase],
  );

  // The editor needs the source before it can import, so it is fetched here and
  // handed down — that keeps the editors free of loading states of their own.
  const source = useAsync(
    async (signal) => (editing ? await modelApi.getSource(editing.id, signal) : null),
    [modelApi, editing?.id],
  );

  const close = useCallback(() => setEditing(null), []);
  /**
   * A save or deploy finished. Deploying cuts a version (§7.4.1), which bumps the draft's
   * version number — the row is unchanged, so this updates what the editor displays
   * without re-importing the diagram and discarding the user's undo stack.
   */
  const onSaved = useCallback((draft?: ModelResponse) => {
    if (draft) setEditing(draft);
    setRefreshToken((token) => token + 1);
  }, []);
  /**
   * Self-service password change (§7.5). The identity resource that owns this lives on
   * the *process* API, so every app can offer it without carrying an IDM client.
   */
  const changePassword = useCallback(
    async (password: string) => {
      if (!session) return;
      await new UserProfileApi(makeClient(apiBase)).changePassword(session.userId, password);
    },
    [makeClient, apiBase, session],
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

  if (!session) return <LoginScreen app="design" />;

  if (editing) {
    const loadError =
      source.error instanceof Error ? source.error.message : source.error ? String(source.error) : null;
    const props = {
      modelApi,
      model: editing,
      initialXml: source.loading ? null : (source.data ?? null),
      loadError,
      onBack: close,
      onSaved,
    };
    return (
      <AppShell view="models" onViewChange={close} apps={apps} onChangePassword={changePassword}>
        <Suspense
          fallback={
            <div className="tf-editor__loading-standalone">
              <Skeleton rows={6} label="Loading editor" />
            </div>
          }
        >
          {modelKindOf(editing) === "dmn" ? (
            <DmnEditor {...props} />
          ) : modelKindOf(editing) === "cmmn" ? (
            <CmmnEditor {...props} validationApi={validationApi} />
          ) : modelKindOf(editing) === "form" ? (
            <FormBuilder
              modelApi={modelApi}
              model={editing}
              initialSource={props.initialXml}
              loadError={loadError}
              onBack={close}
              onSaved={onSaved}
            />
          ) : modelKindOf(editing) === "event" ? (
            <EventEditor
              modelApi={modelApi}
              eventApi={eventApi}
              model={editing}
              initialSource={props.initialXml}
              loadError={loadError}
              onBack={close}
              onSaved={onSaved}
            />
          ) : modelKindOf(editing) === "app" ? (
            <AppBuilder
              modelApi={modelApi}
              appApi={appApi}
              model={editing}
              initialSource={props.initialXml}
              loadError={loadError}
              onBack={close}
              onSaved={onSaved}
            />
          ) : (
            <BpmnEditor
              {...props}
              validationApi={validationApi}
              identities={identities}
            />
          )}
        </Suspense>
      </AppShell>
    );
  }

  return (
    <AppShell view="models" onViewChange={() => undefined} apps={apps} onChangePassword={changePassword}>
      <ModelLibrary modelApi={modelApi} onOpen={setEditing} refreshToken={refreshToken} />
    </AppShell>
  );
}

/** Public entry point; the provider stack lives in `AppRoot` (`main.tsx`). */
export function DesignApp(props: AppProps) {
  return <App {...props} />;
}
