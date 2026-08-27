/**
 * Work's section navigation, on top of the shared shell (REQUIREMENTS.md §7.5).
 *
 * Everything §7.5 requires not to drift between apps — the brand lockup, tenant control,
 * app switcher, account menu, skip link — lives in `AppFrame` in `togetherflow-common`.
 * All that is left here is which sections Work has, and where each one lives.
 *
 * Work keeps the top bar rather than taking W1.3's left rail (B1): four destinations do
 * not need one, and Work is the app most used on a tablet, where a rail costs width the
 * task list wants.
 */

import { type ReactNode } from "react";
import { AppFrame, useT, type AppLinks, type NavItem } from "@togetherflow/common";
import { ROUTES, WORK_VIEWS, pathFor, type WorkView } from "../../routes";

export interface AppShellProps {
  view: WorkView;
  /** Inbox depth, shown as a nav count (B3). Undefined until the first count lands. */
  inboxCount?: number;
  /** Sibling app URLs for the switcher; unset entries are simply not offered. */
  apps?: AppLinks;
  /** Omitted where identities are read-only, so no control is shown. */
  onChangePassword?: (password: string) => Promise<void>;
  children: ReactNode;
}

export function AppShell({ view, inboxCount, apps, onChangePassword, children }: AppShellProps) {
  const t = useT();

  const items: NavItem<WorkView>[] = WORK_VIEWS.map((id) => ({
    id,
    label: t(`nav.${id}`),
    to: pathFor(id),
    icon: ROUTES[id].icon,
    // Only the inbox carries a count: it is the one number a business user acts on.
    count: id === "inbox" ? inboxCount : undefined,
    countTone: "info",
  }));

  return (
    <AppFrame
      app="work"
      navMode="top"
      navLabel={t("nav.label")}
      items={items}
      view={view}
      apps={apps}
      onChangePassword={onChangePassword}
    >
      {children}
    </AppFrame>
  );
}

export { WORK_VIEWS, type WorkView };
