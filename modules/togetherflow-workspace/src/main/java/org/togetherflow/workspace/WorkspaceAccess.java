package org.togetherflow.workspace;

import java.util.Collection;
import java.util.Objects;
import java.util.Optional;

/**
 * The authorization decision, as a pure function (ADR 0017).
 *
 * <p>Deliberately free of Spring, JDBC and HTTP so the rule that decides whether someone
 * may delete a model can be tested by stating the facts and reading the answer, rather
 * than by standing up a web context. Everything that enforces calls through here; nothing
 * re-implements it.
 */
public final class WorkspaceAccess {

    private WorkspaceAccess() {
    }

    /**
     * The role this caller effectively holds, highest wins.
     *
     * <p>Empty means no access at all — which is different from {@code READER}, and the
     * difference is what lets a private workspace be invisible rather than merely
     * read-only.
     */
    public static Optional<WorkspaceRole> effectiveRole(Workspace workspace, Caller caller,
            Collection<WorkspaceMember> members) {

        if (workspace == null || caller == null) {
            return Optional.empty();
        }
        /*
         * Tenancy is checked before membership, not after, so a membership row that
         * outlived a tenant move cannot grant access in the tenant the workspace has
         * since left.
         *
         * This scopes; it does not authenticate. The caller's tenant arrives the same way
         * the engine's own does — from the request — so it is exactly as trustworthy as
         * Flowable's own tenant handling and no more. The boundary that matters is the
         * role check below it.
         */
        if (!sameTenant(workspace.tenantId(), caller.tenantId())) {
            return Optional.empty();
        }

        WorkspaceRole best = null;
        for (WorkspaceMember member : members) {
            if (!Objects.equals(member.workspaceId(), workspace.id()) || !matches(member, caller)) {
                continue;
            }
            if (best == null || member.role().atLeast(best)) {
                best = member.role();
            }
        }
        if (best != null) {
            return Optional.of(best);
        }
        // A public workspace reads to everyone in the tenant; explicit members hold more.
        return workspace.visibility() == WorkspaceVisibility.PUBLIC
                ? Optional.of(WorkspaceRole.READER)
                : Optional.empty();
    }

    public static boolean can(Workspace workspace, Caller caller, Collection<WorkspaceMember> members,
            Capability capability) {
        return effectiveRole(workspace, caller, members)
                .filter(role -> role.can(capability))
                .isPresent();
    }

    private static boolean matches(WorkspaceMember member, Caller caller) {
        return switch (member.principalType()) {
            case USER -> Objects.equals(member.principalId(), caller.userId());
            case GROUP -> caller.isIn(member.principalId());
        };
    }

    /** Null and empty both mean "no tenant", and must not be treated as different ones. */
    private static boolean sameTenant(String left, String right) {
        return Objects.equals(blankToNull(left), blankToNull(right));
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}
