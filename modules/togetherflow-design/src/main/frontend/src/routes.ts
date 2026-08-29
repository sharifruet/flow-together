/**
 * Design's URL scheme (UI_POLISH_BACKLOG.md F1, ADR 0016).
 *
 * `/models/:modelId` is the one that matters: a model could not be linked to, so
 * "review this process" had to be "open Design, find Invoice Approval, open it". The
 * editor a model opens in is derived from its `category` (see `modelKindOf`), not from
 * the URL — the kind is a property of the model, and putting it in the path would let
 * the two disagree.
 */

import { buildPath, type IconName, type RouteDefinition } from "@togetherflow/common";

export type DesignView = "models" | "workspaces";

export const DESIGN_VIEWS: DesignView[] = ["models", "workspaces"];

export const ROUTES: Record<DesignView, { pattern: string; icon: IconName }> = {
  models: { pattern: "/models", icon: "models" },
  // Only navigable where the workspace service is deployed (ADR 0017); the route exists
  // regardless so a bookmarked link resolves rather than 404ing into the model list.
  workspaces: { pattern: "/workspaces", icon: "groups" },
};

export const ROUTE_TABLE: RouteDefinition<DesignView>[] = [
  { id: "workspaces", pattern: ROUTES.workspaces.pattern },
  { id: "models", pattern: "/models/:modelId" },
  { id: "models", pattern: ROUTES.models.pattern },
  { id: "models", pattern: "/" },
];

export function pathFor(view: DesignView): string {
  return ROUTES[view].pattern;
}

export function modelPath(modelId: string): string {
  return buildPath("/models/:modelId", { modelId });
}
