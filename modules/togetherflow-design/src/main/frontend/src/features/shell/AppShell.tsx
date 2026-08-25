/**
 * TogetherFlow Shell for the Design app (REQUIREMENTS.md §7.5).
 *
 * Same chrome as Work — branding, app switcher, user menu — with Identity's own
 * sections. Kept as a copy rather than shared for now: the two shells have diverged
 * only in their nav items, and a third app is the right moment to extract the
 * common part rather than guessing the abstraction from two examples.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Brand, useAuth, useTenant } from "@togetherflow/common";

export type DesignView = "models";

export interface AppShellProps {
  view: DesignView;
  onViewChange: (view: DesignView) => void;
  children: ReactNode;
}

const FUTURE_APPS: string[] = [];

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
                {FUTURE_APPS.length > 0 ? (
                  <div className="tf-menu__section">
                    <p className="tf-menu__label">Other apps</p>
                    {FUTURE_APPS.map((app) => (
                      <span key={app} className="tf-menu__item tf-menu__item--disabled" role="menuitem" aria-disabled="true">
                        TogetherFlow {app}
                        <em>Coming soon</em>
                      </span>
                    ))}
                  </div>
                ) : null}
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
