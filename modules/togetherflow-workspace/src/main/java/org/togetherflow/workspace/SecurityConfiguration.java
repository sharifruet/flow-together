package org.togetherflow.workspace;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;

/**
 * Who the caller is, established before any workspace rule runs (ADR 0006, ADR 0017).
 *
 * <p>OIDC where an issuer is configured; HTTP Basic otherwise, on the same fencing ADR
 * 0006 applies to the apps — a convenience for local development, not a production mode.
 * Either way the identity comes from validated credentials, which is what stops the
 * permission model being a suggestion.
 */
@Configuration
public class SecurityConfiguration {

    @Value("${spring.security.oauth2.resourceserver.jwt.issuer-uri:}")
    private String issuerUri;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                // Stateless: there is no session to fix, and no cookie for a CSRF token to
                // protect. Every request carries its own credentials.
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(requests -> requests
                        /*
                         * Both forms. `/actuator/health/**` alone does not match
                         * `/actuator/health` itself — which is the exact path the
                         * container healthcheck and every ad-hoc curl use, so the
                         * service would report itself unhealthy while working fine.
                         */
                        .requestMatchers("/actuator/health", "/actuator/health/**").permitAll()
                        .anyRequest().authenticated());

        if (issuerUri != null && !issuerUri.isBlank()) {
            http.oauth2ResourceServer(oauth2 -> oauth2.jwt(Customizer.withDefaults()));
        } else {
            /*
             * Basic, but *without* the `WWW-Authenticate` challenge Spring sends by
             * default.
             *
             * This API is consumed by `fetch`, and a browser that receives
             * `WWW-Authenticate: Basic` on an XHR opens its own native credential
             * dialog. Firefox then blocks the request behind that dialog — headless,
             * with no one to answer it, the request simply never settles, and the
             * workspace context waits forever on a service that answered in 80ms.
             * Chromium does not, which is why this survived a Chromium-only pass.
             *
             * A bare 401 is what an API should say: the client already knows how to
             * present a login screen.
             */
            http.httpBasic(basic ->
                    basic.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)));
        }
        return http.build();
    }
}
