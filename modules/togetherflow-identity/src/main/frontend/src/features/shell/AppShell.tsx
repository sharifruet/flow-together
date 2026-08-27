/**
 * Identity's section navigation, on top of the shared shell (REQUIREMENTS.md §7.5).
 * The chrome itself lives in `AppFrame` in `togetherflow-common`, so branding, the
 * tenant control and the app switcher cannot drift between apps.
 *
 * Takes W1.3's left rail (B1): Identity is desktop-first administration, and the rail is
 * where the section counts sit legibly.
 */

import { type ReactNode } from "react";
import { AppFrame, useT, type AppLinks, type NavItem } from "@togetherflow/common";
import { IDENTITY_VIEWS, ROUTES, pathFor, type IdentityView } from "../../routes";

export interface AppShellProps {
  view: IdentityView;
  /** Row counts per section (B3), from the `total` on each list query. */
  counts?: Partial<Record<IdentityView, number>>;
  apps?: AppLinks;
  onChangePassword?: (password: string) => Promise<void>;
  children: ReactNode;
}

export function AppShell({ view, counts, apps, onChangePassword, children }: AppShellProps) {
  const t = useT();

  const items: NavItem<IdentityView>[] = IDENTITY_VIEWS.map((id) => ({
    id,
    label: t(`nav.${id}`),
    to: pathFor(id),
    icon: ROUTES[id].icon,
    count: counts?.[id],
  }));

  return (
    <AppFrame
      app="identity"
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

export { IDENTITY_VIEWS, type IdentityView };
