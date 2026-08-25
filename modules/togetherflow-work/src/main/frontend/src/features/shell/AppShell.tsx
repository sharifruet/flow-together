/**
 * TogetherFlow Shell (REQUIREMENTS.md §7.5): branding, navigation, tenant context
 * and the user menu. Phase 1 ships only the Work app, so the app switcher lists the
 * remaining apps as disabled rather than pretending they exist.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Brand, useAuth, useTenant } from "@togetherflow/common";

export type WorkView = "inbox" | "start" | "history";

export interface AppShellProps {
  view: WorkView;
  onViewChange: (view: WorkView) => void;
  children: ReactNode;
}

const FUTURE_APPS = ["Control", "Identity", "Design"];

export function AppShell({ view, onViewChange, children }: AppShellProps) {
  const { session, signOut } = useAuth();
  const { tenantId, setTenantId, availableTenants } = useTenant();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

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

          <div className="tf-shell__menu" ref={menuRef}>
            <button
              type="button"
              className="tf-shell__avatar"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span aria-hidden="true">{(session?.userId ?? "?").slice(0, 2).toUpperCase()}</span>
              <span className="tf-visually-hidden">Account menu for {session?.userId}</span>
            </button>
            {menuOpen ? (
              <div className="tf-menu" role="menu">
                <p className="tf-menu__user">
                  Signed in as <strong>{session?.userId}</strong>
                  {tenantId ? <span className="tf-menu__tenant">Tenant: {tenantId}</span> : null}
                </p>
                <div className="tf-menu__section">
                  <p className="tf-menu__label">Other apps</p>
                  {FUTURE_APPS.map((app) => (
                    <span key={app} className="tf-menu__item tf-menu__item--disabled" role="menuitem" aria-disabled="true">
                      TogetherFlow {app}
                      <em>Coming soon</em>
                    </span>
                  ))}
                </div>
                <button type="button" className="tf-menu__item" role="menuitem" onClick={signOut}>
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
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
