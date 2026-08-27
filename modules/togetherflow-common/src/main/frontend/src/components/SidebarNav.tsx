/**
 * The left rail (UI_POLISH_BACKLOG.md B1).
 *
 * B1's finding: "The header is the whole IA" — brand, app name, a row of unstyled text
 * buttons, tenant select, avatar menu. For Control, with seven top-level areas each
 * holding sub-tables, a flat button row is the wrong control.
 *
 * So: a rail for the desktop-first apps (Control, Design, Identity), the top bar kept for
 * Work, which has four destinations and is used on tablets. Which one an app gets is
 * `AppFrame`'s `navMode`, not a decision made here.
 *
 * Every item is a real `<Link>`, which is what makes middle-click and copy-link-address
 * work on navigation — F1 asks for that specifically.
 */

import { Icon, type IconName } from "./Icon";
import { Badge } from "./Badge";
import { Link } from "../routing/Link";
import { useT } from "../i18n/I18nContext";
import { usePersistentState } from "../hooks/usePersistentState";

export interface SidebarItem {
  id: string;
  label: string;
  to: string;
  icon: IconName;
  /**
   * A count beside the label (B3). `undefined` renders nothing — distinct from `0`,
   * which renders "0" and is a real, useful statement about an empty queue.
   */
  count?: number;
  /** Tone for the count badge — danger for dead-letter jobs, neutral for an inbox depth. */
  countTone?: "neutral" | "info" | "warning" | "danger";
}

export interface SidebarGroup {
  /** Omitted for the first group, which needs no heading. */
  label?: string;
  items: SidebarItem[];
}

export interface SidebarNavProps {
  label: string;
  groups: SidebarGroup[];
  /** Id of the item matching the current route. */
  activeId: string;
  /** Namespaces the persisted collapsed state — one app's rail, not all of them. */
  preferenceKey: string;
}

const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

export function SidebarNav({ label, groups, activeId, preferenceKey }: SidebarNavProps) {
  const t = useT();
  const [collapsed, setCollapsed] = usePersistentState<boolean>(
    `${preferenceKey}.sidebar.collapsed`,
    false,
    isBoolean,
  );

  return (
    <nav
      className={`tf-sidebar${collapsed ? " tf-sidebar--collapsed" : ""}`}
      aria-label={label}
    >
      {groups.map((group, index) => (
        <div className="tf-sidebar__group" key={group.label ?? index}>
          {group.label ? (
            // Hidden rather than removed when collapsed: the grouping is still real for a
            // screen-reader user, who has no rail width to run out of.
            <h2 className={collapsed ? "tf-visually-hidden" : "tf-sidebar__group-label"}>
              {group.label}
            </h2>
          ) : null}
          <ul className="tf-sidebar__list">
            {group.items.map((item) => {
              const active = item.id === activeId;
              return (
                <li key={item.id}>
                  <Link
                    to={item.to}
                    className={`tf-sidebar__item${active ? " tf-sidebar__item--active" : ""}`}
                    aria-current={active ? "page" : undefined}
                    // Collapsed, the label is the only thing naming the link, and it is
                    // hidden — so name it explicitly rather than leaving an icon-only link.
                    aria-label={collapsed ? item.label : undefined}
                    title={collapsed ? item.label : undefined}
                  >
                    <Icon name={item.icon} size={18} />
                    <span className={collapsed ? "tf-visually-hidden" : "tf-sidebar__label"}>
                      {item.label}
                    </span>
                    {item.count !== undefined ? (
                      <span className="tf-sidebar__count">
                        <Badge tone={item.countTone ?? "neutral"} subtle srLabel={`${item.count} ${item.label}`}>
                          {item.count}
                        </Badge>
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <button
        type="button"
        className="tf-sidebar__toggle"
        onClick={() => setCollapsed(!collapsed)}
        aria-expanded={!collapsed}
      >
        <Icon name={collapsed ? "chevron-right" : "chevron-left"} size={16} />
        <span className={collapsed ? "tf-visually-hidden" : undefined}>
          {collapsed ? t("nav.expand") : t("nav.collapse")}
        </span>
      </button>
    </nav>
  );
}
