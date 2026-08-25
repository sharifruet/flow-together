/**
 * TogetherFlow Shell (REQUIREMENTS.md §7.5): branding, navigation, tenant context
 * and the user menu. Phase 1 ships only the Work app, so the app switcher lists the
 * remaining apps as disabled rather than pretending they exist.
 */

import { type ReactNode } from "react";
import { Brand, ShellMenu, useAuth, useTenant, type AppLinks } from "@togetherflow/common";

export type WorkView = "inbox" | "cases" | "start" | "history";

export interface AppShellProps {
  view: WorkView;
  onViewChange: (view: WorkView) => void;
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
          <span className="tf-shell__app-name">Work</span>
        </div>

        <nav className="tf-shell__nav" aria-label="Work sections">
          <button
            type="button"
            className={navClass(view === "inbox")}
            aria-current={view === "inbox" ? "page" : undefined}
            onClick={() => onViewChange("inbox")}
          >
            Tasks
          </button>
          <button
            type="button"
            className={navClass(view === "cases")}
            aria-current={view === "cases" ? "page" : undefined}
            onClick={() => onViewChange("cases")}
          >
            Cases
          </button>
          <button
            type="button"
            className={navClass(view === "start")}
            aria-current={view === "start" ? "page" : undefined}
            onClick={() => onViewChange("start")}
          >
            Start work
          </button>
          <button
            type="button"
            className={navClass(view === "history")}
            aria-current={view === "history" ? "page" : undefined}
            onClick={() => onViewChange("history")}
          >
            My history
          </button>
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
            currentApp="work"
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
