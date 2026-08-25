import { Suspense, lazy, useCallback, useMemo, useState } from "react";
import {
  ApiClient,
  AppApi,
  EventRegistryApi,
  ModelApi,
  Skeleton,
  ToastProvider,
  modelKindOf,
  useAsync,
  useAuth,
  useTenant,
  type ModelResponse,
} from "@togetherflow/common";
import { AppShell } from "./features/shell/AppShell";
import { LoginScreen } from "./features/shell/LoginScreen";
import { ModelLibrary } from "./features/library/ModelLibrary";

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
  apiBase: string;
  dmnBase: string;
  cmmnBase: string;
  appBase: string;
  eventBase: string;
  fetchImpl?: typeof fetch;
}

export function App({ apiBase, dmnBase, cmmnBase, appBase, eventBase, fetchImpl }: AppProps) {
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
        onUnauthorized: signOut,
      }),
    [fetchImpl, getAuthHeaders, tenantId, signOut],
  );

  const modelApi = useMemo(
    () => new ModelApi(makeClient(apiBase), makeClient(dmnBase), makeClient(cmmnBase)),
    [makeClient, apiBase, dmnBase, cmmnBase],
  );
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
  const onSaved = useCallback(() => setRefreshToken((t) => t + 1), []);

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
      <AppShell view="models" onViewChange={close}>
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
            <CmmnEditor {...props} />
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
            <BpmnEditor {...props} />
          )}
        </Suspense>
      </AppShell>
    );
  }

  return (
    <AppShell view="models" onViewChange={() => undefined}>
      <ModelLibrary modelApi={modelApi} onOpen={setEditing} refreshToken={refreshToken} />
    </AppShell>
  );
}

export function DesignApp(props: AppProps) {
  return (
    <ToastProvider>
      <App {...props} />
    </ToastProvider>
  );
}
