package org.togetherflow.workspace;

import java.time.Instant;

/**
 * A workspace: the container apps and models live in (ADR 0017).
 *
 * <p>{@code sharedWorkspaceId} is Flowable Design's shared-workspace link — a workspace
 * whose models this one may reference. Design allows the link only where the target has
 * no shared workspace of its own, which keeps the graph one level deep and stops a
 * reference chain nobody can reason about; {@link WorkspaceService} enforces the same.
 *
 * <p>A workspace never spans tenants: {@code tenantId} is what the engine already scopes
 * by, and a workspace scopes what a person may do inside one.
 */
public record Workspace(
        String id,
        String key,
        String name,
        String description,
        String tenantId,
        WorkspaceVisibility visibility,
        String sharedWorkspaceId,
        String createdBy,
        Instant createdAt) {
}
