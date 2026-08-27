/**
 * Design's section navigation, on top of the shared shell (REQUIREMENTS.md §7.5).
 * The chrome itself lives in `AppFrame` in `togetherflow-common`.
 *
 * Design has one section today, so the rail carries one item. It takes the rail rather
 * than the top bar anyway (B1) because W2.3's model-library IA and W3.1's workspaces both
 * land here, and a rail that appears later is a bigger change than a rail with one item.
 */

import { type ReactNode } from "react";
import { AppFrame, useT, type AppLinks, type NavItem } from "@togetherflow/common";
import { DESIGN_VIEWS, ROUTES, pathFor, type DesignView } from "../../routes";

export interface AppShellProps {
  view: DesignView;
  /** Model count for the nav badge (B3). */
  modelCount?: number;
  apps?: AppLinks;
  onChangePassword?: (password: string) => Promise<void>;
  children: ReactNode;
}

export function AppShell({ view, modelCount, apps, onChangePassword, children }: AppShellProps) {
  const t = useT();

  const items: NavItem<DesignView>[] = DESIGN_VIEWS.map((id) => ({
    id,
    label: t(`nav.${id}`),
    to: pathFor(id),
    icon: ROUTES[id].icon,
    count: id === "models" ? modelCount : undefined,
  }));

  return (
    <AppFrame
      app="design"
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

export { DESIGN_VIEWS, type DesignView };
