/**
 * IDM REST wrappers (REQUIREMENTS.md §7.3).
 *
 * IDM lives behind its own servlet prefix (`/idm-api` by default), separate from the
 * process API, so this takes its own ApiClient rather than reusing the process one.
 */

import type { ApiClient } from "./client";
import type { DataResponse } from "./types";

export interface IdmUser {
  id: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
  email?: string;
  /** Only ever sent, never returned — the REST layer omits it from responses. */
  password?: string;
}

export interface IdmGroup {
  id: string;
  url?: string;
  name?: string;
  type?: string;
}

export interface IdmPrivilege {
  id: string;
  name: string;
  /** Populated only by the single-privilege GET, not by the list endpoint. */
  users?: IdmUser[];
  groups?: IdmGroup[];
}

export interface UserQuery {
  start?: number;
  size?: number;
  sort?: "id" | "firstName" | "lastName" | "displayName" | "email";
  order?: "asc" | "desc";
  id?: string;
  firstNameLike?: string;
  lastNameLike?: string;
  displayNameLike?: string;
  emailLike?: string;
  memberOfGroup?: string;
}

export interface GroupQuery {
  start?: number;
  size?: number;
  sort?: "id" | "name" | "type";
  order?: "asc" | "desc";
  id?: string;
  nameLike?: string;
  type?: string;
  /** Groups this user belongs to. */
  member?: string;
}

export class IdmApi {
  constructor(private readonly client: ApiClient) {}

  /* ── Users ─────────────────────────────────────────────────────────────── */

  listUsers(query: UserQuery = {}, signal?: AbortSignal): Promise<DataResponse<IdmUser>> {
    return this.client.request("/users", {
      query: { size: 25, sort: "id", order: "asc", ...query },
      signal,
    });
  }

  getUser(userId: string, signal?: AbortSignal): Promise<IdmUser> {
    return this.client.request(`/users/${encodeURIComponent(userId)}`, { signal });
  }

  createUser(user: IdmUser): Promise<IdmUser> {
    return this.client.request("/users", { method: "POST", body: user });
  }

  /**
   * PUT is a true partial update — the server tracks which properties were present
   * in the body — so only send what actually changed. In particular, omit `password`
   * entirely unless it is being set, or the engine will reset it.
   */
  updateUser(userId: string, changes: Partial<IdmUser>): Promise<IdmUser> {
    return this.client.request(`/users/${encodeURIComponent(userId)}`, {
      method: "PUT",
      body: changes,
    });
  }

  deleteUser(userId: string): Promise<void> {
    return this.client.request(`/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
  }

  /* ── Groups ────────────────────────────────────────────────────────────── */

  listGroups(query: GroupQuery = {}, signal?: AbortSignal): Promise<DataResponse<IdmGroup>> {
    return this.client.request("/groups", {
      query: { size: 25, sort: "id", order: "asc", ...query },
      signal,
    });
  }

  getGroup(groupId: string, signal?: AbortSignal): Promise<IdmGroup> {
    return this.client.request(`/groups/${encodeURIComponent(groupId)}`, { signal });
  }

  createGroup(group: IdmGroup): Promise<IdmGroup> {
    return this.client.request("/groups", { method: "POST", body: group });
  }

  updateGroup(groupId: string, changes: Partial<IdmGroup>): Promise<IdmGroup> {
    return this.client.request(`/groups/${encodeURIComponent(groupId)}`, {
      method: "PUT",
      // The engine rejects a body whose id disagrees with the path.
      body: { ...changes, id: groupId },
    });
  }

  deleteGroup(groupId: string): Promise<void> {
    return this.client.request(`/groups/${encodeURIComponent(groupId)}`, { method: "DELETE" });
  }

  /* ── Membership ────────────────────────────────────────────────────────── */

  /**
   * There is no GET for memberships; members are listed through the user query.
   */
  listGroupMembers(
    groupId: string,
    query: Omit<UserQuery, "memberOfGroup"> = {},
    signal?: AbortSignal,
  ): Promise<DataResponse<IdmUser>> {
    return this.listUsers({ ...query, memberOfGroup: groupId }, signal);
  }

  /** Groups the given user belongs to. */
  listUserGroups(userId: string, signal?: AbortSignal): Promise<DataResponse<IdmGroup>> {
    return this.listGroups({ member: userId, size: 100 }, signal);
  }

  addGroupMember(groupId: string, userId: string): Promise<void> {
    return this.client.request(`/groups/${encodeURIComponent(groupId)}/members`, {
      method: "POST",
      body: { userId },
    });
  }

  removeGroupMember(groupId: string, userId: string): Promise<void> {
    return this.client.request(
      `/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`,
      { method: "DELETE" },
    );
  }

  /* ── Privileges ────────────────────────────────────────────────────────── */

  listPrivileges(
    query: { start?: number; size?: number; userId?: string; groupId?: string } = {},
    signal?: AbortSignal,
  ): Promise<DataResponse<IdmPrivilege>> {
    // This endpoint does not support sorting — its sort map is null server-side.
    return this.client.request("/privileges", { query: { size: 100, ...query }, signal });
  }

  getPrivilege(privilegeId: string, signal?: AbortSignal): Promise<IdmPrivilege> {
    return this.client.request(`/privileges/${encodeURIComponent(privilegeId)}`, { signal });
  }

  grantPrivilegeToUser(privilegeId: string, userId: string): Promise<void> {
    return this.client.request(`/privileges/${encodeURIComponent(privilegeId)}/users`, {
      method: "POST",
      body: { userId },
    });
  }

  revokePrivilegeFromUser(privilegeId: string, userId: string): Promise<void> {
    return this.client.request(
      `/privileges/${encodeURIComponent(privilegeId)}/users/${encodeURIComponent(userId)}`,
      { method: "DELETE" },
    );
  }

  grantPrivilegeToGroup(privilegeId: string, groupId: string): Promise<void> {
    return this.client.request(`/privileges/${encodeURIComponent(privilegeId)}/groups`, {
      method: "POST",
      body: { groupId },
    });
  }

  revokePrivilegeFromGroup(privilegeId: string, groupId: string): Promise<void> {
    // Note the singular "group" here — the revoke path differs from grant/list,
    // which use "groups". This asymmetry is in the engine, not a typo.
    return this.client.request(
      `/privileges/${encodeURIComponent(privilegeId)}/group/${encodeURIComponent(groupId)}`,
      { method: "DELETE" },
    );
  }
}

/** Convenience: how a user should be shown in a list. */
export function userDisplayName(user: IdmUser): string {
  if (user.displayName?.trim()) return user.displayName;
  const full = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return full || user.id;
}
