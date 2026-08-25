/**
 * TogetherFlow Shell for the Design app (REQUIREMENTS.md §7.5).
 *
 * Same chrome as Work — branding, app switcher, user menu — with Identity's own
 * sections. Kept as a copy rather than shared for now: the two shells have diverged
 * only in their nav items, and a third app is the right moment to extract the
 * common part rather than guessing the abstraction from two examples.
 */

import { type ReactNode } from "react";
import { Brand, ShellMenu, useAuth, useTenant, type AppLinks } from "@togetherflow/common";

export type DesignView = "models";

export interface AppShellProps {
  view: DesignView;
  onViewChange: (view: DesignView) => void;
  /** Sibling app URLs for the switcher; unset entries are simply not offered. */
  apps?: AppLinks;
  /** Omitted where identities are read-only, so no control is shown. */
  onChangePassword?: (password: string) => Promise<void>;
  children: ReactNode;
}

export function AppShell({ view, onViewChange, apps, onChangePassword, children }: AppShellProps) {
  const { session, signOut } = useAuth();
  const { tenantId, setTenantId, availableTenants } = useTenant();


  return (
    <div className="tf-shell">
      <a className="tf-skip-link" href="#tf-main">
        Skip to main content
      </a>
      <header className="tf-shell__header">
        <div className="tf-shell__brand">
          <Brand size={26} />
          <span className="tf-shell__app-name">Design</span>
        </div>

        <nav className="tf-shell__nav" aria-label="Design sections">
          {(["models"] as DesignView[]).map((section) => (
            <button
              key={section}
              type="button"
              className={navClass(view === section)}
              aria-current={view === section ? "page" : undefined}
              onClick={() => onViewChange(section)}
            >
              {section.charAt(0).toUpperCase() + section.slice(1)}
            </button>
          ))}
        </nav>

        <div className="tf-shell__actions">
          {availableTenants.length > 1 ? (
            <label className="tf-shell__tenant">
              <span className="tf-visually-hidden">Active tenant</span>
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
            currentApp="design"
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
