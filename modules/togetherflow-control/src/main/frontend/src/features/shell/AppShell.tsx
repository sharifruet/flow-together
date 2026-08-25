/**
 * Control's section navigation, on top of the shared shell (REQUIREMENTS.md §7.5).
 * The chrome itself lives in `AppFrame` in `togetherflow-common`.
 */

import { type ReactNode } from "react";
import { AppFrame, useT, type AppLinks } from "@togetherflow/common";

export type ControlView =
  | "instances"
  | "cases"
  | "definitions"
  | "jobs"
  | "deployments"
  | "events"
  | "system";

export const CONTROL_VIEWS: ControlView[] = [
  "instances",
  "cases",
  "definitions",
  "jobs",
  "deployments",
  "events",
  "system",
];

export interface AppShellProps {
  view: ControlView;
  onViewChange: (view: ControlView) => void;
  apps?: AppLinks;
  onChangePassword?: (password: string) => Promise<void>;
  children: ReactNode;
}

export function AppShell({ view, onViewChange, apps, onChangePassword, children }: AppShellProps) {
  const t = useT();
  return (
    <AppFrame
      app="control"
      navLabel={t("nav.label")}
      items={CONTROL_VIEWS.map((id) => ({ id, label: t(`nav.${id}`) }))}
      view={view}
      onViewChange={onViewChange}
      apps={apps}
      onChangePassword={onChangePassword}
    >
      {children}
    </AppFrame>
  );
}
