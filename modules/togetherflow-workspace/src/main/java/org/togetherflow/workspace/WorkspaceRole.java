package org.togetherflow.workspace;

import java.util.EnumSet;
import java.util.Locale;
import java.util.Set;

/**
 * The three built-in roles, matching Flowable Design's own vocabulary (ADR 0017).
 *
 * <p>Additive by construction: each role holds every capability of the one below it, so
 * "owner can do what a modeler can" is a property of the data rather than a rule someone
 * has to remember to keep true.
 */
public enum WorkspaceRole {

    READER(EnumSet.of(Capability.VIEW)),

    MODELER(EnumSet.of(Capability.VIEW, Capability.EDIT, Capability.DELETE, Capability.PUBLISH)),

    OWNER(EnumSet.allOf(Capability.class));

    private final Set<Capability> capabilities;

    WorkspaceRole(Set<Capability> capabilities) {
        this.capabilities = capabilities;
    }

    public boolean can(Capability capability) {
        return capabilities.contains(capability);
    }

    public Set<Capability> capabilities() {
        return EnumSet.copyOf(capabilities);
    }

    /** True when this role is at least as privileged as {@code other}. */
    public boolean atLeast(WorkspaceRole other) {
        return capabilities.containsAll(other.capabilities);
    }

    /**
     * Parses a stored or submitted role name.
     *
     * @throws IllegalArgumentException on anything else — an unrecognised role must not
     *     quietly become the most permissive one, and defaulting to the least permissive
     *     would hide a typo in a member record until someone was locked out.
     */
    public static WorkspaceRole parse(String value) {
        if (value == null) {
            throw new IllegalArgumentException("A role is required.");
        }
        return WorkspaceRole.valueOf(value.trim().toUpperCase(Locale.ROOT));
    }
}
