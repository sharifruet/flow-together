/**
 * TogetherFlow Shell (REQUIREMENTS.md §7.5): branding, navigation, tenant context and
 * the user menu, shared by all four apps.
 *
 * Each app previously carried its own near-identical copy of this. The only real
 * variation is which sections the nav lists, so that is the one thing it takes as a
 * prop — everything §7.5 says must not drift (the brand lockup, the tenant control, the
 * switcher, the skip link) now has exactly one implementation.
 */

import type { ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";
import { Brand } from "../components/Brand";
import { ShellMenu } from "../components/ShellMenu";
import { useTenant } from "../tenant/TenantContext";
import { useT } from "../i18n/I18nContext";
import type { AppLinks } from "../config";

export interface NavItem<V extends string> {
  id: V;
  label: string;
}

export interface AppFrameProps<V extends string> {
  /** Which app this is: names the header and is excluded from the switcher. */
  app: keyof AppLinks;
  /** Accessible name for the section nav, e.g. "Work sections". */
  navLabel: string;
  items: NavItem<V>[];
  view: V;
  onViewChange: (view: V) => void;
  /** Sibling app URLs for the switcher; unset entries are simply not offered. */
  apps?: AppLinks;
  /** Omitted where identities are read-only, so no control is shown. */
  onChangePassword?: (password: string) => Promise<void>;
  /** Extra controls for the header's right-hand side, before the account menu. */
  actions?: ReactNode;
  children: ReactNode;
}

export function AppFrame<V extends string>({
  app,
  navLabel,
  items,
  view,
  onViewChange,
  apps,
  onChangePassword,
  actions,
  children,
}: AppFrameProps<V>) {
  const t = useT();
  const { session, signOut } = useAuth();
  const { tenantId, setTenantId, availableTenants } = useTenant();

  return (
    <div className="tf-shell">
      <a className="tf-skip-link" href="#tf-main">
        {t("shell.skipToContent")}
      </a>
      <header className="tf-shell__header">
        <div className="tf-shell__brand">
          <Brand size={26} />
          <span className="tf-shell__app-name">{t(`shell.app.${app}`)}</span>
        </div>

        <nav className="tf-shell__nav" aria-label={navLabel}>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={navClass(view === item.id)}
              aria-current={view === item.id ? "page" : undefined}
              onClick={() => onViewChange(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="tf-shell__actions">
          {actions}
          {availableTenants.length > 1 ? (
            <label className="tf-shell__tenant">
              <span className="tf-visually-hidden">{t("shell.tenant.label")}</span>
              <select
                className="tf-input tf-select"
                value={tenantId ?? ""}
                onChange={(event) => setTenantId(event.target.value || undefined)}
              >
                {availableTenants.map((tenant) => (
                  <option key={tenant} value={tenant}>
                    {tenant}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <ShellMenu
            userId={session?.userId ?? ""}
            currentApp={app}
            apps={apps}
            tenantId={tenantId}
            onSignOut={signOut}
            onChangePassword={onChangePassword}
          />
        </div>
      </header>

      <main className="tf-shell__main" id="tf-main">
        {children}
      </main>
    </div>
  );
}

function navClass(active: boolean): string {
  return ["tf-shell__nav-item", active ? "tf-shell__nav-item--active" : ""]
    .filter(Boolean)
    .join(" ");
}
