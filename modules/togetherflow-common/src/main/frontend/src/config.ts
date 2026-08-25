/**
 * Runtime configuration, read from the hosting page rather than baked into the bundle,
 * so one built artifact can be promoted across environments (REQUIREMENTS.md §13.3).
 *
 * The container image writes `/config.js` at startup from environment variables; see
 * modules/togetherflow-work/docker/.
 */

import type { AuthMode } from "./auth/AuthContext";
import type { OidcConfig } from "./auth/oidc";

export interface RuntimeConfig {
  apiBase: string;
  /** IDM REST base; separate servlet from the process API. */
  idmBase: string;
  /** DMN REST base — Control reads decision-execution history from here. */
  dmnBase: string;
  /** CMMN REST base — Design deploys case models here. */
  cmmnBase: string;
  /** App engine REST base — Design publishes app bundles here. */
  appBase: string;
  /** Event registry REST base — Design deploys events and channels here. */
  eventBase: string;
  /** External worker job REST base. */
  externalJobBase: string;
  auth: { mode: AuthMode; oidc?: OidcConfig };
  identity: {
    /**
     * True when identities come from a read-only directory (LDAP) rather than the
     * engine's own tables (REQUIREMENTS.md §7.3). The engine exposes no flag for
     * this, so it is deployment configuration; the UI hides create/edit/delete
     * rather than offering actions that will fail.
     */
    readOnly: boolean;
  };
}

declare global {
  interface Window {
    __TOGETHERFLOW_CONFIG__?: {
      apiBase?: string;
      idmBase?: string;
      dmnBase?: string;
      cmmnBase?: string;
      appBase?: string;
      eventBase?: string;
      externalJobBase?: string;
      identity?: { readOnly?: boolean };
      auth?: {
        mode?: string;
        authority?: string;
        clientId?: string;
        redirectUri?: string;
        postLogoutRedirectUri?: string;
        scope?: string;
      };
    };
    /** Legacy single-value form kept working for existing deployments. */
    __TOGETHERFLOW_API_BASE__?: string;
  }
}

export function readRuntimeConfig(): RuntimeConfig {
  const raw = window.__TOGETHERFLOW_CONFIG__ ?? {};
  const apiBase = raw.apiBase ?? window.__TOGETHERFLOW_API_BASE__ ?? "/process-api";
  const idmBase = raw.idmBase ?? "/idm-api";
  const dmnBase = raw.dmnBase ?? "/dmn-api";
  const cmmnBase = raw.cmmnBase ?? "/cmmn-api";
  const appBase = raw.appBase ?? "/app-api";
  const eventBase = raw.eventBase ?? "/event-registry-api";
  const externalJobBase = raw.externalJobBase ?? "/external-job-api";
  const identity = { readOnly: raw.identity?.readOnly === true };

  const mode: AuthMode = raw.auth?.mode === "basic" ? "basic" : "oidc";

  if (mode === "basic") {
    return { apiBase, idmBase, dmnBase, cmmnBase, appBase, eventBase, externalJobBase, identity, auth: { mode: "basic" } };
  }

  const { authority, clientId } = raw.auth ?? {};
  if (!authority || !clientId) {
    // Failing loudly beats silently falling back to Basic in production: a
    // misconfigured deployment should not quietly downgrade its own auth.
    throw new Error(
      "TogetherFlow is configured for OIDC but window.__TOGETHERFLOW_CONFIG__.auth is missing " +
        "'authority' and/or 'clientId'. Set them, or set auth.mode = 'basic' for local development.",
    );
  }

  return {
    apiBase,
    idmBase,
    dmnBase,
    cmmnBase,
    appBase,
    eventBase,
    externalJobBase,
    identity,
    auth: {
      mode: "oidc",
      oidc: {
        authority,
        clientId,
        redirectUri: raw.auth?.redirectUri,
        postLogoutRedirectUri: raw.auth?.postLogoutRedirectUri,
        scope: raw.auth?.scope,
      },
    },
  };
}
