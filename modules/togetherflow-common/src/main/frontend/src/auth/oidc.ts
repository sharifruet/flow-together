/**
 * OIDC Authorization Code + PKCE, backed by oidc-client-ts.
 *
 * Deliberately not hand-rolled: PKCE, state/nonce validation, token renewal and
 * clock-skew handling are exactly the places a bespoke implementation goes wrong
 * quietly. See docs/ui/adr/0006-oidc-authentication.md.
 *
 * Tokens live in memory (`WebStorageStateStore` is NOT used for the access token),
 * so an XSS cannot read a long-lived credential out of storage. The transient PKCE
 * verifier does need sessionStorage for the redirect round trip — it is single-use,
 * scoped to one login, and useless once redeemed.
 */

import {
  Log,
  User,
  UserManager,
  WebStorageStateStore,
  type UserManagerSettings,
} from "oidc-client-ts";

export interface OidcConfig {
  /** Issuer URL, e.g. https://keycloak.example.com/realms/Flowable */
  authority: string;
  /** Public client id — never a confidential client, this runs in a browser. */
  clientId: string;
  /** Defaults to the app's own origin + pathname. */
  redirectUri?: string;
  postLogoutRedirectUri?: string;
  scope?: string;
}

export function createUserManager(config: OidcConfig): UserManager {
  const redirectUri =
    config.redirectUri ?? `${window.location.origin}${window.location.pathname}`;

  const settings: UserManagerSettings = {
    authority: config.authority,
    client_id: config.clientId,
    redirect_uri: redirectUri,
    post_logout_redirect_uri: config.postLogoutRedirectUri ?? window.location.origin,
    response_type: "code",
    scope: config.scope ?? "openid profile email",

    // PKCE is implied by response_type=code with a public client, but state it
    // explicitly so a config change cannot silently drop it.
    disablePKCE: false,

    // Keep tokens out of persistent storage; only the short-lived auth request
    // state (PKCE verifier, nonce) is persisted, and only across the redirect.
    stateStore: new WebStorageStateStore({ store: window.sessionStorage }),
    userStore: undefined,

    // Renew silently before expiry so a long working session is not interrupted
    // mid-task — losing an in-progress task form to a token expiry is the failure
    // mode this exists to prevent.
    automaticSilentRenew: true,
    accessTokenExpiringNotificationTimeInSeconds: 60,

    // The engine's REST layer validates the access token; the UI does not need
    // userinfo on every load.
    loadUserInfo: false,
    monitorSession: false,
  };

  // Surface protocol-level warnings during local development only; this package
  // is framework-agnostic, so it does not read Vite's import.meta.env.
  if (typeof window !== "undefined" && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) {
    Log.setLogger(console);
    Log.setLevel(Log.WARN);
  }

  return new UserManager(settings);
}

/** True when the current URL is an OIDC redirect callback that must be completed. */
export function isRedirectCallback(search: string = window.location.search): boolean {
  const params = new URLSearchParams(search);
  return params.has("code") || params.has("error");
}

/**
 * Removes OIDC parameters from the address bar after a successful callback, so a
 * reload does not attempt to redeem an already-used authorization code.
 */
export function clearCallbackParams(): void {
  const url = new URL(window.location.href);
  for (const key of ["code", "state", "session_state", "iss", "error", "error_description"]) {
    url.searchParams.delete(key);
  }
  window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
}

export function authHeaderFor(user: User | null): Record<string, string> | undefined {
  if (!user?.access_token) return undefined;
  return { Authorization: `${user.token_type || "Bearer"} ${user.access_token}` };
}
