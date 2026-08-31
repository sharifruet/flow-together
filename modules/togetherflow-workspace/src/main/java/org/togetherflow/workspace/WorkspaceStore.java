package org.togetherflow.workspace;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

/** Persistence for workspaces, their members, and which workspace a model belongs to. */
public interface WorkspaceStore {

    List<Workspace> listWorkspaces(String tenantId);

    Optional<Workspace> findWorkspace(String workspaceId);

    Optional<Workspace> findWorkspaceByKey(String key, String tenantId);

    void saveWorkspace(Workspace workspace);

    /** Also removes the workspace's members and model assignments. */
    void deleteWorkspace(String workspaceId);

    /**
     * Members of the given workspaces.
     *
     * <p>Bulk rather than per-workspace because listing "the workspaces I can see" needs
     * every membership at once, and one query beats N. Workspaces number in the tens, so
     * loading their members and filtering in {@link WorkspaceAccess} is cheaper than
     * pushing the role rules into SQL where they would then exist twice.
     */
    List<WorkspaceMember> membersOf(Collection<String> workspaceIds);

    /** Inserts or re-roles a member. */
    void saveMember(WorkspaceMember member);

    void removeMember(String workspaceId, WorkspaceMember.PrincipalType type, String principalId);

    Optional<String> workspaceIdForModel(String modelId);

    void assignModel(String modelId, String workspaceId);

    void unassignModel(String modelId);

    List<String> modelIdsIn(String workspaceId);
}
