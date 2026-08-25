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

/* ── Profile pictures and custom user info (§7.3) ─────────────────────────── */

export interface UserInfoEntry {
  key: string;
  value?: string;
  url?: string;
}

/**
 * User pictures and custom info key/value pairs.
 *
 * **These are not on the IDM servlet.** §7.3 cites `UserPictureResource` and
 * `UserInfoCollectionResource`, and both live in `flowable-rest` under
 * `/identity/users/{id}/…` — the *process* API. Verified against a running engine: the
 * same paths on `/idm-api` answer "No endpoint". So this takes the process client even
 * though it is an identity concern.
 */
export class UserProfileApi {
  constructor(private readonly client: ApiClient) {}

  /**
   * Lists the info keys for a user.
   *
   * The collection endpoint returns **keys only** — each entry carries `key` and `url`
   * but no `value`. Reading the values means one request per key, which `listInfo`
   * below does, so callers get what they actually asked for.
   */
  async listInfoKeys(userId: string, signal?: AbortSignal): Promise<UserInfoEntry[]> {
    return this.client.request(`/identity/users/${encodeURIComponent(userId)}/info`, { signal });
  }

  /** Keys and their values, resolved. */
  async listInfo(userId: string, signal?: AbortSignal): Promise<UserInfoEntry[]> {
    const keys = await this.listInfoKeys(userId, signal);
    return Promise.all(
      keys.map(async (entry) => {
        try {
          return await this.getInfo(userId, entry.key, signal);
        } catch {
          // One unreadable key must not blank the whole list.
          return { key: entry.key, value: undefined };
        }
      }),
    );
  }

  getInfo(userId: string, key: string, signal?: AbortSignal): Promise<UserInfoEntry> {
    return this.client.request(
      `/identity/users/${encodeURIComponent(userId)}/info/${encodeURIComponent(key)}`,
      { signal },
    );
  }

  setInfo(userId: string, key: string, value: string): Promise<UserInfoEntry> {
    return this.client.request(`/identity/users/${encodeURIComponent(userId)}/info`, {
      method: "POST",
      body: { key, value },
    });
  }

  updateInfo(userId: string, key: string, value: string): Promise<UserInfoEntry> {
    return this.client.request(
      `/identity/users/${encodeURIComponent(userId)}/info/${encodeURIComponent(key)}`,
      { method: "PUT", body: { value } },
    );
  }

  deleteInfo(userId: string, key: string): Promise<void> {
    return this.client.request(
      `/identity/users/${encodeURIComponent(userId)}/info/${encodeURIComponent(key)}`,
      { method: "DELETE" },
    );
  }

  /**
   * Sets a user's password.
   *
   * On the *process* API's identity resource, like the picture and info endpoints —
   * which is what makes self-service password change available from every app, not
   * only the one that happens to hold an IDM client. Verified against a running
   * engine: the change takes effect immediately for the next sign-in.
   */
  changePassword(userId: string, password: string): Promise<unknown> {
    return this.client.request(`/identity/users/${encodeURIComponent(userId)}`, {
      method: "PUT",
      body: { password },
    });
  }

  /** 404 when the user has no picture, which is the common case, not an error. */
  pictureUrl(userId: string): string {
    return this.client.buildUrl(`/identity/users/${encodeURIComponent(userId)}/picture`);
  }

  uploadPicture(userId: string, file: File): Promise<void> {
    const form = new FormData();
    form.append("file", file, file.name);
    return this.client.request(`/identity/users/${encodeURIComponent(userId)}/picture`, {
      method: "PUT",
      query: { mimeType: file.type || "image/png" },
      body: form,
    });
  }
}

/**
 * Everything this deployment's identity store holds about one person
 * (REQUIREMENTS.md §13.7 "Data subject requests").
 *
 * Deliberately not called an "erasure" or a complete record: it covers the identity
 * store only. Task history, process variables and attachments can also carry personal
 * data and live in the engine's own tables, which is exactly the distinction §13.7
 * draws — "'delete a user' and 'erase a data subject's personal data' are not
 * automatically the same operation once task history/variables are involved". The
 * export says so in `scope` rather than letting a reader assume otherwise.
 */
export interface UserDataExport {
  exportedAt: string;
  scope: string;
  user: IdmUser;
  groups: IdmGroup[];
  privileges: string[];
  customInfo: UserInfoEntry[];
}

const EXPORT_SCOPE =
  "Identity store only. Personal data may also exist in task history, process and case " +
  "variables, comments and attachments held by the engine; those are not covered here.";

/**
 * Collects a user's identity data across the endpoints that hold it. Failures on the
 * optional parts degrade rather than abort: an export missing custom info is more use
 * to whoever asked for it than no export at all, and the gap is visible as an empty
 * array in the result.
 */
export async function exportUserData(
  idm: IdmApi,
  profile: UserProfileApi,
  userId: string,
  signal?: AbortSignal,
): Promise<UserDataExport> {
  const [user, groups, privileges, customInfo] = await Promise.all([
    idm.getUser(userId, signal),
    idm.listUserGroups(userId, signal).then(
      (page) => page.data,
      () => [] as IdmGroup[],
    ),
    idm.listPrivileges({ userId, size: 200 }, signal).then(
      (page) => page.data.map((privilege) => privilege.name),
      () => [] as string[],
    ),
    profile.listInfo(userId, signal).then(
      (entries) => entries,
      () => [] as UserInfoEntry[],
    ),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    scope: EXPORT_SCOPE,
    // The password field is write-only and never returned, but strip it defensively
    // rather than trusting that: this file is handed to a person.
    user: { ...user, password: undefined },
    groups,
    privileges,
    customInfo,
  };
}
