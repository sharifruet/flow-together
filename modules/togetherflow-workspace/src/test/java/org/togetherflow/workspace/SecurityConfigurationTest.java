package org.togetherflow.workspace;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Base64;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.TestPropertySource;

/**
 * What an unauthenticated request gets back.
 *
 * <p>Found by running the app in Firefox, not by reading it: Spring's default Basic
 * configuration answers a 401 with {@code WWW-Authenticate: Basic}, and a browser that
 * sees that header on an XHR opens its own native credential dialog and blocks the
 * request behind it. Headless — or with nobody to answer the dialog — the request never
 * settles, so the caller waits forever on a service that answered in milliseconds, and
 * the app's own "incorrect password" message never runs.
 *
 * <p>Chromium does not do this, which is why it survived a Chromium-only pass. Pinned
 * here because the failure is invisible from the server's side: the status is correct,
 * the timing is fine, and only a real browser behaves differently.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties = {
        "spring.datasource.url=jdbc:h2:mem:workspace-security;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "spring.security.user.name=ada",
        "spring.security.user.password=secret",
})
class SecurityConfigurationTest {

    @LocalServerPort
    private int port;

    /** A plain HTTP client, so what is asserted is the wire response and nothing else. */
    private HttpResponse<String> get(String path, String credentials) throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path));
        if (credentials != null) {
            request.header("Authorization",
                    "Basic " + Base64.getEncoder().encodeToString(credentials.getBytes()));
        }
        return HttpClient.newHttpClient().send(request.build(), HttpResponse.BodyHandlers.ofString());
    }

    @Test
    void an_unauthenticated_request_is_refused_without_a_browser_prompt() throws Exception {
        HttpResponse<String> response = get("/workspaces", null);

        assertThat(response.statusCode()).isEqualTo(401);
        // The header, not the status, is the thing being asserted.
        assertThat(response.headers().firstValue("WWW-Authenticate")).isEmpty();
    }

    @Test
    void health_needs_no_credentials_at_all() throws Exception {
        // Both forms: `/actuator/health/**` alone does not match the bare path, which is
        // exactly what the container healthcheck and the k8s probes call.
        assertThat(get("/actuator/health", null).statusCode()).isEqualTo(200);
        assertThat(get("/actuator/health/readiness", null).statusCode()).isEqualTo(200);
    }

    @Test
    void credentials_still_work() throws Exception {
        assertThat(get("/workspaces", "ada:secret").statusCode()).isEqualTo(200);
    }
}
