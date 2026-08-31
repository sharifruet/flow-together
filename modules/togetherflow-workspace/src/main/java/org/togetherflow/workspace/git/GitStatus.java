package org.togetherflow.workspace.git;

import java.util.List;

/**
 * What the Git panel shows (ADR 0018).
 *
 * @param connected false where the workspace has no repository; everything else is then
 *     empty rather than absent, so the UI renders one shape either way.
 * @param ahead commits this branch has that the remote does not, and vice versa for
 *     {@code behind}. Both are -1 when the remote could not be reached — which is not
 *     the same as zero, and the UI must not report "in sync" for it.
 */
public record GitStatus(
        boolean connected,
        String remoteUrl,
        String branch,
        String subPath,
        List<String> branches,
        int ahead,
        int behind,
        List<GitChange> changes,
        String lastCommitId,
        String lastCommitMessage,
        String error) {

    public static GitStatus disconnected() {
        return new GitStatus(false, null, null, null, List.of(), 0, 0, List.of(), null, null, null);
    }
}
