/**
 * Runtime configuration, read from the hosting page rather than baked into the bundle,
 * so one built artifact can be promoted across environments (REQUIREMENTS.md §13.3).
 *
 * The container image writes `/config.js` at startup from environment variables; see
 * modules/togetherflow-work/docker/.
 */

import type { AuthMode } from "./auth/AuthContext";
import type { OidcConfig } from "./auth/oidc";

/**
 * Where the other TogetherFlow apps live.
 *
 * They are separately deployed origins, so there is nothing to infer — the app switcher
 * only offers what the deployment configures. Anything unset is simply not listed.
 */
export interface AppLinks {
  work?: string;
  control?: string;
  identity?: string;
  design?: string;
}

export interface RuntimeConfig {
  apiBase: string;
  /**
   * Path the app is served under, when it is not at the origin root — "/design" behind a
   * reverse proxy that fans four apps out of one host.
   *
   * The router (ADR 0016) strips it from the path it matches and puts it back on every
   * href it renders. It cannot be inferred: a hard-coded "/" is exactly how a deep link
   * works in dev and 404s in production.
   */
  basePath: string;
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
  /** URLs of the sibling apps, for the shell's app switcher (§7.5). */
  apps: AppLinks;
  /**
   * Base URL of `togetherflow-attachment-gateway`, set only where the deployment uses a
   * non-`db` attachment provider (§7.6). Empty means the default: bytes go straight to
   * Flowable and no gateway is deployed.
   */
  attachmentGateway: string;
  /**
   * Base URL of `togetherflow-event-recorder`'s endpoint (§7.2, ADR 0015). Empty — the
   * default — means the recorder is not deployed, and Control hides the received-events
   * view entirely rather than showing a feed that would always be empty.
   */
  eventRecorder: string;
  identity: {
    /**
     * True when identities come from a read-only directory (LDAP) rather than the
     * engine's own tables (REQUIREMENTS.md §7.3). The engine exposes no flag for
     * this, so it is deployment configuration; the UI hides create/edit/delete
     * rather than offering actions that will fail.
     */
    readOnly: boolean;
  };
  /** Frontend error tracking (§13.2). Unset means console-only. */
  observability: {
    errorEndpoint?: string;
    /** Build identifier, so a report can be tied to the bundle that produced it. */
    release?: string;
  };
  /**
   * Forces a UI language for the whole deployment (§8 i18n). Unset lets each user's
   * browser — and their own choice in the shell menu — decide.
   */
  locale?: string;
}

declare global {
  interface Window {
    __TOGETHERFLOW_CONFIG__?: {
      apiBase?: string;
      basePath?: string;
      idmBase?: string;
      dmnBase?: string;
      cmmnBase?: string;
      appBase?: string;
      eventBase?: string;
      externalJobBase?: string;
      apps?: AppLinks;
      attachmentGateway?: string;
      eventRecorder?: string;
      identity?: { readOnly?: boolean };
      observability?: { errorEndpoint?: string; release?: string };
      locale?: string;
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
  const basePath = raw.basePath || "/";
  const idmBase = raw.idmBase ?? "/idm-api";
  const dmnBase = raw.dmnBase ?? "/dmn-api";
  const cmmnBase = raw.cmmnBase ?? "/cmmn-api";
  const appBase = raw.appBase ?? "/app-api";
  const eventBase = raw.eventBase ?? "/event-registry-api";
  const externalJobBase = raw.externalJobBase ?? "/external-job-api";
  const apps: AppLinks = raw.apps ?? {};
  const attachmentGateway = raw.attachmentGateway ?? "";
  const eventRecorder = raw.eventRecorder ?? "";
  const identity = { readOnly: raw.identity?.readOnly === true };
  const observability = {
    errorEndpoint: raw.observability?.errorEndpoint || undefined,
    release: raw.observability?.release || undefined,
  };
  const locale = raw.locale || undefined;

  const mode: AuthMode = raw.auth?.mode === "basic" ? "basic" : "oidc";

  if (mode === "basic") {
    return {
      apiBase,
      basePath,
      idmBase,
      dmnBase,
      cmmnBase,
      appBase,
      eventBase,
      externalJobBase,
      apps,
      attachmentGateway,
      eventRecorder,
      identity,
      observability,
      locale,
      auth: { mode: "basic" },
    };
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
    basePath,
    idmBase,
    dmnBase,
    cmmnBase,
    appBase,
    eventBase,
    externalJobBase,
    apps,
    attachmentGateway,
    eventRecorder,
    identity,
    observability,
    locale,
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
