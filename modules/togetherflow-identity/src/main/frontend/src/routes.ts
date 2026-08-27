/**
 * Identity's URL scheme (UI_POLISH_BACKLOG.md F1, ADR 0016).
 *
 * The smallest of the four: three sections, one of which has a detail view. `/users/:userId`
 * is the one that mattered — a user profile could not be linked to before, which is the
 * first thing anyone wants to paste into a ticket.
 */

import { buildPath, type IconName, type RouteDefinition } from "@togetherflow/common";

export type IdentityView = "users" | "groups" | "privileges";

export const IDENTITY_VIEWS: IdentityView[] = ["users", "groups", "privileges"];

export const ROUTES: Record<IdentityView, { pattern: string; icon: IconName }> = {
  users: { pattern: "/users", icon: "users" },
  groups: { pattern: "/groups", icon: "groups" },
  privileges: { pattern: "/privileges", icon: "privileges" },
};

export const ROUTE_TABLE: RouteDefinition<IdentityView>[] = [
  { id: "users", pattern: "/users/:userId" },
  { id: "users", pattern: ROUTES.users.pattern },
  { id: "groups", pattern: "/groups/:groupId" },
  { id: "groups", pattern: ROUTES.groups.pattern },
  { id: "privileges", pattern: ROUTES.privileges.pattern },
  { id: "users", pattern: "/" },
];

export function pathFor(view: IdentityView): string {
  return ROUTES[view].pattern;
}

export function userPath(userId: string): string {
  return buildPath("/users/:userId", { userId });
}

export function groupPath(groupId: string): string {
  return buildPath("/groups/:groupId", { groupId });
}
