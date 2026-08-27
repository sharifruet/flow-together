/**
 * Work's URL scheme (UI_POLISH_BACKLOG.md F1, ADR 0016).
 *
 * One table, so the nav, the router and the deep links cannot disagree about where a
 * screen lives. Before W1.3 this was `useState<WorkView>("inbox")` and a second
 * `useState<TaskResponse>()`: a task could not be linked to, Back left the app, and a
 * refresh dropped the user at the inbox with their filters cleared.
 *
 * Detail routes are nested under their list — `/inbox/:taskId` — rather than living at
 * `/tasks/:taskId`, so Back from a task lands on the list it came from and the breadcrumb
 * is derivable from the path.
 */

import { buildPath, type IconName, type RouteDefinition } from "@togetherflow/common";

export type WorkView = "inbox" | "cases" | "start" | "history" | "reports";

export const WORK_VIEWS: WorkView[] = ["inbox", "cases", "start", "history", "reports"];

export const ROUTES: Record<WorkView, { pattern: string; icon: IconName }> = {
  inbox: { pattern: "/inbox", icon: "inbox" },
  cases: { pattern: "/cases", icon: "cases" },
  start: { pattern: "/start", icon: "play" },
  history: { pattern: "/history", icon: "history" },
  reports: { pattern: "/reports", icon: "system" },
};

/**
 * Order matters: the router takes the first match, so `/inbox/:taskId` has to be tried
 * before `/inbox` — which it would otherwise never reach, because the segment counts
 * differ but a future wildcard would not.
 */
export const ROUTE_TABLE: RouteDefinition<WorkView>[] = [
  { id: "inbox", pattern: "/inbox/:taskId" },
  { id: "inbox", pattern: ROUTES.inbox.pattern },
  { id: "cases", pattern: "/cases/:caseId" },
  { id: "cases", pattern: ROUTES.cases.pattern },
  { id: "start", pattern: ROUTES.start.pattern },
  { id: "history", pattern: ROUTES.history.pattern },
  { id: "reports", pattern: ROUTES.reports.pattern },
  // The root is the inbox: Work opens on what is waiting for you.
  { id: "inbox", pattern: "/" },
];

export function pathFor(view: WorkView): string {
  return ROUTES[view].pattern;
}

export function taskPath(taskId: string): string {
  return buildPath("/inbox/:taskId", { taskId });
}

export function casePath(caseId: string): string {
  return buildPath("/cases/:caseId", { caseId });
}
