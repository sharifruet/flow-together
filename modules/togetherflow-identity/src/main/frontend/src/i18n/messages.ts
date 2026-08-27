/**
 * TogetherFlow Identity's message catalogue (REQUIREMENTS.md §8).
 * Merged over `commonMessages`, so only Identity's own copy lives here.
 */

import type { Catalogues, Messages } from "@togetherflow/common";

export const identityEn = {
  "app.starting": "Signing you in…",

  "nav.label": "Identity sections",
  "nav.users": "Users",
  "nav.groups": "Groups",
  "nav.privileges": "Privileges",

  "readOnly.banner":
    "Identities are provided by a directory and are read-only here. Create, edit and delete are disabled.",
  "action.failed": "That action could not be completed.",
  "action.saveChanges": "Save changes",

  // Users (§7.3)
  "users.label": "Users",
  "users.title": "Users",
  "users.countLabel.one": "{count} user",
  "users.countLabel.other": "{count} users",
  "users.meta": "People who can sign in and be assigned work.",
  "users.meta.readOnly": "Users come from a directory and can't be changed here.",
  "users.new": "New user",
  "users.search": "Search by user id…",
  "users.searchLabel": "Search users by id",
  "users.profile.action": "Profile",
  "users.column.user": "User",
  "users.column.email": "Email",
  "users.caption": "Users",
  "users.empty.title": "No users yet",
  "users.empty.description": "Create the first user to get started.",
  "users.empty.description.readOnly": "No users were returned by the directory.",
  "users.create.title": "New user",
  "users.create.submit": "Create user",
  "users.created": "User \"{id}\" created.",
  "users.edit.title": "Edit {name}",
  "users.updated": "User \"{id}\" updated.",
  "users.delete.title": "Delete this user?",
  "users.delete.description":
    "\"{name}\" ({id}) will be removed. They will no longer be able to sign in, and any work assigned to them stays assigned to a user that no longer exists. This can't be undone.\n\nThis is not an erasure: task history, variables, comments and attachments created by this person stay in the engine. If you are answering a data subject erasure request, export their data first and handle the engine's own records separately.",
  "users.export.action": "Export data",
  "users.export.done": "Exported the identity data held for \"{id}\".",
  "users.export.failed": "Could not export that user's data.",
  "users.delete.confirm": "Delete user",
  "users.deleted": "User \"{id}\" deleted.",
  "users.field.id": "User id",
  "users.field.id.hintNew": "Used to sign in and to assign work.",
  "users.field.id.hintEdit": "A user's id can't be changed.",
  "users.field.firstName": "First name",
  "users.field.lastName": "Last name",
  "users.field.email": "Email",
  "users.field.password": "Password",
  "users.field.newPassword": "New password",
  "users.field.password.hintEdit": "Leave blank to keep the current password.",
  "users.error.idRequired": "A user id is required.",
  "users.error.email": "Enter a valid email address.",
  "users.error.password": "Set an initial password.",

  // Profile (§7.3)
  "profile.label": "Profile for {id}",
  "profile.picture.alt": "Profile picture for {id}",
  "profile.picture.none": "No picture uploaded.",
  "profile.picture.upload": "Upload a picture",
  "profile.picture.updated": "Picture updated.",
  "profile.info.title": "Custom info",
  "profile.info.none": "No custom info recorded for this user.",
  "profile.info.key": "Key",
  "profile.info.value": "Value",
  "profile.info.saved": "Saved \"{key}\".",
  "profile.info.removed": "Removed \"{key}\".",
  "profile.info.delete.title": "Remove this entry?",
  "profile.info.delete.description": "\"{key}\" will be removed from {id}'s profile.",
  "profile.info.delete.confirm": "Remove",
  "profile.failed": "That didn't work.",

  // Groups (§7.3)
  "groups.label": "Groups",
  "groups.title": "Groups",
  "groups.meta": "Groups collect users so work and privileges can be assigned in bulk.",
  "groups.meta.readOnly": "Groups come from a directory and can't be changed here.",
  "groups.new": "New group",
  "groups.search": "Search groups…",
  "groups.searchLabel": "Search groups by name",
  "groups.members.action": "Members",
  "groups.column.group": "Group",
  "groups.column.type": "Type",
  "groups.caption": "Groups",
  "groups.empty.title": "No groups yet",
  "groups.empty.description":
    "Create a group to assign work to a team rather than an individual.",
  "groups.empty.description.readOnly": "No groups were returned by the directory.",
  "groups.create.title": "New group",
  "groups.create.submit": "Create group",
  "groups.created": "Group \"{id}\" created.",
  "groups.edit.title": "Edit {name}",
  "groups.updated": "Group \"{id}\" updated.",
  "groups.delete.title": "Delete this group?",
  "groups.delete.confirm": "Delete group",
  "groups.members.column": "Member",
  "groups.members.add": "Add a member",
  "groups.delete.description":
    "\"{name}\" will be removed. Anyone relying on it for task assignment or privileges loses that access. This can't be undone.",
  "groups.field.id": "Group id",
  "groups.field.id.hintNew": "Referenced by process models.",
  "groups.field.id.hintEdit": "A group's id can't be changed.",
  "groups.field.name": "Name",
  "groups.field.type": "Type",
  "groups.field.type.hint": "Free-form, e.g. 'assignment' or 'security-role'.",
  "groups.error.idRequired": "A group id is required.",
  "groups.members.addPlaceholder": "User id",
  "groups.members.empty.title": "No members",
  "groups.members.empty.description":
    "Add a user by id to make them a member of this group.",
  "groups.members.empty.description.readOnly":
    "This group has no members in the directory.",
  "groups.members.caption": "Members of {id}",
  "groups.members.remove.title": "Remove this member?",
  "groups.members.remove.description":
    "\"{name}\" will no longer be a member of \"{group}\", and loses any access that membership granted.",
  "groups.members.remove.confirm": "Remove member",
  "groups.members.removed": "\"{id}\" removed from {group}.",

  // Privileges (§7.3)
  "privileges.label": "Privileges",
  "privileges.title": "Privileges",
  "privileges.meta":
    "What users and groups are allowed to do. Privileges are defined by the deployment; grant and revoke them here.",
  "privileges.empty.title": "No privileges defined",
  "privileges.empty.description":
    "This deployment defines no privileges, so there is nothing to grant.",
  "privileges.detail.label": "Privilege detail",
  "privileges.back": "← Back to all privileges",
  "privileges.grantToUser": "Grant to user",
  "privileges.grantToGroup": "Grant to group",
  "privileges.userIdPlaceholder": "User id",
  "privileges.groupIdPlaceholder": "Group id",
  "privileges.granted": "Granted to \"{id}\".",
  "privileges.noUsers": "No users have this privilege.",
  "privileges.noGroups": "No groups have this privilege.",
  "privileges.revokeFrom": "Revoke from {id}",
  "privileges.revoke.title": "Revoke this privilege?",
  "privileges.revoke.description.user":
    "\"{label}\" (user) will lose this privilege immediately, along with whatever access it grants.",
  "privileges.revoke.description.group":
    "\"{label}\" (group) will lose this privilege immediately, along with whatever access it grants.",
  "privileges.revoke.confirm": "Revoke",
  "privileges.revoked": "Revoked from \"{label}\".",
} satisfies Messages;

export const identityMessages: Catalogues = { en: identityEn };
