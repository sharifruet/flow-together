package org.togetherflow.workspace;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * The upstream Flowable REST API, called on the user's behalf.
 *
 * <p>The caller's own {@code Authorization} header is forwarded rather than a service
 * account's: this module adds a workspace check in front of Flowable, it does not become
 * a trusted intermediary that speaks for everyone. If Flowable would have refused the
 * user, it still does.
 */
public class FlowableClient {

    private final RestClient client;

    public FlowableClient(RestClient.Builder builder, WorkspaceProperties properties) {
        this.client = builder
                .baseUrl(properties.getFlowableBaseUrl())
                /*
                 * Never treat an upstream status as an error to throw on. Flowable's own
                 * 404s and 409s are answers this service must relay verbatim — turning
                 * them into exceptions here would replace the engine's message with a
                 * generic one and lose the status the UI branches on.
                 */
                .defaultStatusHandler(status -> false, (request, response) -> {
                })
                .build();
    }

    public ResponseEntity<String> get(String path, HttpServletRequest request) {
        return exchange(() -> client.get()
                .uri(uriBuilder -> uriBuilder.path(path).query(query(request)).build())
                .headers(headers -> headers.addAll(GuardedModelController.forwarded(request)))
                .retrieve().toEntity(String.class));
    }

    public ResponseEntity<byte[]> getBytes(String path, HttpServletRequest request) {
        try {
            return client.get().uri(path)
                    .headers(headers -> headers.addAll(GuardedModelController.forwarded(request)))
                    .retrieve().toEntity(byte[].class);
        } catch (RestClientException unreachable) {
            throw new UpstreamUnavailable(unreachable);
        }
    }

    public ResponseEntity<String> post(String path, String body, HttpServletRequest request) {
        return exchange(() -> client.post().uri(path)
                .headers(headers -> headers.addAll(GuardedModelController.forwarded(request)))
                .contentType(MediaType.APPLICATION_JSON).body(body)
                .retrieve().toEntity(String.class));
    }

    public ResponseEntity<String> put(String path, String body, HttpServletRequest request) {
        return exchange(() -> client.put().uri(path)
                .headers(headers -> headers.addAll(GuardedModelController.forwarded(request)))
                .contentType(MediaType.APPLICATION_JSON).body(body)
                .retrieve().toEntity(String.class));
    }

    public ResponseEntity<String> delete(String path, HttpServletRequest request) {
        return exchange(() -> client.delete().uri(path)
                .headers(headers -> headers.addAll(GuardedModelController.forwarded(request)))
                .retrieve().toEntity(String.class));
    }

    public ResponseEntity<String> postMultipart(String path, MultiValueMap<String, Object> form,
            HttpServletRequest request) {
        return exchange(() -> client.put().uri(path)
                .headers(headers -> headers.addAll(GuardedModelController.forwarded(request)))
                .contentType(MediaType.MULTIPART_FORM_DATA).body(form)
                .retrieve().toEntity(String.class));
    }

    private static String query(HttpServletRequest request) {
        String query = request.getQueryString();
        return query == null ? "" : query;
    }

    private <T> ResponseEntity<T> exchange(java.util.function.Supplier<ResponseEntity<T>> call) {
        try {
            return call.get();
        } catch (RestClientException unreachable) {
            throw new UpstreamUnavailable(unreachable);
        }
    }

    /** Flowable could not be reached at all. Distinct from Flowable saying no. */
    public static class UpstreamUnavailable extends RuntimeException {
        private static final long serialVersionUID = 1L;

        UpstreamUnavailable(Throwable cause) {
            super("The model repository is unavailable.", cause);
        }

        public HttpStatus status() {
            return HttpStatus.BAD_GATEWAY;
        }
    }
}
