/**
 * Control's section navigation, on top of the shared shell (REQUIREMENTS.md §7.5).
 * The chrome itself lives in `AppFrame` in `togetherflow-common`.
 *
 * Takes W1.3's left rail (B1), which is where it matters most: seven top-level areas,
 * each with sub-tables, previously presented as a row of unstyled text buttons.
 */

import { type ReactNode } from "react";
import { AppFrame, useT, type AppLinks, type NavItem } from "@togetherflow/common";
import { CONTROL_VIEWS, ROUTES, pathFor, type ControlView } from "../../routes";

/** Rail group headings, keyed by the group name in the route table. */
const GROUP_LABELS: Record<string, ((t: (key: string) => string) => string) | undefined> = {
  operations: (t) => t("nav.group.operations"),
  platform: (t) => t("nav.group.platform"),
};

/** Counts for the rail badges (B3). Undefined for a section with nothing worth counting. */
export interface ControlCounts {
  instances?: number;
  cases?: number;
  /** Dead-letter jobs specifically — the number an operator acts on. */
  deadLetterJobs?: number;
}

export interface AppShellProps {
  view: ControlView;
  counts?: ControlCounts;
  apps?: AppLinks;
  onChangePassword?: (password: string) => Promise<void>;
  children: ReactNode;
}

export function AppShell({ view, counts, apps, onChangePassword, children }: AppShellProps) {
  const t = useT();

  const items: NavItem<ControlView>[] = CONTROL_VIEWS.map((id) => ({
    id,
    label: t(`nav.${id}`),
    to: pathFor(id),
    icon: ROUTES[id].icon,
    // Not a computed key: the catalogue conformance test (§8) can only verify keys it
    // can see at a call site, and a two-level template would be invisible to it.
    group: GROUP_LABELS[ROUTES[id].group ?? ""]?.(t),
    count:
      id === "instances"
        ? counts?.instances
        : id === "cases"
          ? counts?.cases
          : id === "jobs"
            ? counts?.deadLetterJobs
            : undefined,
    // B3's own example: "an operator cannot see '12 dead-letter jobs' without opening
    // Jobs." Danger, because a dead-letter job is work that has stopped.
    countTone: id === "jobs" ? "danger" : "neutral",
  }));

  return (
    <AppFrame
      app="control"
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

export { CONTROL_VIEWS, type ControlView };
