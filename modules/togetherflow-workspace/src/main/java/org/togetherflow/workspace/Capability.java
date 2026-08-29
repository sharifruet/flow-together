package org.togetherflow.workspace;

/**
 * What someone is trying to do, rather than who they are (ADR 0017).
 *
 * <p>Call sites test a capability, never a role name. Roles are additive and will grow —
 * Flowable Design has custom roles layered on top of the built-in three — and a check
 * written as {@code role == OWNER} is the one that silently excludes a new role that
 * should have passed.
 */
public enum Capability {

    /** Read a model, or list what a workspace holds. */
    VIEW,

    /** Create a model, or write its source. */
    EDIT,

    /** Delete a draft. Separated from EDIT because it is the irreversible half. */
    DELETE,

    /** Deploy or publish to a runtime engine. */
    PUBLISH,

    /** Add, remove or re-role a member. */
    MANAGE_MEMBERS,

    /** Rename, re-scope or delete the workspace itself. */
    MANAGE_WORKSPACE
}
