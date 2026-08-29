package org.togetherflow.workspace;

import java.util.Locale;

/** Who can see a workspace at all, before per-member roles are considered. */
public enum WorkspaceVisibility {

    /** Only explicit members, by user or group. */
    PRIVATE,

    /**
     * Every signed-in user of the tenant reads it; explicit members may hold more.
     * Matches Flowable Design, where a public workspace still assigns owners.
     */
    PUBLIC;

    public static WorkspaceVisibility parse(String value) {
        if (value == null || value.isBlank()) {
            return PRIVATE;
        }
        return WorkspaceVisibility.valueOf(value.trim().toUpperCase(Locale.ROOT));
    }
}
