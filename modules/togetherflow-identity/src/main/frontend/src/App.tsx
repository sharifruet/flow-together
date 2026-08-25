import { useMemo, useState } from "react";
import {
  ApiClient,
  IdmApi,
  ToastProvider,
  useAuth,
  useTenant,
} from "@togetherflow/common";
import { AppShell, type IdentityView } from "./features/shell/AppShell";
import { LoginScreen } from "./features/shell/LoginScreen";
import { Users } from "./features/users/Users";
import { Groups } from "./features/groups/Groups";
import { Privileges } from "./features/privileges/Privileges";

export interface AppProps {
  /** IDM REST base — a different servlet from the process API. */
  idmBase: string;
  readOnly: boolean;
  fetchImpl?: typeof fetch;
}

export function App({ idmBase, readOnly, fetchImpl }: AppProps) {
  const { session, signOut, getAuthHeaders, isInitialising } = useAuth();
  const { tenantId } = useTenant();
  const [view, setView] = useState<IdentityView>("users");

  const idm = useMemo(
    () =>
      new IdmApi(
        new ApiClient({
          baseUrl: idmBase,
          fetchImpl,
          getAuthHeaders,
          getTenantId: () => tenantId,
          onUnauthorized: signOut,
        }),
      ),
    [idmBase, fetchImpl, getAuthHeaders, tenantId, signOut],
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
      {readOnly ? (
        <p className="tf-banner" role="status">
          Identities are provided by a directory and are read-only here. Create, edit and
          delete are disabled.
        </p>
      ) : null}
      {view === "users" ? (
        <Users idm={idm} readOnly={readOnly} />
      ) : view === "groups" ? (
        <Groups idm={idm} readOnly={readOnly} />
      ) : (
        <Privileges idm={idm} readOnly={readOnly} />
      )}
    </AppShell>
  );
}

export function IdentityApp(props: AppProps) {
  return (
    <ToastProvider>
      <App {...props} />
    </ToastProvider>
  );
}
