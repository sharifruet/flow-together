import { Suspense, useCallback, useMemo, useState } from "react";
import {
  ApiClient,
  AppApi,
  EventRegistryApi,
  LoginScreen,
  ModelApi,
  IdmApi,
  lazyWithRetry,
  ModelValidationApi,
  ProcessApi,
  Skeleton,
  UserProfileApi,
  modelKindOf,
  useAsync,
  useAuth,
  useNavigate,
  useRoute,
  useT,
  useTenant,
  type ModelResponse,
  type AppLinks,
} from "@togetherflow/common";
import { AppShell } from "./features/shell/AppShell";
import { ROUTE_TABLE, modelPath, pathFor } from "./routes";
import { ModelLibrary } from "./features/library/ModelLibrary";
import { useIdentities } from "./features/bpmn/useIdentities";

/**
 * bpmn-js and dmn-js are large. Loading them lazily keeps the library screen — the
 * first thing anyone sees — from paying for two canvas engines it does not render.
 *
 * `lazyWithRetry`, not `lazy`: a plain `lazy` caches its rejected promise, so an editor
 * whose chunk fails to load once is dead until the user reloads by hand — and the error
 * boundary's own Retry cannot fix it. That happens for real after a deploy replaces the
 * hashed chunk names under an open tab.
 */
const BpmnEditor = lazyWithRetry(
  () => import("./features/bpmn/BpmnEditor").then((m) => ({ default: m.BpmnEditor })),
  "BpmnEditor",
);
const DmnEditor = lazyWithRetry(
  () => import("./features/dmn/DmnEditor").then((m) => ({ default: m.DmnEditor })),
  "DmnEditor",
);
const CmmnEditor = lazyWithRetry(
  () => import("./features/cmmn/CmmnEditor").then((m) => ({ default: m.CmmnEditor })),
  "CmmnEditor",
);
const AppBuilder = lazyWithRetry(
  () => import("./features/apps/AppBuilder").then((m) => ({ default: m.AppBuilder })),
  "AppBuilder",
);
const FormBuilder = lazyWithRetry(
  () => import("./features/forms/FormBuilder").then((m) => ({ default: m.FormBuilder })),
  "FormBuilder",
);
const EventEditor = lazyWithRetry(
  () => import("./features/events/EventEditor").then((m) => ({ default: m.EventEditor })),
  "EventEditor",
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
  /*
   * Which model is open comes from the URL since W1.3 (F1). A model could not be linked
   * to before, so "review this process" had to be "open Design, find it, open it".
   */
  const route = useRoute(ROUTE_TABLE, "models");
  const navigate = useNavigate();
  const editingId = route.params.modelId;
  /**
   * The row for the open model, cached so opening one from the library needs no second
   * fetch. Derived against the URL rather than cleared in an effect: the id is the
   * source of truth, and a cached row that does not match it is simply not used.
   */
  const [cachedModel, setCachedModel] = useState<ModelResponse | null>(null);
  const editing = cachedModel?.id === editingId ? cachedModel : null;
  const [refreshToken, setRefreshToken] = useState(0);
  const [modelCount, setModelCount] = useState<number | undefined>();
  /*
   * Bumped by W1.1's "Reload": refetches the source and, through the editor's `key`,
   * remounts the editor so it re-imports. Losing the undo stack is the point — "take
   * theirs, drop mine" is exactly that.
   */
  const [sourceToken, setSourceToken] = useState(0);

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
  /*
   * Null until signed in. `useIdentities` prefetches on mount, and a hook runs whether or
   * not the render below returns the login screen — so without this it fired three
   * unauthenticated requests, the engine answered `401` with `WWW-Authenticate: Basic`,
   * and the browser put its own credential dialog over our login page.
   *
   * `ApiClient` now refuses to send a request with no credentials, which stops the class
   * of bug rather than this instance of it. Gating here as well is not redundant: it
   * means the app makes no pointless calls at all, rather than making them and catching
   * the refusal.
   */
  const idmApi = useMemo(
    () => (idmBase && session ? new IdmApi(makeClient(idmBase)) : null),
    [makeClient, idmBase, session],
  );
  const processApi = useMemo(
    () => (session ? new ProcessApi(makeClient(apiBase)) : null),
    [makeClient, apiBase, session],
  );
  const identities = useIdentities(idmApi, processApi);

  const appApi = useMemo(() => new AppApi(makeClient(appBase)), [makeClient, appBase]);
  const eventApi = useMemo(
    () => new EventRegistryApi(makeClient(eventBase)),
    [makeClient, eventBase],
  );

  // The editor needs the source before it can import, so it is fetched here and
  // handed down — that keeps the editors free of loading states of their own.
  const source = useAsync(
    async (signal) => (editingId ? await modelApi.getSource(editingId, signal) : null),
    [modelApi, editingId, sourceToken],
  );

  /*
   * A deep link arrives with an id and no row. The library hands the row over when it
   * opens one, so this only fetches for the cold-start case — which makes it a genuine
   * synchronisation with an external system rather than derived state.
   */
  const fetchedModel = useAsync(
    async (signal) => {
      if (!editingId || editing) return null;
      try {
        return await modelApi.get(editingId, signal);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        // A link to a model that no longer exists returns to the library rather than
        // leaving the user on a blank editor.
        navigate(pathFor("models"), { replace: true });
        return null;
      }
    },
    [modelApi, editingId, editing, navigate],
  );
  const openModel = editing ?? fetchedModel.data ?? null;

  const close = useCallback(() => navigate(pathFor("models")), [navigate]);
  /**
   * A save or deploy finished. Deploying cuts a version (§7.4.1), which bumps the draft's
   * version number — the row is unchanged, so this updates what the editor displays
   * without re-importing the diagram and discarding the user's undo stack.
   */
  const onSaved = useCallback((draft?: ModelResponse) => {
    if (draft) setCachedModel(draft);
    setRefreshToken((token) => token + 1);
  }, []);

  /** W1.1's "Reload": refetch the stored source and remount the editor over it. */
  const reloadSource = useCallback(() => setSourceToken((token) => token + 1), []);
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

  if (editingId && openModel) {
    const loadError =
      source.error instanceof Error ? source.error.message : source.error ? String(source.error) : null;
    const props = {
      modelApi,
      model: openModel,
      initialXml: source.loading ? null : (source.data ?? null),
      loadError,
      onBack: close,
      onSaved,
      onReloadSource: reloadSource,
    };
    return (
      <AppShell view="models" apps={apps} onChangePassword={changePassword}>
        <Suspense
          fallback={
            <div className="tf-editor__loading-standalone">
              <Skeleton rows={6} label="Loading editor" />
            </div>
          }
        >
          {modelKindOf(openModel) === "dmn" ? (
            <DmnEditor {...props} />
          ) : modelKindOf(openModel) === "cmmn" ? (
            <CmmnEditor {...props} validationApi={validationApi} />
          ) : modelKindOf(openModel) === "form" ? (
            <FormBuilder
              modelApi={modelApi}
              model={openModel}
              initialSource={props.initialXml}
              loadError={loadError}
              onBack={close}
              onSaved={onSaved}
            />
          ) : modelKindOf(openModel) === "event" ? (
            <EventEditor
              modelApi={modelApi}
              eventApi={eventApi}
              model={openModel}
              initialSource={props.initialXml}
              loadError={loadError}
              onBack={close}
              onSaved={onSaved}
            />
          ) : modelKindOf(openModel) === "app" ? (
            <AppBuilder
              modelApi={modelApi}
              appApi={appApi}
              model={openModel}
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
    <AppShell
      view="models"
      modelCount={modelCount}
      apps={apps}
      onChangePassword={changePassword}
    >
      <ModelLibrary
        modelApi={modelApi}
        onOpen={(model) => {
          // The row is kept so the editor renders without a second fetch; the URL is
          // what actually opens it.
          setCachedModel(model);
          navigate(modelPath(model.id));
        }}
        onCount={setModelCount}
        refreshToken={refreshToken}
      />
    </AppShell>
  );
}

/** Public entry point; the provider stack lives in `AppRoot` (`main.tsx`). */
export function DesignApp(props: AppProps) {
  return <App {...props} />;
}
