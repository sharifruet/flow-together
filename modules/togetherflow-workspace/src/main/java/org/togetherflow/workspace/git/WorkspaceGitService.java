package org.togetherflow.workspace.git;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;

import jakarta.servlet.http.HttpServletRequest;

import org.eclipse.jgit.api.Git;
import org.eclipse.jgit.api.ListBranchCommand;
import org.eclipse.jgit.api.MergeResult;
import org.eclipse.jgit.api.PullResult;
import org.eclipse.jgit.api.ResetCommand;
import org.eclipse.jgit.api.Status;
import org.eclipse.jgit.api.errors.GitAPIException;
import org.eclipse.jgit.diff.DiffFormatter;
import org.eclipse.jgit.lib.BranchTrackingStatus;
import org.eclipse.jgit.lib.Constants;
import org.eclipse.jgit.lib.Ref;
import org.eclipse.jgit.lib.Repository;
import org.eclipse.jgit.revwalk.RevCommit;
import org.eclipse.jgit.transport.CredentialsProvider;
import org.eclipse.jgit.transport.UsernamePasswordCredentialsProvider;
import org.eclipse.jgit.treewalk.FileTreeIterator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.togetherflow.workspace.Caller;
import org.togetherflow.workspace.Capability;
import org.togetherflow.workspace.WorkspaceService;

/**
 * Git connectivity for a workspace (ADR 0018).
 *
 * <p>One working copy per workspace, owned by this service. The engine's database stays
 * the source of truth for what Design edits; the checkout is a materialisation of it,
 * refreshed on every commit and read back on every pull.
 */
public class WorkspaceGitService {

    private static final Logger LOGGER = LoggerFactory.getLogger(WorkspaceGitService.class);

    private final WorkspaceService workspaces;
    private final GitConnectionStore connections;
    private final WorkspaceModels models;
    private final GitProperties properties;
    private final com.fasterxml.jackson.databind.ObjectMapper json =
            new com.fasterxml.jackson.databind.ObjectMapper();

    public WorkspaceGitService(WorkspaceService workspaces, GitConnectionStore connections,
            WorkspaceModels models, GitProperties properties) {
        this.workspaces = workspaces;
        this.connections = connections;
        this.models = models;
        this.properties = properties;
    }

    public boolean isEnabled() {
        return properties.isEnabled();
    }

    /* ── Connect and disconnect ───────────────────────────────────────────── */

    public GitConnection connect(String workspaceId, Caller caller, String remoteUrl, String branch,
            String subPath) {

        requireEnabled();
        workspaces.require(workspaceId, caller, Capability.MANAGE_WORKSPACE);
        if (remoteUrl == null || remoteUrl.isBlank()) {
            throw new IllegalArgumentException("A repository URL is required.");
        }
        String targetBranch = branch == null || branch.isBlank() ? "main" : branch.trim();

        Path checkout = checkoutPath(workspaceId);
        deleteRecursively(checkout);
        try {
            Git.cloneRepository()
                    .setURI(remoteUrl.trim())
                    .setDirectory(checkout.toFile())
                    .setCredentialsProvider(credentials())
                    .call()
                    .close();
        } catch (GitAPIException cannotClone) {
            // The checkout is left absent rather than half-made: a directory that is not
            // a repository is harder to recover from than no directory at all.
            deleteRecursively(checkout);
            throw new GitUnavailable("Could not clone that repository: " + cannotClone.getMessage(),
                    cannotClone);
        }

        try (Git git = open(workspaceId)) {
            checkoutBranch(git, targetBranch);
        } catch (IOException | GitAPIException cause) {
            deleteRecursively(checkout);
            throw new GitUnavailable("Could not check out " + targetBranch + ".", cause);
        }

        GitConnection connection = new GitConnection(workspaceId, remoteUrl.trim(), targetBranch,
                subPath == null ? "" : subPath.trim(), Instant.now(), caller.userId());
        connections.save(connection);
        return connection;
    }

    /**
     * Connects, then brings in whatever the repository already holds.
     *
     * <p>Two steps rather than one because the alternative is worse than it looks: a
     * workspace connected to a repository full of models it does not have would report
     * every one of them as a pending *deletion*, and the obvious next click would erase
     * the repository. Importing on connect makes the two agree before anyone is offered a
     * commit button.
     */
    public WorkspaceModels.ImportSummary connectAndImport(String workspaceId, Caller caller,
            String remoteUrl, String branch, String subPath, HttpServletRequest request) {

        GitConnection link = connect(workspaceId, caller, remoteUrl, branch, subPath);
        try (Git git = open(workspaceId)) {
            return models.apply(workspaceId, readModels(git, link), request);
        } catch (IOException cause) {
            throw new GitUnavailable("Connected, but could not read the repository's models: "
                    + cause.getMessage(), cause);
        }
    }

    public void disconnect(String workspaceId, Caller caller) {
        requireEnabled();
        workspaces.require(workspaceId, caller, Capability.MANAGE_WORKSPACE);
        connections.delete(workspaceId);
        // The models stay in the engine; only the checkout goes. Disconnecting is
        // "stop tracking", not "delete my work".
        deleteRecursively(checkoutPath(workspaceId));
    }

    /* ── Status ───────────────────────────────────────────────────────────── */

    public GitStatus status(String workspaceId, Caller caller, HttpServletRequest request) {
        if (!properties.isEnabled()) {
            return GitStatus.disconnected();
        }
        workspaces.require(workspaceId, caller, Capability.VIEW);
        Optional<GitConnection> connection = connections.find(workspaceId);
        if (connection.isEmpty()) {
            return GitStatus.disconnected();
        }
        GitConnection link = connection.get();

        try (Git git = open(workspaceId)) {
            // Written before the diff so the status reflects the models as they are now,
            // not as they were at the last commit.
            writeModels(git, link, models.export(workspaceId, request));

            List<GitChange> changes = changes(git, link);
            List<String> branches = branchNames(git);
            RevCommit head = headCommit(git);

            int ahead = -1;
            int behind = -1;
            try {
                BranchTrackingStatus tracking =
                        BranchTrackingStatus.of(git.getRepository(), link.branch());
                if (tracking != null) {
                    ahead = tracking.getAheadCount();
                    behind = tracking.getBehindCount();
                }
            } catch (IOException unreadable) {
                // -1 rather than 0: "could not tell" and "in sync" are different answers
                // and the UI must not report the second for the first.
                LOGGER.debug("Could not read tracking status for {}", workspaceId, unreadable);
            }

            return new GitStatus(true, link.remoteUrl(), link.branch(), link.subPathOrEmpty(),
                    branches, ahead, behind, changes,
                    head == null ? null : head.getName(),
                    head == null ? null : head.getShortMessage(), null);
        } catch (IOException | GitAPIException cause) {
            return new GitStatus(true, link.remoteUrl(), link.branch(), link.subPathOrEmpty(),
                    List.of(), -1, -1, List.of(), null, null, cause.getMessage());
        }
    }

    /* ── Commit, push, pull ───────────────────────────────────────────────── */

    public String commit(String workspaceId, Caller caller, String message,
            HttpServletRequest request) {

        requireEnabled();
        workspaces.require(workspaceId, caller, Capability.EDIT);
        GitConnection link = require(workspaceId);
        if (message == null || message.isBlank()) {
            throw new IllegalArgumentException("A commit message is required.");
        }

        try (Git git = open(workspaceId)) {
            writeModels(git, link, models.export(workspaceId, request));
            git.add().addFilepattern(".").call();
            // Also stages deletions, which `add` alone does not.
            git.add().addFilepattern(".").setUpdate(true).call();

            if (git.status().call().isClean()) {
                throw new IllegalArgumentException("There is nothing to commit.");
            }
            RevCommit commit = git.commit()
                    .setMessage(message.trim())
                    // The person, not the service: a repository whose every commit is
                    // authored by "TogetherFlow" cannot be reviewed by author.
                    .setAuthor(caller.userId(), authorEmailFor(caller))
                    .setCommitter(properties.getAuthorName(), properties.getAuthorEmail())
                    .call();
            return commit.getName();
        } catch (IOException | GitAPIException cause) {
            throw new GitUnavailable("Could not commit: " + cause.getMessage(), cause);
        }
    }

    public void push(String workspaceId, Caller caller) {
        requireEnabled();
        workspaces.require(workspaceId, caller, Capability.EDIT);
        require(workspaceId);
        try (Git git = open(workspaceId)) {
            git.push().setCredentialsProvider(credentials()).call();
        } catch (IOException | GitAPIException cause) {
            throw new GitUnavailable("Could not push: " + cause.getMessage(), cause);
        }
    }

    /**
     * Pulls the branch and applies what it carries to the model repository.
     *
     * <p>Refuses when the checkout has uncommitted changes. A merge on top of unsaved
     * work is how someone loses an afternoon, and "commit first" is a sentence a user can
     * act on.
     */
    public WorkspaceModels.ImportSummary pull(String workspaceId, Caller caller,
            HttpServletRequest request) {

        requireEnabled();
        workspaces.require(workspaceId, caller, Capability.EDIT);
        GitConnection link = require(workspaceId);

        try (Git git = open(workspaceId)) {
            writeModels(git, link, models.export(workspaceId, request));
            if (!changes(git, link).isEmpty()) {
                throw new IllegalArgumentException(
                        "This workspace has changes that are not committed. Commit or revert them first.");
            }

            PullResult result = git.pull().setCredentialsProvider(credentials()).call();
            MergeResult merge = result.getMergeResult();
            if (merge != null && !merge.getMergeStatus().isSuccessful()) {
                throw new GitUnavailable(
                        "The pull could not be merged automatically (" + merge.getMergeStatus() + ").", null);
            }
            return models.apply(workspaceId, readModels(git, link), request);
        } catch (IOException | GitAPIException cause) {
            throw new GitUnavailable("Could not pull: " + cause.getMessage(), cause);
        }
    }

    /** Discards local changes by restoring the checkout to the last commit. */
    public void revert(String workspaceId, Caller caller) {
        requireEnabled();
        workspaces.require(workspaceId, caller, Capability.EDIT);
        require(workspaceId);
        try (Git git = open(workspaceId)) {
            git.reset().setMode(ResetCommand.ResetType.HARD).call();
            git.clean().setCleanDirectories(true).call();
        } catch (IOException | GitAPIException cause) {
            throw new GitUnavailable("Could not revert: " + cause.getMessage(), cause);
        }
    }

    /* ── Branches ─────────────────────────────────────────────────────────── */

    public void createBranch(String workspaceId, Caller caller, String name) {
        requireEnabled();
        workspaces.require(workspaceId, caller, Capability.EDIT);
        GitConnection link = require(workspaceId);
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("A branch name is required.");
        }
        try (Git git = open(workspaceId)) {
            git.checkout().setCreateBranch(true).setName(name.trim()).call();
            connections.save(new GitConnection(link.workspaceId(), link.remoteUrl(), name.trim(),
                    link.subPathOrEmpty(), link.connectedAt(), link.connectedBy()));
        } catch (IOException | GitAPIException cause) {
            throw new GitUnavailable("Could not create that branch: " + cause.getMessage(), cause);
        }
    }

    public void switchBranch(String workspaceId, Caller caller, String name) {
        requireEnabled();
        workspaces.require(workspaceId, caller, Capability.EDIT);
        GitConnection link = require(workspaceId);
        try (Git git = open(workspaceId)) {
            checkoutBranch(git, name);
            connections.save(new GitConnection(link.workspaceId(), link.remoteUrl(), name.trim(),
                    link.subPathOrEmpty(), link.connectedAt(), link.connectedBy()));
        } catch (IOException | GitAPIException cause) {
            throw new GitUnavailable("Could not switch branch: " + cause.getMessage(), cause);
        }
    }

    /* ── Diff ─────────────────────────────────────────────────────────────── */

    /**
     * The unified diff of one model against the last commit.
     *
     * <p>A text diff, and the UI says so. REQUIREMENTS §7.4.1 rejected diffing *inside*
     * the editor because a text diff of serialised BPMN mostly reports attribute
     * reordering — that reasoning still holds there, but a Git panel with no diff at all
     * is not reviewable, and a text diff is what Git has.
     */
    public String diff(String workspaceId, Caller caller, String modelKey,
            HttpServletRequest request) {

        requireEnabled();
        workspaces.require(workspaceId, caller, Capability.VIEW);
        GitConnection link = require(workspaceId);

        try (Git git = open(workspaceId);
                java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
                DiffFormatter formatter = new DiffFormatter(out)) {

            writeModels(git, link, models.export(workspaceId, request));
            Repository repository = git.getRepository();
            formatter.setRepository(repository);
            var head = repository.resolve(Constants.HEAD + "^{tree}");
            if (head == null) {
                return "";
            }
            try (var reader = repository.newObjectReader()) {
                var oldTree = new org.eclipse.jgit.treewalk.CanonicalTreeParser();
                oldTree.reset(reader, head);
                var entries = formatter.scan(oldTree, new FileTreeIterator(repository));
                for (var entry : entries) {
                    String path = entry.getNewPath().equals("/dev/null")
                            ? entry.getOldPath()
                            : entry.getNewPath();
                    if (modelKey == null || modelKey.isBlank()
                            || ModelFiles.keyOf(fileName(path)).equals(modelKey)) {
                        formatter.format(entry);
                    }
                }
            }
            return out.toString(StandardCharsets.UTF_8);
        } catch (IOException cause) {
            throw new GitUnavailable("Could not read the diff: " + cause.getMessage(), cause);
        }
    }

    /* ── Internals ────────────────────────────────────────────────────────── */

    private void requireEnabled() {
        if (!properties.isEnabled()) {
            throw new IllegalArgumentException("Git connectivity is not enabled on this deployment.");
        }
    }

    private GitConnection require(String workspaceId) {
        return connections.find(workspaceId).orElseThrow(
                () -> new IllegalArgumentException("This workspace is not connected to a repository."));
    }

    private Git open(String workspaceId) throws IOException {
        Path checkout = checkoutPath(workspaceId);
        if (!Files.isDirectory(checkout.resolve(".git"))) {
            throw new IOException("The working copy for this workspace is missing; reconnect it.");
        }
        return Git.open(checkout.toFile());
    }

    private Path checkoutPath(String workspaceId) {
        // The id is generated, not user text, but a path built from an identifier still
        // gets sanitised — this is the one place a traversal would be invisible.
        return Path.of(properties.getWorkDir(), ModelFiles.sanitise(workspaceId));
    }

    private Path modelsDirectory(Git git, GitConnection link) {
        Path root = git.getRepository().getWorkTree().toPath();
        String sub = link.subPathOrEmpty();
        return sub.isEmpty() ? root : root.resolve(sub);
    }

    private void writeModels(Git git, GitConnection link, List<ExportedModel> exported)
            throws IOException {

        Path directory = modelsDirectory(git, link);
        Files.createDirectories(directory);

        List<String> written = new ArrayList<>();
        var manifest = json.createArrayNode();
        for (ExportedModel model : exported) {
            String fileName = ModelFiles.fileNameFor(model.key(), model.category());
            Files.writeString(directory.resolve(fileName),
                    model.source() == null ? "" : model.source(), StandardCharsets.UTF_8);
            written.add(fileName);
            manifest.addObject()
                    .put("key", model.key())
                    .put("name", model.name())
                    .put("category", model.category())
                    .put("file", fileName);
        }
        /*
         * A workspace with no models writes no manifest at all, rather than an empty one.
         * An empty `[]` is a file where there was none — an untracked change that makes a
         * clean checkout look dirty, which then blocks the pull that would have filled
         * the workspace in the first place.
         */
        if (!exported.isEmpty()) {
            Files.writeString(directory.resolve(ModelFiles.MANIFEST),
                    json.writerWithDefaultPrettyPrinter().writeValueAsString(manifest) + "\n",
                    StandardCharsets.UTF_8);
            written.add(ModelFiles.MANIFEST);
        }

        /*
         * A model deleted in Design must disappear from the repository too, or the next
         * pull would resurrect it. Only files this service recognises are removed —
         * anything else in the directory belongs to somebody else.
         */
        try (Stream<Path> existing = Files.list(directory)) {
            for (Path path : existing.toList()) {
                String name = path.getFileName().toString();
                if (!written.contains(name) && isModelFile(name)) {
                    Files.deleteIfExists(path);
                }
            }
        }
    }

    private List<ExportedModel> readModels(Git git, GitConnection link) throws IOException {
        Path directory = modelsDirectory(git, link);
        Path manifestPath = directory.resolve(ModelFiles.MANIFEST);
        if (!Files.exists(manifestPath)) {
            return List.of();
        }
        var manifest = json.readTree(Files.readString(manifestPath, StandardCharsets.UTF_8));
        List<ExportedModel> read = new ArrayList<>();
        for (var entry : manifest) {
            String file = entry.path("file").asText("");
            Path path = directory.resolve(file);
            if (file.isEmpty() || !Files.exists(path)) {
                continue;
            }
            read.add(new ExportedModel(null, entry.path("key").asText(""),
                    entry.path("name").asText(""), entry.path("category").asText(""),
                    Files.readString(path, StandardCharsets.UTF_8)));
        }
        return read;
    }

    private static boolean isModelFile(String name) {
        return name.equals(ModelFiles.MANIFEST) || !ModelFiles.keyOf(name).equals(name);
    }

    private List<GitChange> changes(Git git, GitConnection link) throws GitAPIException {
        Status status = git.status().call();
        String prefix = link.subPathOrEmpty().isEmpty() ? "" : link.subPathOrEmpty() + "/";
        List<GitChange> changes = new ArrayList<>();
        for (String path : status.getUntracked()) {
            add(changes, prefix, path, GitChange.Kind.ADDED);
        }
        for (String path : status.getModified()) {
            add(changes, prefix, path, GitChange.Kind.MODIFIED);
        }
        for (String path : status.getMissing()) {
            add(changes, prefix, path, GitChange.Kind.REMOVED);
        }
        changes.sort(Comparator.comparing(GitChange::path));
        return changes;
    }

    private static void add(List<GitChange> changes, String prefix, String path, GitChange.Kind kind) {
        if (!prefix.isEmpty() && !path.startsWith(prefix)) {
            // Somebody else's files in a monorepo: reporting them as this workspace's
            // changes would invite committing them.
            return;
        }
        changes.add(new GitChange(path, ModelFiles.keyOf(fileName(path)), kind));
    }

    private static String fileName(String path) {
        int slash = path.lastIndexOf('/');
        return slash < 0 ? path : path.substring(slash + 1);
    }

    private List<String> branchNames(Git git) throws GitAPIException {
        List<String> names = new ArrayList<>();
        for (Ref ref : git.branchList().setListMode(ListBranchCommand.ListMode.ALL).call()) {
            String name = Repository.shortenRefName(ref.getName());
            if (!names.contains(name)) {
                names.add(name);
            }
        }
        return names;
    }

    private RevCommit headCommit(Git git) throws IOException, GitAPIException {
        if (git.getRepository().resolve(Constants.HEAD) == null) {
            return null;
        }
        return git.log().setMaxCount(1).call().iterator().next();
    }

    private void checkoutBranch(Git git, String branch) throws GitAPIException, IOException {
        String target = branch == null || branch.isBlank() ? "main" : branch.trim();
        if (target.equals(git.getRepository().getBranch())) {
            return;
        }
        boolean exists = branchNames(git).contains(target);
        git.checkout()
                .setName(target)
                .setCreateBranch(!exists)
                .call();
    }

    private String authorEmailFor(Caller caller) {
        String domain = properties.getAuthorEmail().contains("@")
                ? properties.getAuthorEmail().substring(properties.getAuthorEmail().indexOf('@') + 1)
                : "localhost";
        return caller.userId() + "@" + domain;
    }

    private CredentialsProvider credentials() {
        if (properties.getUsername().isBlank() && properties.getToken().isBlank()) {
            // A file:// or ssh-agent remote needs none; sending empty ones would turn a
            // working anonymous clone into an auth failure.
            return null;
        }
        return new UsernamePasswordCredentialsProvider(properties.getUsername(), properties.getToken());
    }

    private static void deleteRecursively(Path path) {
        if (!Files.exists(path)) {
            return;
        }
        try (Stream<Path> walk = Files.walk(path)) {
            walk.sorted(Comparator.reverseOrder()).forEach(entry -> {
                try {
                    Files.deleteIfExists(entry);
                } catch (IOException ignored) {
                    LOGGER.debug("Could not delete {}", entry);
                }
            });
        } catch (IOException cause) {
            LOGGER.warn("Could not clear the working copy at {}", path, cause);
        }
    }

    /** Git could not do the thing. Distinct from the caller not being allowed to ask. */
    public static class GitUnavailable extends RuntimeException {
        private static final long serialVersionUID = 1L;

        public GitUnavailable(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
