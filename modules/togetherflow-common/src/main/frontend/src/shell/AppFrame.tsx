/**
 * TogetherFlow Shell (REQUIREMENTS.md §7.5): branding, navigation, tenant context and
 * the user menu, shared by all four apps.
 *
 * Each app previously carried its own near-identical copy of this. The only real
 * variation is which sections the nav lists, so that is the one thing it takes as a
 * prop — everything §7.5 says must not drift (the brand lockup, the tenant control, the
 * switcher, the skip link) now has exactly one implementation.
 *
 * Rebuilt in W1.3/W1.5 against three backlog items:
 *
 *   F1  nav items are `<Link>`s with real hrefs, not buttons — so middle-click,
 *       copy-link-address and open-in-new-tab work on navigation.
 *   B1  `navMode` picks a left rail (Control, Design, Identity — desktop-first, many
 *       destinations) or the top bar (Work — four destinations, used on tablets).
 *   B5  the frame is full-height and the main region is the only thing that scrolls, so
 *       a list scrolls under a sticky toolbar instead of the whole page moving.
 */

import type { ReactNode } from "react";
import { useAuth } from "../auth/AuthContext";
import { Brand } from "../components/Brand";
import { ShellMenu } from "../components/ShellMenu";
import { SidebarNav, type SidebarGroup } from "../components/SidebarNav";
import { Icon, type IconName } from "../components/Icon";
import { Badge } from "../components/Badge";
import { Link } from "../routing/Link";
import { RouteAnnouncer } from "../routing/RouteAnnouncer";
import { useTenant } from "../tenant/TenantContext";
import { useT } from "../i18n/I18nContext";
import type { AppLinks } from "../config";

export interface NavItem<V extends string> {
  id: V;
  label: string;
  /** Where the item goes. Every destination has a URL since W1.3. */
  to: string;
  icon: IconName;
  /**
   * A count beside the label (B3). `undefined` renders nothing; `0` renders "0", which
   * is a real statement — "no dead-letter jobs" is worth seeing without opening Jobs.
   */
  count?: number;
  countTone?: "neutral" | "info" | "warning" | "danger";
  /** Groups items in the rail. Items with no group land in the first, unlabelled group. */
  group?: string;
}

export interface AppFrameProps<V extends string> {
  /** Which app this is: names the header and is excluded from the switcher. */
  app: keyof AppLinks;
  /** Accessible name for the section nav, e.g. "Work sections". */
  navLabel: string;
  items: NavItem<V>[];
  /** Id of the item matching the current route. */
  view: V;
  /** "rail" for the desktop-first apps; "top" for Work (B1). */
  navMode?: "rail" | "top";
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
  navMode = "rail",
  apps,
  onChangePassword,
  actions,
  children,
}: AppFrameProps<V>) {
  const t = useT();
  const { session, signOut } = useAuth();
  const { tenantId, setTenantId, availableTenants } = useTenant();

  const active = items.find((item) => item.id === view);

  /** Rail grouping, preserving the order the app declared. */
  const groups: SidebarGroup[] = [];
  for (const item of items) {
    const label = item.group;
    let group = groups.find((candidate) => candidate.label === label);
    if (!group) {
      group = { label, items: [] };
      groups.push(group);
    }
    group.items.push({
      id: item.id,
      label: item.label,
      to: item.to,
      icon: item.icon,
      count: item.count,
      countTone: item.countTone,
    });
  }

  return (
    <div className={`tf-shell tf-shell--${navMode}`}>
      <a className="tf-skip-link" href="#tf-main">
        {t("shell.skipToContent")}
      </a>

      {/* Announces the new screen and moves focus into it — a navigation with no page
          load is silent to assistive tech unless something says so. */}
      <RouteAnnouncer title={active?.label ?? t(`shell.app.${app}`)} />

      <header className="tf-shell__header">
        <div className="tf-shell__brand">
          <Brand size={26} />
          <span className="tf-shell__app-name">{t(`shell.app.${app}`)}</span>
        </div>

        {navMode === "top" ? (
          <nav className="tf-shell__nav" aria-label={navLabel}>
            {items.map((item) => (
              <Link
                key={item.id}
                to={item.to}
                className={navClass(view === item.id)}
                aria-current={view === item.id ? "page" : undefined}
              >
                <Icon name={item.icon} size={16} />
                {item.label}
                {item.count !== undefined ? (
                  <Badge
                    tone={item.countTone ?? "neutral"}
                    subtle
                    srLabel={`${item.count} ${item.label}`}
                  >
                    {item.count}
                  </Badge>
                ) : null}
              </Link>
            ))}
          </nav>
        ) : (
          <span className="tf-shell__nav-spacer" />
        )}

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

      <div className="tf-shell__body">
        {navMode === "rail" ? (
          <SidebarNav
            label={navLabel}
            groups={groups}
            activeId={view}
            preferenceKey={app}
          />
        ) : null}

        <main className="tf-shell__main" id="tf-main">
          {children}
        </main>
      </div>
    </div>
  );
}

function navClass(active: boolean): string {
  return ["tf-shell__nav-item", active ? "tf-shell__nav-item--active" : ""]
    .filter(Boolean)
    .join(" ");
}
