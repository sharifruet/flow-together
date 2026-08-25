/**
 * Identity's section navigation, on top of the shared shell (REQUIREMENTS.md §7.5).
 * The chrome itself lives in `AppFrame` in `togetherflow-common`, so branding, the
 * tenant control and the app switcher cannot drift between apps.
 */

import { type ReactNode } from "react";
import { AppFrame, useT, type AppLinks } from "@togetherflow/common";

export type IdentityView = "users" | "groups" | "privileges";

export const IDENTITY_VIEWS: IdentityView[] = ["users", "groups", "privileges"];

export interface AppShellProps {
  view: IdentityView;
  onViewChange: (view: IdentityView) => void;
  apps?: AppLinks;
  onChangePassword?: (password: string) => Promise<void>;
  children: ReactNode;
}

export function AppShell({ view, onViewChange, apps, onChangePassword, children }: AppShellProps) {
  const t = useT();
  return (
    <AppFrame
      app="identity"
      navLabel={t("nav.label")}
      items={IDENTITY_VIEWS.map((id) => ({ id, label: t(`nav.${id}`) }))}
      view={view}
      onViewChange={onViewChange}
      apps={apps}
      onChangePassword={onChangePassword}
    >
      {children}
    </AppFrame>
  );
}
