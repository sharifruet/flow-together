/**
 * Work's section navigation, on top of the shared shell (REQUIREMENTS.md §7.5).
 *
 * Everything §7.5 requires not to drift between apps — the brand lockup, tenant control,
 * app switcher, account menu, skip link — lives in `AppFrame` in `togetherflow-common`.
 * All that is left here is which sections Work has.
 */

import { type ReactNode } from "react";
import { AppFrame, useT, type AppLinks } from "@togetherflow/common";

export type WorkView = "inbox" | "cases" | "start" | "history";

export const WORK_VIEWS: WorkView[] = ["inbox", "cases", "start", "history"];

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
  const t = useT();
  return (
    <AppFrame
      app="work"
      navLabel={t("nav.label")}
      items={WORK_VIEWS.map((id) => ({ id, label: t(`nav.${id}`) }))}
      view={view}
      onViewChange={onViewChange}
      apps={apps}
      onChangePassword={onChangePassword}
    >
      {children}
    </AppFrame>
  );
}
