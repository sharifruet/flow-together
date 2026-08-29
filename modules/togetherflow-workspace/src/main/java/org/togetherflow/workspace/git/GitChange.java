package org.togetherflow.workspace.git;

/**
 * One file's difference between the checkout and the last commit.
 *
 * <p>`modelKey` is the file's stem, which is the model key by construction (ADR 0018) —
 * so the UI can name a change after the model rather than after a path.
 */
public record GitChange(String path, String modelKey, Kind kind) {

    public enum Kind {
        ADDED,
        MODIFIED,
        REMOVED
    }
}
