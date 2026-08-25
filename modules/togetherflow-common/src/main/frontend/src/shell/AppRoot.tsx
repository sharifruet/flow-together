/**
 * One bootstrap for all four apps: language, auth, tenant, feedback and crash handling,
 * composed in the right order.
 *
 * Each app's `main.tsx` had its own copy of this provider stack, which meant a
 * cross-cutting concern — the i18n provider, the error boundary, the reporting hookup —
 * had to be added in four places and could silently be added in three. Ordering matters
 * and is easy to get subtly wrong: the boundary has to sit *inside* the i18n provider so
 * its own copy can be translated, and *inside* the toast provider so a crash screen can
 * still raise one.
 */

import { useEffect, useMemo, type ReactNode } from "react";
import { AuthProvider, useAuth } from "../auth/AuthContext";
import { TenantProvider, useTenant } from "../tenant/TenantContext";
import { ToastProvider } from "../components/Toast";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { I18nProvider, mergeCatalogues, type Catalogues } from "../i18n/I18nContext";
import { ShortcutProvider } from "../shortcuts/ShortcutContext";
import { commonMessages } from "../i18n/messages";
import {
  configureErrorReporting,
  installGlobalErrorHandlers,
  reportVital,
} from "../observability/errorReporting";
import { observeWebVitals } from "../observability/webVitals";
import type { AppLinks, RuntimeConfig } from "../config";

export interface AppRootProps {
  app: keyof AppLinks;
  config: RuntimeConfig;
  /** The app's own catalogues; merged over the shared ones. */
  messages: Catalogues;
  children: ReactNode;
}

export function AppRoot({ app, config, messages, children }: AppRootProps) {
  const catalogues = useMemo(
    () => mergeCatalogues(commonMessages, messages),
    [messages],
  );

  useEffect(() => installGlobalErrorHandlers(), []);

  /*
   * Core Web Vitals (§13.5). Started once per page load, and only where the deployment
   * has somewhere to send them — measuring what nobody collects is pure overhead.
   */
  useEffect(() => {
    if (!config.observability.errorEndpoint) return;
    return observeWebVitals(reportVital);
  }, [config.observability.errorEndpoint]);

  return (
    <I18nProvider catalogues={catalogues} locale={config.locale}>
      <AuthProvider baseUrl={config.apiBase} mode={config.auth.mode} oidc={config.auth.oidc}>
        <TenantProvider>
          <ToastProvider>
            <ErrorReportingBridge
              app={app}
              endpoint={config.observability.errorEndpoint}
              release={config.observability.release}
            />
            {/*
              Inside the boundary's providers but outside the boundary itself: a crashed
              screen has unmounted its bindings, so the shortcut set is correct without
              the provider having to know a crash happened.
            */}
            <ShortcutProvider>
              <ErrorBoundary boundary={app}>{children}</ErrorBoundary>
            </ShortcutProvider>
          </ToastProvider>
        </TenantProvider>
      </AuthProvider>
    </I18nProvider>
  );
}

/**
 * Registers who is signed in with the reporter. It reads the contexts rather than being
 * handed values so a report always carries the *current* user and tenant — a crash after
 * a tenant switch attributed to the previous tenant is worse than no attribution.
 */
function ErrorReportingBridge({
  app,
  endpoint,
  release,
}: {
  app: keyof AppLinks;
  endpoint?: string;
  release?: string;
}) {
  const { session } = useAuth();
  const { tenantId } = useTenant();

  useEffect(() => {
    configureErrorReporting({
      app: `togetherflow-${app}`,
      endpoint,
      release,
      getUserId: () => session?.userId,
      getTenantId: () => tenantId,
    });
  }, [app, endpoint, release, session?.userId, tenantId]);

  return null;
}
