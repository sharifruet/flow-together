/**
 * Control's URL scheme (UI_POLISH_BACKLOG.md F1, ADR 0016).
 *
 * The app F1's argument is loudest about: an operator cannot paste "look at this
 * instance" into a ticket, which is most of what Control is for. Seven sections, each
 * with a detail view, and none of them addressable before W1.3.
 *
 * Sections are grouped for the left rail (B1) — Control has seven top-level areas and had
 * a flat button row.
 */

import { buildPath, type IconName, type RouteDefinition } from "@togetherflow/common";

export type ControlView =
  | "overview"
  | "instances"
  | "cases"
  | "definitions"
  | "jobs"
  | "deployments"
  | "events"
  | "system";

export const CONTROL_VIEWS: ControlView[] = [
  "overview",
  "instances",
  "cases",
  "definitions",
  "jobs",
  "deployments",
  "events",
  "system",
];

interface ControlRoute {
  pattern: string;
  icon: IconName;
  /** Rail grouping. The first group is unlabelled — it is what the app opens on. */
  group?: "operations" | "platform";
}

export const ROUTES: Record<ControlView, ControlRoute> = {
  overview: { pattern: "/overview", icon: "system" },
  instances: { pattern: "/instances", icon: "instances" },
  cases: { pattern: "/cases", icon: "cases" },
  definitions: { pattern: "/definitions", icon: "definitions" },
  jobs: { pattern: "/jobs", icon: "jobs", group: "operations" },
  deployments: { pattern: "/deployments", icon: "deployments", group: "operations" },
  events: { pattern: "/events", icon: "events", group: "platform" },
  system: { pattern: "/system", icon: "system", group: "platform" },
};

export const ROUTE_TABLE: RouteDefinition<ControlView>[] = [
  { id: "overview", pattern: ROUTES.overview.pattern },
  { id: "instances", pattern: "/instances/:instanceId" },
  { id: "instances", pattern: ROUTES.instances.pattern },
  { id: "cases", pattern: "/cases/:caseId" },
  { id: "cases", pattern: ROUTES.cases.pattern },
  { id: "definitions", pattern: ROUTES.definitions.pattern },
  // Jobs has no single-row detail — the exception and stack trace are in the row — so
  // there is no /jobs/:jobId to advertise. A URL that resolves to nothing is worse than
  // an absent one.
  { id: "jobs", pattern: ROUTES.jobs.pattern },
  { id: "deployments", pattern: "/deployments/:deploymentId" },
  { id: "deployments", pattern: ROUTES.deployments.pattern },
  { id: "events", pattern: ROUTES.events.pattern },
  { id: "system", pattern: ROUTES.system.pattern },
  // The root is the overview (W2.1): "is anything wrong" before "what is running".
  { id: "overview", pattern: "/" },
];

export function pathFor(view: ControlView): string {
  return ROUTES[view].pattern;
}

export const instancePath = (instanceId: string) =>
  buildPath("/instances/:instanceId", { instanceId });
export const casePath = (caseId: string) => buildPath("/cases/:caseId", { caseId });
export const deploymentPath = (deploymentId: string) =>
  buildPath("/deployments/:deploymentId", { deploymentId });
