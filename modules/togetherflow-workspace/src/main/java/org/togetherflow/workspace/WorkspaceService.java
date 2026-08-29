package org.togetherflow.workspace;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Workspace rules, above storage and below HTTP (ADR 0017).
 *
 * <p>Everything that can be decided without a request lives here, so the controller stays
 * a translation layer and the rules can be tested by calling methods.
 */
public class WorkspaceService {

    private final WorkspaceStore store;
    private final WorkspaceProperties properties;

    public WorkspaceService(WorkspaceStore store, WorkspaceProperties properties) {
        this.store = store;
        this.properties = properties;
    }

    /** Every workspace this caller may see, with the role they hold in each. */
    public List<WorkspaceView> visibleTo(Caller caller) {
        List<Workspace> all = store.listWorkspaces(caller.tenantId());
        List<WorkspaceMember> members = store.membersOf(all.stream().map(Workspace::id).toList());
        List<WorkspaceView> visible = new ArrayList<>();
        for (Workspace workspace : all) {
            WorkspaceAccess.effectiveRole(workspace, caller, members)
                    .ifPresent(role -> visible.add(new WorkspaceView(workspace, role)));
        }
        return List.copyOf(visible);
    }

    /** The caller's role in one workspace, or empty where they cannot see it at all. */
    public Optional<WorkspaceRole> roleIn(String workspaceId, Caller caller) {
        return store.findWorkspace(workspaceId)
                .flatMap(workspace -> WorkspaceAccess.effectiveRole(workspace, caller,
                        store.membersOf(List.of(workspaceId))));
    }

    public void require(String workspaceId, Caller caller, Capability capability) {
        WorkspaceRole role = roleIn(workspaceId, caller).orElseThrow(() -> new AccessDenied(
                "You don't have access to this workspace."));
        if (!role.can(capability)) {
            throw new AccessDenied("Your role in this workspace (" + role.name().toLowerCase()
                    + ") doesn't allow that.");
        }
    }

    public WorkspaceView create(Caller caller, String key, String name, String description,
            WorkspaceVisibility visibility) {

        if (key == null || key.isBlank()) {
            throw new IllegalArgumentException("A workspace key is required.");
        }
        if (store.findWorkspaceByKey(key, caller.tenantId()).isPresent()) {
            throw new IllegalArgumentException("A workspace with the key \"" + key + "\" already exists.");
        }
        Workspace workspace = new Workspace(UUID.randomUUID().toString(), key.trim(),
                name == null || name.isBlank() ? key.trim() : name.trim(), description,
                caller.tenantId(), visibility == null ? WorkspaceVisibility.PRIVATE : visibility,
                null, caller.userId(), Instant.now());
        store.saveWorkspace(workspace);
        // The creator owns it. A workspace with no owner can never be administered again,
        // and the only moment an owner can be assigned without a permission check is this
        // one, before anyone holds a role in it.
        store.saveMember(new WorkspaceMember(workspace.id(), WorkspaceMember.PrincipalType.USER,
                caller.userId(), WorkspaceRole.OWNER));
        return new WorkspaceView(workspace, WorkspaceRole.OWNER);
    }

    public Workspace update(String workspaceId, Caller caller, String name, String description,
            WorkspaceVisibility visibility) {

        require(workspaceId, caller, Capability.MANAGE_WORKSPACE);
        Workspace current = store.findWorkspace(workspaceId).orElseThrow(WorkspaceService::notFound);
        Workspace updated = new Workspace(current.id(), current.key(),
                name == null ? current.name() : name, description == null ? current.description() : description,
                current.tenantId(), visibility == null ? current.visibility() : visibility,
                current.sharedWorkspaceId(), current.createdBy(), current.createdAt());
        store.saveWorkspace(updated);
        return updated;
    }

    /**
     * Links a shared workspace — one whose models this one may reference.
     *
     * <p>Refused when the target itself has one, which is Flowable Design's own rule. It
     * keeps the graph one level deep: a chain of shared workspaces makes "where did this
     * model come from" a traversal, and a cycle makes it a hang.
     */
    public Workspace share(String workspaceId, Caller caller, String sharedWorkspaceId) {
        require(workspaceId, caller, Capability.MANAGE_WORKSPACE);
        Workspace current = store.findWorkspace(workspaceId).orElseThrow(WorkspaceService::notFound);

        if (sharedWorkspaceId != null && !sharedWorkspaceId.isBlank()) {
            if (sharedWorkspaceId.equals(workspaceId)) {
                throw new IllegalArgumentException("A workspace can't share from itself.");
            }
            Workspace target = store.findWorkspace(sharedWorkspaceId)
                    .orElseThrow(() -> new IllegalArgumentException("That workspace doesn't exist."));
            if (target.sharedWorkspaceId() != null && !target.sharedWorkspaceId().isBlank()) {
                throw new IllegalArgumentException(
                        "\"" + target.name() + "\" already shares from another workspace, so it can't be shared from.");
            }
        }
        Workspace updated = new Workspace(current.id(), current.key(), current.name(),
                current.description(), current.tenantId(), current.visibility(),
                blankToNull(sharedWorkspaceId), current.createdBy(), current.createdAt());
        store.saveWorkspace(updated);
        return updated;
    }

    public void delete(String workspaceId, Caller caller) {
        require(workspaceId, caller, Capability.MANAGE_WORKSPACE);
        // The models themselves live in the engine and are left alone: deleting a
        // container should not delete what someone put in it.
        store.deleteWorkspace(workspaceId);
    }

    public List<WorkspaceMember> members(String workspaceId, Caller caller) {
        require(workspaceId, caller, Capability.VIEW);
        return store.membersOf(List.of(workspaceId));
    }

    public void addMember(String workspaceId, Caller caller, WorkspaceMember member) {
        require(workspaceId, caller, Capability.MANAGE_MEMBERS);
        store.saveMember(new WorkspaceMember(workspaceId, member.principalType(),
                member.principalId(), member.role()));
    }

    public void removeMember(String workspaceId, Caller caller, WorkspaceMember.PrincipalType type,
            String principalId) {

        require(workspaceId, caller, Capability.MANAGE_MEMBERS);
        /*
         * Refuse to remove the last owner. A workspace whose owners are all gone cannot
         * have members added, cannot be renamed and cannot be deleted — it is
         * unadministerable, and nothing in the UI would explain why.
         */
        if (isLastOwner(workspaceId, type, principalId)) {
            throw new IllegalArgumentException(
                    "This is the workspace's only owner. Give someone else the owner role first.");
        }
        store.removeMember(workspaceId, type, principalId);
    }

    private boolean isLastOwner(String workspaceId, WorkspaceMember.PrincipalType type, String principalId) {
        Collection<WorkspaceMember> current = store.membersOf(List.of(workspaceId));
        List<WorkspaceMember> owners = current.stream()
                .filter(member -> member.role() == WorkspaceRole.OWNER)
                .toList();
        return owners.size() == 1
                && owners.get(0).principalType() == type
                && owners.get(0).principalId().equals(principalId);
    }

    /* ── Model assignment ─────────────────────────────────────────────────── */

    public void assignModel(String modelId, String workspaceId, Caller caller) {
        require(workspaceId, caller, Capability.EDIT);
        // Moving out of a workspace needs the right in the workspace it is leaving too,
        // or a modeler in workspace B could quietly take A's model.
        store.workspaceIdForModel(modelId)
                .filter(from -> !from.equals(workspaceId))
                .ifPresent(from -> require(from, caller, Capability.EDIT));
        store.assignModel(modelId, workspaceId);
    }

    public Optional<String> workspaceIdForModel(String modelId) {
        return store.workspaceIdForModel(modelId);
    }

    /**
     * Forgets a model's workspace, after the model itself is gone.
     *
     * <p>Unchecked on purpose: the only caller has already passed a {@link
     * Capability#DELETE} check against this very model, and the engine has already
     * accepted the delete. Re-checking here would fail — the model no longer exists.
     */
    public void unassignModel(String modelId) {
        store.unassignModel(modelId);
    }

    /**
     * Whether the caller may do something to a model, resolved through the workspace it
     * belongs to.
     *
     * <p>An unassigned model follows {@code unassignedModelsVisible}: readable by default
     * so that a library predating this module does not disappear on upgrade, and editable
     * on the same basis — the guard adds a check where a workspace says so, rather than
     * inventing an owner for models that never had one.
     */
    public boolean mayTouchModel(String modelId, Caller caller, Capability capability) {
        Optional<String> workspaceId = store.workspaceIdForModel(modelId);
        if (workspaceId.isEmpty()) {
            return properties.isUnassignedModelsVisible();
        }
        return roleIn(workspaceId.get(), caller).filter(role -> role.can(capability)).isPresent();
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    private static RuntimeException notFound() {
        return new NotFound("That workspace doesn't exist.");
    }

    /** A workspace or model the caller may not touch. Mapped to 403. */
    public static class AccessDenied extends RuntimeException {
        private static final long serialVersionUID = 1L;

        public AccessDenied(String message) {
            super(message);
        }
    }

    /** Mapped to 404. */
    public static class NotFound extends RuntimeException {
        private static final long serialVersionUID = 1L;

        public NotFound(String message) {
            super(message);
        }
    }

    /** A workspace plus the role the asking caller holds in it. */
    public record WorkspaceView(Workspace workspace, WorkspaceRole role) {
    }
}
