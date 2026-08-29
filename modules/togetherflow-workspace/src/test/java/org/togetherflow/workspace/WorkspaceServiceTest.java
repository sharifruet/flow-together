package org.togetherflow.workspace;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Set;

import javax.sql.DataSource;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseBuilder;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseType;

/** The workspace rules, against a real database rather than a mocked store. */
class WorkspaceServiceTest {

    private WorkspaceService service;
    private WorkspaceStore store;
    private WorkspaceProperties properties;

    private final Caller ada = new Caller("ada", Set.of(), null);
    private final Caller bob = new Caller("bob", Set.of(), null);

    @BeforeEach
    void setUp() {
        DataSource dataSource = new EmbeddedDatabaseBuilder()
                .setType(EmbeddedDatabaseType.H2)
                .setName("workspace-" + System.nanoTime())
                .build();
        properties = new WorkspaceProperties();
        store = new JdbcWorkspaceStore(dataSource, "TF_");
        service = new WorkspaceService(store, properties);
    }

    @Test
    void creating_a_workspace_makes_the_creator_its_owner() {
        // Otherwise it is unadministerable from the moment it exists.
        var created = service.create(ada, "eng", "Engineering", null, WorkspaceVisibility.PRIVATE);

        assertThat(created.role()).isEqualTo(WorkspaceRole.OWNER);
        assertThat(service.roleIn(created.workspace().id(), ada)).contains(WorkspaceRole.OWNER);
    }

    @Test
    void keys_are_unique_within_a_tenant() {
        service.create(ada, "eng", "Engineering", null, WorkspaceVisibility.PRIVATE);
        assertThatThrownBy(() -> service.create(ada, "eng", "Engineering again", null, null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("already exists");
    }

    @Test
    void a_non_member_sees_nothing_and_can_do_nothing() {
        var created = service.create(ada, "eng", "Engineering", null, WorkspaceVisibility.PRIVATE);

        assertThat(service.visibleTo(bob)).isEmpty();
        assertThatThrownBy(() -> service.require(created.workspace().id(), bob, Capability.VIEW))
                .isInstanceOf(WorkspaceService.AccessDenied.class);
    }

    @Test
    void a_reader_is_refused_an_edit_with_a_message_naming_their_role() {
        var created = service.create(ada, "eng", "Engineering", null, WorkspaceVisibility.PRIVATE);
        service.addMember(created.workspace().id(), ada, new WorkspaceMember(created.workspace().id(),
                WorkspaceMember.PrincipalType.USER, "bob", WorkspaceRole.READER));

        assertThatThrownBy(() -> service.require(created.workspace().id(), bob, Capability.EDIT))
                .isInstanceOf(WorkspaceService.AccessDenied.class)
                .hasMessageContaining("reader");
    }

    @Test
    void the_last_owner_cannot_be_removed() {
        // A workspace with no owner can never be renamed, re-membered or deleted, and
        // nothing in the UI would explain why.
        var created = service.create(ada, "eng", "Engineering", null, WorkspaceVisibility.PRIVATE);

        assertThatThrownBy(() -> service.removeMember(created.workspace().id(), ada,
                WorkspaceMember.PrincipalType.USER, "ada"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("only owner");
    }

    @Test
    void a_second_owner_makes_the_first_removable() {
        var created = service.create(ada, "eng", "Engineering", null, WorkspaceVisibility.PRIVATE);
        String id = created.workspace().id();
        service.addMember(id, ada, new WorkspaceMember(id, WorkspaceMember.PrincipalType.USER, "bob",
                WorkspaceRole.OWNER));

        service.removeMember(id, ada, WorkspaceMember.PrincipalType.USER, "ada");

        assertThat(service.roleIn(id, ada)).isEmpty();
        assertThat(service.roleIn(id, bob)).contains(WorkspaceRole.OWNER);
    }

    @Test
    void sharing_is_refused_from_a_workspace_that_already_shares() {
        // One level deep, matching Flowable Design: a chain makes provenance a traversal
        // and a cycle makes it a hang.
        var a = service.create(ada, "a", "A", null, WorkspaceVisibility.PRIVATE).workspace();
        var b = service.create(ada, "b", "B", null, WorkspaceVisibility.PRIVATE).workspace();
        var c = service.create(ada, "c", "C", null, WorkspaceVisibility.PRIVATE).workspace();

        service.share(b.id(), ada, c.id());

        assertThatThrownBy(() -> service.share(a.id(), ada, b.id()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("already shares");
    }

    @Test
    void a_workspace_cannot_share_from_itself() {
        var a = service.create(ada, "a", "A", null, WorkspaceVisibility.PRIVATE).workspace();
        assertThatThrownBy(() -> service.share(a.id(), ada, a.id()))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void moving_a_model_needs_the_right_in_the_workspace_it_leaves() {
        // Otherwise a modeler in B could quietly take A's model.
        var a = service.create(ada, "a", "A", null, WorkspaceVisibility.PRIVATE).workspace();
        var b = service.create(bob, "b", "B", null, WorkspaceVisibility.PRIVATE).workspace();
        service.assignModel("model-1", a.id(), ada);

        assertThatThrownBy(() -> service.assignModel("model-1", b.id(), bob))
                .isInstanceOf(WorkspaceService.AccessDenied.class);
    }

    @Test
    void model_permission_is_resolved_through_its_workspace() {
        var created = service.create(ada, "eng", "Engineering", null, WorkspaceVisibility.PRIVATE);
        String id = created.workspace().id();
        service.assignModel("model-1", id, ada);
        service.addMember(id, ada, new WorkspaceMember(id, WorkspaceMember.PrincipalType.USER, "bob",
                WorkspaceRole.READER));

        assertThat(service.mayTouchModel("model-1", ada, Capability.DELETE)).isTrue();
        assertThat(service.mayTouchModel("model-1", bob, Capability.VIEW)).isTrue();
        assertThat(service.mayTouchModel("model-1", bob, Capability.DELETE)).isFalse();
    }

    @Test
    void an_unassigned_model_stays_visible_by_default() {
        /*
         * Every model predating this module is unassigned. Failing closed would make an
         * entire existing library vanish on upgrade — an outage dressed as a security
         * improvement.
         */
        assertThat(service.mayTouchModel("legacy", bob, Capability.VIEW)).isTrue();

        properties.setUnassignedModelsVisible(false);
        assertThat(service.mayTouchModel("legacy", bob, Capability.VIEW)).isFalse();
    }

    @Test
    void deleting_a_workspace_leaves_the_models_alone() {
        var created = service.create(ada, "eng", "Engineering", null, WorkspaceVisibility.PRIVATE);
        service.assignModel("model-1", created.workspace().id(), ada);

        service.delete(created.workspace().id(), ada);

        assertThat(store.findWorkspace(created.workspace().id())).isEmpty();
        // The assignment goes; the model itself lives in the engine and is untouched.
        assertThat(store.workspaceIdForModel("model-1")).isEmpty();
    }

    @Test
    void visible_workspaces_carry_the_role_the_asker_holds() {
        var mine = service.create(ada, "mine", "Mine", null, WorkspaceVisibility.PRIVATE).workspace();
        var open = service.create(bob, "open", "Open", null, WorkspaceVisibility.PUBLIC).workspace();

        List<WorkspaceService.WorkspaceView> visible = service.visibleTo(ada);

        assertThat(visible).hasSize(2);
        assertThat(visible.stream().filter(v -> v.workspace().id().equals(mine.id())).findFirst())
                .get().extracting(WorkspaceService.WorkspaceView::role).isEqualTo(WorkspaceRole.OWNER);
        assertThat(visible.stream().filter(v -> v.workspace().id().equals(open.id())).findFirst())
                .get().extracting(WorkspaceService.WorkspaceView::role).isEqualTo(WorkspaceRole.READER);
    }
}
