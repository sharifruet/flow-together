package org.togetherflow.workspace;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;

/**
 * The authorization rule (ADR 0017).
 *
 * <p>Stated as facts and answers rather than through a web context, which is the whole
 * reason {@link WorkspaceAccess} has no Spring in it.
 */
class WorkspaceAccessTest {

    private static Workspace workspace(WorkspaceVisibility visibility, String tenantId) {
        return new Workspace("ws-1", "eng", "Engineering", null, tenantId, visibility, null,
                "ada", Instant.now());
    }

    private static WorkspaceMember user(String id, WorkspaceRole role) {
        return new WorkspaceMember("ws-1", WorkspaceMember.PrincipalType.USER, id, role);
    }

    private static WorkspaceMember group(String id, WorkspaceRole role) {
        return new WorkspaceMember("ws-1", WorkspaceMember.PrincipalType.GROUP, id, role);
    }

    @Test
    void a_private_workspace_is_invisible_to_a_non_member() {
        // Invisible, not read-only: the difference is what lets a private workspace stay
        // private rather than merely uneditable.
        assertThat(WorkspaceAccess.effectiveRole(workspace(WorkspaceVisibility.PRIVATE, null),
                new Caller("bob", Set.of(), null), List.of())).isEmpty();
    }

    @Test
    void a_public_workspace_reads_to_everyone_in_the_tenant() {
        assertThat(WorkspaceAccess.effectiveRole(workspace(WorkspaceVisibility.PUBLIC, null),
                new Caller("bob", Set.of(), null), List.of())).contains(WorkspaceRole.READER);
    }

    @Test
    void an_explicit_member_outranks_public_visibility() {
        assertThat(WorkspaceAccess.effectiveRole(workspace(WorkspaceVisibility.PUBLIC, null),
                new Caller("ada", Set.of(), null), List.of(user("ada", WorkspaceRole.OWNER))))
                .contains(WorkspaceRole.OWNER);
    }

    @Test
    void a_group_membership_grants_the_role() {
        assertThat(WorkspaceAccess.effectiveRole(workspace(WorkspaceVisibility.PRIVATE, null),
                new Caller("bob", Set.of("modellers"), null),
                List.of(group("modellers", WorkspaceRole.MODELER)))).contains(WorkspaceRole.MODELER);
    }

    @Test
    void the_highest_of_several_roles_wins() {
        // Someone can be a reader by group and a modeler by name; the answer is modeler.
        assertThat(WorkspaceAccess.effectiveRole(workspace(WorkspaceVisibility.PRIVATE, null),
                new Caller("ada", Set.of("everyone"), null),
                List.of(group("everyone", WorkspaceRole.READER), user("ada", WorkspaceRole.MODELER))))
                .contains(WorkspaceRole.MODELER);
    }

    @Test
    void membership_does_not_reach_across_tenants() {
        // A membership row that outlived a tenant move must not grant access in the
        // tenant the workspace has since left.
        assertThat(WorkspaceAccess.effectiveRole(workspace(WorkspaceVisibility.PUBLIC, "acme"),
                new Caller("ada", Set.of(), "other"), List.of(user("ada", WorkspaceRole.OWNER))))
                .isEmpty();
    }

    @Test
    void a_missing_tenant_and_a_blank_one_are_the_same_tenant() {
        assertThat(WorkspaceAccess.effectiveRole(workspace(WorkspaceVisibility.PUBLIC, null),
                new Caller("ada", Set.of(), "  "), List.of())).contains(WorkspaceRole.READER);
    }

    @Test
    void roles_are_additive_and_capability_shaped() {
        assertThat(WorkspaceRole.READER.can(Capability.VIEW)).isTrue();
        assertThat(WorkspaceRole.READER.can(Capability.DELETE)).isFalse();
        assertThat(WorkspaceRole.MODELER.can(Capability.PUBLISH)).isTrue();
        assertThat(WorkspaceRole.MODELER.can(Capability.MANAGE_MEMBERS)).isFalse();
        assertThat(WorkspaceRole.OWNER.atLeast(WorkspaceRole.MODELER)).isTrue();
        assertThat(WorkspaceRole.MODELER.atLeast(WorkspaceRole.OWNER)).isFalse();
    }

    @Test
    void a_reader_cannot_delete_which_is_the_whole_point() {
        Workspace ws = workspace(WorkspaceVisibility.PRIVATE, null);
        Caller reader = new Caller("bob", Set.of(), null);
        List<WorkspaceMember> members = List.of(user("bob", WorkspaceRole.READER));

        assertThat(WorkspaceAccess.can(ws, reader, members, Capability.VIEW)).isTrue();
        assertThat(WorkspaceAccess.can(ws, reader, members, Capability.EDIT)).isFalse();
        assertThat(WorkspaceAccess.can(ws, reader, members, Capability.DELETE)).isFalse();
    }
}
