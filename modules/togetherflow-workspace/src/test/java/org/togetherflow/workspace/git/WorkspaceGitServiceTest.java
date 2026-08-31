package org.togetherflow.workspace.git;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import javax.sql.DataSource;

import jakarta.servlet.http.HttpServletRequest;

import org.eclipse.jgit.api.Git;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseBuilder;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseType;

import org.togetherflow.workspace.Caller;
import org.togetherflow.workspace.JdbcWorkspaceStore;
import org.togetherflow.workspace.WorkspaceMember;
import org.togetherflow.workspace.WorkspaceProperties;
import org.togetherflow.workspace.WorkspaceRole;
import org.togetherflow.workspace.WorkspaceService;
import org.togetherflow.workspace.WorkspaceVisibility;

/**
 * Git connectivity end to end (ADR 0018), against a real repository.
 *
 * <p>The remote is a bare repository on disk reached over {@code file://}. That is a real
 * remote as far as JGit is concerned — clone, commit, push, fetch and merge all behave as
 * they would against a hosted one — so this exercises the actual machinery rather than a
 * mock of it, with no network and no hosted service.
 */
class WorkspaceGitServiceTest {

    @TempDir
    Path temp;

    private WorkspaceService workspaces;
    private WorkspaceGitService git;
    private GitProperties properties;
    private FakeModels models;
    private String workspaceId;
    private Path remote;

    private final Caller ada = new Caller("ada", Set.of(), null);
    private final Caller bob = new Caller("bob", Set.of(), null);
    private final HttpServletRequest request = null;

    /** Stands in for the model repository, so no engine is needed. */
    private static final class FakeModels implements WorkspaceModels {
        private final List<ExportedModel> models = new ArrayList<>();
        private ImportSummary lastImport;

        @Override
        public List<ExportedModel> export(String workspaceId, HttpServletRequest request) {
            return List.copyOf(models);
        }

        @Override
        public ImportSummary apply(String workspaceId, List<ExportedModel> pulled,
                HttpServletRequest request) {
            List<String> created = new ArrayList<>();
            List<String> updated = new ArrayList<>();
            for (ExportedModel model : pulled) {
                int index = indexOf(model.key());
                if (index < 0) {
                    models.add(model);
                    created.add(model.key());
                } else {
                    models.set(index, model);
                    updated.add(model.key());
                }
            }
            lastImport = new ImportSummary(created, updated, List.of());
            return lastImport;
        }

        private int indexOf(String key) {
            for (int i = 0; i < models.size(); i++) {
                if (models.get(i).key().equals(key)) {
                    return i;
                }
            }
            return -1;
        }
    }

    @BeforeEach
    void setUp() throws Exception {
        DataSource dataSource = new EmbeddedDatabaseBuilder()
                .setType(EmbeddedDatabaseType.H2)
                .setName("git-" + System.nanoTime())
                .build();
        var store = new JdbcWorkspaceStore(dataSource, "TF_");
        workspaces = new WorkspaceService(store, new WorkspaceProperties());
        models = new FakeModels();

        properties = new GitProperties();
        properties.setEnabled(true);
        properties.setWorkDir(temp.resolve("checkouts").toString());
        git = new WorkspaceGitService(workspaces, new GitConnectionStore(dataSource, "TF_"), models,
                properties);

        workspaceId = workspaces.create(ada, "eng", "Engineering", null, WorkspaceVisibility.PRIVATE)
                .workspace().id();

        remote = temp.resolve("remote.git");
        try (Git bare = Git.init().setBare(true).setInitialBranch("main")
                .setDirectory(remote.toFile()).call()) {
            assertThat(bare.getRepository().getObjectDatabase()).isNotNull();
        }
        seedRemote();
    }

    /**
     * Gives the bare remote a first commit on `main`.
     *
     * <p>Built by initialising a working copy and pushing, rather than by cloning the
     * empty remote: a clone of a repository with no commits has no branch to check out,
     * and the push that followed would leave the remote's HEAD pointing at a branch that
     * does not exist.
     */
    private void seedRemote() throws Exception {
        Path seed = temp.resolve("seed");
        try (Git local = Git.init().setInitialBranch("main").setDirectory(seed.toFile()).call()) {
            Files.writeString(seed.resolve("README.md"), "# Models\n");
            local.add().addFilepattern(".").call();
            local.commit().setMessage("Initial commit").setAuthor("seed", "seed@localhost").call();
            local.remoteAdd().setName("origin")
                    .setUri(new org.eclipse.jgit.transport.URIish(remote.toUri().toString())).call();
            local.push().setRemote("origin").add("main").call();
        }
    }

    private String remoteUrl() {
        return remote.toUri().toString();
    }

    private void connect() {
        git.connect(workspaceId, ada, remoteUrl(), "main", "");
    }

    private void addModel(String key, String source) {
        models.models.add(new ExportedModel("id-" + key, key, key, "togetherflow:bpmn", source));
    }

    @Test
    void connecting_clones_the_repository_and_remembers_the_link() {
        connect();

        GitStatus status = git.status(workspaceId, ada, request);
        assertThat(status.connected()).isTrue();
        assertThat(status.branch()).isEqualTo("main");
        assertThat(status.remoteUrl()).isEqualTo(remoteUrl());
        assertThat(status.lastCommitMessage()).isEqualTo("Initial commit");
    }

    @Test
    void connecting_brings_in_what_the_repository_already_holds() throws Exception {
        /*
         * Without this, a workspace connected to a repository full of models it does not
         * have would report every one of them as a pending *deletion* — and the obvious
         * next click would erase the repository.
         */
        pushFromElsewhere("payments", "<definitions id=\"payments\"/>");

        WorkspaceModels.ImportSummary summary =
                git.connectAndImport(workspaceId, ada, remoteUrl(), "main", "", request);

        assertThat(summary.created()).containsExactly("payments");
        assertThat(git.status(workspaceId, ada, request).changes()).isEmpty();
    }

    @Test
    void a_modeler_cannot_connect_a_repository() {
        // Connecting decides where a workspace's work is published; that is an owner's
        // call, and the service refuses regardless of what the UI offers.
        workspaces.addMember(workspaceId, ada, new WorkspaceMember(workspaceId,
                WorkspaceMember.PrincipalType.USER, "bob", WorkspaceRole.MODELER));

        assertThatThrownBy(() -> git.connect(workspaceId, bob, remoteUrl(), "main", ""))
                .isInstanceOf(WorkspaceService.AccessDenied.class);
    }

    @Test
    void a_reader_cannot_commit() {
        connect();
        workspaces.addMember(workspaceId, ada, new WorkspaceMember(workspaceId,
                WorkspaceMember.PrincipalType.USER, "bob", WorkspaceRole.READER));
        addModel("invoice", "<definitions/>");

        assertThatThrownBy(() -> git.commit(workspaceId, bob, "nope", request))
                .isInstanceOf(WorkspaceService.AccessDenied.class);
    }

    @Test
    void a_models_change_shows_up_as_a_pending_change_named_after_the_model() {
        connect();
        addModel("invoice-approval", "<definitions id=\"a\"/>");

        GitStatus status = git.status(workspaceId, ada, request);

        assertThat(status.changes()).anySatisfy(change -> {
            assertThat(change.modelKey()).isEqualTo("invoice-approval");
            assertThat(change.kind()).isEqualTo(GitChange.Kind.ADDED);
        });
    }

    @Test
    void committing_writes_files_named_by_key_and_pushes_them() throws Exception {
        connect();
        addModel("invoice-approval", "<definitions id=\"a\"/>");

        String commitId = git.commit(workspaceId, ada, "Add invoice approval", request);
        git.push(workspaceId, ada);

        assertThat(commitId).isNotBlank();
        // Read back from the *remote*, which is the only proof the push happened.
        Path verify = temp.resolve("verify");
        try (Git clone = Git.cloneRepository().setURI(remoteUrl()).setDirectory(verify.toFile()).call()) {
            assertThat(clone.getRepository()).isNotNull();
        }
        assertThat(verify.resolve("invoice-approval.bpmn20.xml")).exists();
        assertThat(Files.readString(verify.resolve("invoice-approval.bpmn20.xml")))
                .isEqualTo("<definitions id=\"a\"/>");
        // The manifest is what lets a pull know which model a file is.
        assertThat(Files.readString(verify.resolve(ModelFiles.MANIFEST))).contains("invoice-approval");
    }

    @Test
    void the_commit_is_authored_by_the_person_not_the_service() throws Exception {
        // A repository whose every commit is authored by "TogetherFlow" cannot be
        // reviewed by author, which is most of what review by history is for.
        connect();
        addModel("invoice", "<definitions/>");
        git.commit(workspaceId, ada, "Add invoice", request);

        try (Git checkout = Git.open(Path.of(properties.getWorkDir(), workspaceId).toFile())) {
            var head = checkout.log().setMaxCount(1).call().iterator().next();
            assertThat(head.getAuthorIdent().getName()).isEqualTo("ada");
        }
    }

    @Test
    void committing_nothing_is_refused_rather_than_making_an_empty_commit() {
        connect();
        addModel("invoice", "<definitions/>");
        git.commit(workspaceId, ada, "Add invoice", request);

        assertThatThrownBy(() -> git.commit(workspaceId, ada, "again", request))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("nothing to commit");
    }

    @Test
    void a_model_deleted_in_design_is_deleted_from_the_repository() throws Exception {
        connect();
        addModel("invoice", "<definitions/>");
        addModel("onboarding", "<definitions/>");
        git.commit(workspaceId, ada, "Two models", request);

        models.models.removeIf(model -> model.key().equals("onboarding"));
        git.commit(workspaceId, ada, "Drop onboarding", request);

        // Left behind, the next pull would resurrect it.
        assertThat(Path.of(properties.getWorkDir(), workspaceId, "onboarding.bpmn20.xml"))
                .doesNotExist();
    }

    @Test
    void pulling_brings_a_teammates_model_into_the_workspace() throws Exception {
        connect();
        pushFromElsewhere("payments", "<definitions id=\"payments\"/>");

        WorkspaceModels.ImportSummary summary = git.pull(workspaceId, ada, request);

        assertThat(summary.created()).contains("payments");
        assertThat(models.models).anySatisfy(model -> {
            assertThat(model.key()).isEqualTo("payments");
            assertThat(model.source()).isEqualTo("<definitions id=\"payments\"/>");
        });
    }

    @Test
    void pulling_refuses_while_there_are_uncommitted_changes() {
        // A merge on top of unsaved work is how someone loses an afternoon.
        connect();
        addModel("invoice", "<definitions/>");

        assertThatThrownBy(() -> git.pull(workspaceId, ada, request))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("not committed");
    }

    @Test
    void reverting_discards_local_changes() {
        connect();
        addModel("invoice", "<definitions/>");
        git.commit(workspaceId, ada, "Add invoice", request);

        models.models.clear();
        addModel("invoice", "<definitions id=\"edited\"/>");
        assertThat(git.status(workspaceId, ada, request).changes()).isNotEmpty();

        git.revert(workspaceId, ada);
        // The checkout is clean again; the model in Design is untouched, which is the
        // point — revert restores the repository, not the editor.
        try (Git checkout = Git.open(Path.of(properties.getWorkDir(), workspaceId).toFile())) {
            assertThat(checkout.status().call().isClean()).isTrue();
        } catch (Exception cause) {
            throw new AssertionError(cause);
        }
    }

    @Test
    void a_branch_can_be_created_and_becomes_the_workspaces_branch() {
        connect();

        git.createBranch(workspaceId, ada, "feature/approval");

        GitStatus status = git.status(workspaceId, ada, request);
        assertThat(status.branch()).isEqualTo("feature/approval");
        assertThat(status.branches()).contains("feature/approval");
    }

    @Test
    void switching_back_to_main_works() {
        connect();
        git.createBranch(workspaceId, ada, "feature/approval");

        git.switchBranch(workspaceId, ada, "main");

        assertThat(git.status(workspaceId, ada, request).branch()).isEqualTo("main");
    }

    @Test
    void the_diff_shows_what_changed_in_one_model() {
        connect();
        addModel("invoice", "<definitions id=\"a\"/>");
        git.commit(workspaceId, ada, "Add invoice", request);

        models.models.clear();
        addModel("invoice", "<definitions id=\"b\"/>");

        String diff = git.diff(workspaceId, ada, "invoice", request);

        assertThat(diff).contains("-<definitions id=\"a\"/>");
        assertThat(diff).contains("+<definitions id=\"b\"/>");
    }

    @Test
    void disconnecting_forgets_the_repository_and_removes_the_checkout() {
        connect();
        git.disconnect(workspaceId, ada);

        assertThat(git.status(workspaceId, ada, request).connected()).isFalse();
        assertThat(Path.of(properties.getWorkDir(), workspaceId)).doesNotExist();
    }

    @Test
    void every_operation_is_refused_where_the_deployment_has_not_enabled_git() {
        properties.setEnabled(false);

        assertThatThrownBy(() -> git.connect(workspaceId, ada, remoteUrl(), "main", ""))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("not enabled");
        // Status stays answerable, and answers "not connected" — the panel needs a shape
        // to render even where the feature is off.
        assertThat(git.status(workspaceId, ada, request).connected()).isFalse();
    }

    /** Commits a model straight to the remote, as a teammate on another machine would. */
    private void pushFromElsewhere(String key, String source) throws Exception {
        Path other = temp.resolve("other-" + key);
        try (Git clone = Git.cloneRepository().setURI(remoteUrl()).setDirectory(other.toFile()).call()) {
            Files.writeString(other.resolve(key + ".bpmn20.xml"), source);
            // Written the way this service writes it — the teammate is running the same
            // code. A hand-rolled compact manifest would differ only in whitespace and
            // would then show as a permanent phantom change on every status.
            var json = new com.fasterxml.jackson.databind.ObjectMapper();
            var manifest = json.createArrayNode();
            manifest.addObject()
                    .put("key", key)
                    .put("name", key)
                    .put("category", "togetherflow:bpmn")
                    .put("file", key + ".bpmn20.xml");
            Files.writeString(other.resolve(ModelFiles.MANIFEST),
                    json.writerWithDefaultPrettyPrinter().writeValueAsString(manifest) + "\n");
            clone.add().addFilepattern(".").call();
            clone.commit().setMessage("Add " + key).setAuthor("bob", "bob@localhost").call();
            clone.push().call();
        }
    }
}
