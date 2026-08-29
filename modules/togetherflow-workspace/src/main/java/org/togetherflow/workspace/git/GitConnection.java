package org.togetherflow.workspace.git;

import java.time.Instant;

/**
 * A workspace's link to a Git repository (ADR 0018).
 *
 * <p>No credentials here on purpose: they are service-level configuration, not per-row
 * data. Storing other people's tokens in this database is a materially larger thing to
 * get wrong than a config value.
 *
 * @param subPath directory within the repository, for a monorepo. Empty means the root.
 */
public record GitConnection(
        String workspaceId,
        String remoteUrl,
        String branch,
        String subPath,
        Instant connectedAt,
        String connectedBy) {

    public String subPathOrEmpty() {
        return subPath == null ? "" : subPath.trim();
    }
}
