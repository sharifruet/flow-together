package org.togetherflow.workspace;

import java.util.Set;

/**
 * Who is asking.
 *
 * <p>Resolved from the request's credentials — a validated OIDC token, or Basic in local
 * development (ADR 0006, ADR 0017) — and never from a header the client supplies. A
 * {@code X-User-Id} the caller sets is a header the caller can change, which would make
 * every check below ornamental.
 */
public record Caller(String userId, Set<String> groups, String tenantId) {

    public Caller {
        groups = groups == null ? Set.of() : Set.copyOf(groups);
    }

    public boolean isIn(String group) {
        return groups.contains(group);
    }
}
