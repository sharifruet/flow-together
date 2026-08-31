package org.togetherflow.workspace;

import java.util.LinkedHashSet;
import java.util.Set;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

/**
 * Turns an authenticated request into a {@link Caller} (ADR 0017).
 *
 * <p>The user id comes from the credentials Spring Security validated — a JWT's
 * {@code sub}, or the Basic principal in local development — never from a header the
 * client chose. That distinction is the difference between a check and a formality.
 *
 * <p>The tenant is the exception, and deliberately so: it arrives in the same header the
 * rest of TogetherFlow already sends, because the engine takes tenancy from the request
 * too. It scopes; it does not authenticate.
 */
public class CallerResolver {

    static final String TENANT_HEADER = "X-Tenant-Id";

    private final WorkspaceProperties properties;

    public CallerResolver(WorkspaceProperties properties) {
        this.properties = properties;
    }

    public Caller resolve(HttpServletRequest request) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            throw new WorkspaceService.AccessDenied("Sign in to continue.");
        }
        String tenantId = request.getHeader(TENANT_HEADER);
        return new Caller(userId(authentication), groups(authentication), tenantId);
    }

    private String userId(Authentication authentication) {
        if (authentication instanceof JwtAuthenticationToken token) {
            Jwt jwt = token.getToken();
            // `preferred_username` is what Keycloak puts a login name in; `sub` is the
            // stable id. Flowable's own identity links store the login name, so matching
            // on `sub` would compare two different things.
            String preferred = jwt.getClaimAsString("preferred_username");
            return preferred != null ? preferred : jwt.getSubject();
        }
        return authentication.getName();
    }

    private Set<String> groups(Authentication authentication) {
        Set<String> groups = new LinkedHashSet<>();
        if (authentication instanceof JwtAuthenticationToken token) {
            Object claim = token.getToken().getClaim(properties.getGroupsClaim());
            if (claim instanceof Iterable<?> values) {
                for (Object value : values) {
                    if (value != null) {
                        groups.add(String.valueOf(value));
                    }
                }
            }
        }
        authentication.getAuthorities().forEach(authority -> {
            String name = authority.getAuthority();
            // Spring prefixes roles; the group names Flowable knows are unprefixed.
            groups.add(name.startsWith("ROLE_") ? name.substring("ROLE_".length()) : name);
        });
        return groups;
    }
}
