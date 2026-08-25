import { useCallback, useMemo, useState } from "react";
import {
  ApiClient,
  IdmApi,
  LoginScreen,
  UserProfileApi,
  useAuth,
  useT,
  useTenant,
  type AppLinks,
} from "@togetherflow/common";
import { AppShell, type IdentityView } from "./features/shell/AppShell";
import { Users } from "./features/users/Users";
import { Groups } from "./features/groups/Groups";
import { Privileges } from "./features/privileges/Privileges";

export interface AppProps {
  /** Sibling app URLs for the shell switcher (§7.5). */
  apps?: AppLinks;
  /**
   * Process API base. Pictures and custom user info are served from `/identity/...`
   * on the process servlet, not from IDM — verified against a running engine.
   */
  apiBase: string;
  /** IDM REST base — a different servlet from the process API. */
  idmBase: string;
  readOnly: boolean;
  fetchImpl?: typeof fetch;
}

export function App({ apps,
  apiBase, idmBase, readOnly, fetchImpl }: AppProps) {
  const t = useT();
  const { session, signOut, getAuthHeaders, isInitialising } = useAuth();
  const { tenantId } = useTenant();
  const [view, setView] = useState<IdentityView>("users");

  const makeClient = useCallback(
    (baseUrl: string) =>
      new ApiClient({
        baseUrl,
        fetchImpl,
        getAuthHeaders,
        getTenantId: () => tenantId,
        onUnauthorized: signOut,
        translate: t,
      }),
    [fetchImpl, getAuthHeaders, tenantId, signOut, t],
  );

  const idm = useMemo(() => new IdmApi(makeClient(idmBase)), [makeClient, idmBase]);
  const profileApi = useMemo(
    () => new UserProfileApi(makeClient(apiBase)),
    [makeClient, apiBase],
  );
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

  if (!session) return <LoginScreen app="identity" />;

  return (
    <AppShell view={view} onViewChange={setView} apps={apps} onChangePassword={changePassword}>
      {readOnly ? (
        <p className="tf-banner" role="status">
          {t("readOnly.banner")}
        </p>
      ) : null}
      {view === "users" ? (
        <Users idm={idm} profileApi={profileApi} readOnly={readOnly} />
      ) : view === "groups" ? (
        <Groups idm={idm} readOnly={readOnly} />
      ) : (
        <Privileges idm={idm} readOnly={readOnly} />
      )}
    </AppShell>
  );
}

/** Public entry point; the provider stack lives in `AppRoot` (`main.tsx`). */
export function IdentityApp(props: AppProps) {
  return <App {...props} />;
}
