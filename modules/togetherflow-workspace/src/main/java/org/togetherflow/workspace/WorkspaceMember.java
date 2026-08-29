package org.togetherflow.workspace;

import java.util.Locale;

/**
 * A role granted to a user or a group.
 *
 * <p>Groups matter more than they look: an identity store backed by LDAP (REQUIREMENTS
 * §7.3) has groups it will not let anyone edit, and per-user membership would mean
 * re-granting by hand every time the directory changes.
 */
public record WorkspaceMember(String workspaceId, PrincipalType principalType, String principalId,
        WorkspaceRole role) {

    public enum PrincipalType {
        USER,
        GROUP;

        public static PrincipalType parse(String value) {
            if (value == null || value.isBlank()) {
                return USER;
            }
            return PrincipalType.valueOf(value.trim().toUpperCase(Locale.ROOT));
        }
    }
}
