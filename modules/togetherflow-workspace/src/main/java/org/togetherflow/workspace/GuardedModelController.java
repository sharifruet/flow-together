package org.togetherflow.workspace;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * The model API, guarded (ADR 0017).
 *
 * <p>Mounted on the same paths Flowable uses, so Design changes a base URL and nothing
 * else. Every call resolves the model's workspace, checks the caller's role, and only
 * then forwards — carrying the caller's own credentials, so Flowable still applies its
 * own auth on top. This adds a check; it does not replace one.
 *
 * <p><strong>The guard holds only where {@code flowable-rest} is not itself reachable by
 * the browser.</strong> A deployment that publishes both gives a determined user a way
 * around it. That is a network-topology requirement, stated in the README rather than
 * assumed.
 */
@RestController
@RequestMapping("/repository/models")
public class GuardedModelController {

    private final WorkspaceService service;
    private final CallerResolver callers;
    private final FlowableClient flowable;
    /*
     * Its own, not the application's. This reads and rewrites the engine's JSON as a
     * tree; it never binds to a type, so it needs none of the configuration an injected
     * mapper carries — and taking one would tie the guard to whichever JSON binding the
     * host happens to auto-configure.
     */
    private final ObjectMapper json = new ObjectMapper();

    public GuardedModelController(WorkspaceService service, CallerResolver callers,
            FlowableClient flowable) {
        this.service = service;
        this.callers = callers;
        this.flowable = flowable;
    }

    @GetMapping
    public ResponseEntity<String> list(HttpServletRequest request) {
        Caller caller = callers.resolve(request);
        ResponseEntity<String> upstream = flowable.get("/repository/models", request);
        if (!upstream.getStatusCode().is2xxSuccessful() || upstream.getBody() == null) {
            return upstream;
        }
        return ResponseEntity.status(upstream.getStatusCode())
                .contentType(MediaType.APPLICATION_JSON)
                .body(filterVisible(upstream.getBody(), caller));
    }

    /**
     * Drops the models the caller may not see, and corrects the paging totals to match.
     *
     * <p>Leaving {@code total} alone would be the subtler bug: a page of 25 that filtered
     * to 3 would still claim 4,000 results, and the pager would offer pages that come
     * back empty.
     */
    private String filterVisible(String body, Caller caller) {
        try {
            JsonNode root = json.readTree(body);
            if (!(root instanceof ObjectNode object) || !(object.get("data") instanceof ArrayNode data)) {
                return body;
            }
            ArrayNode kept = json.createArrayNode();
            for (JsonNode model : data) {
                String id = model.path("id").asText(null);
                if (id != null && service.mayTouchModel(id, caller, Capability.VIEW)) {
                    kept.add(model);
                }
            }
            int removed = data.size() - kept.size();
            object.set("data", kept);
            if (object.has("total")) {
                object.put("total", Math.max(0, object.get("total").asInt() - removed));
            }
            if (object.has("size")) {
                object.put("size", kept.size());
            }
            return json.writeValueAsString(object);
        } catch (Exception malformed) {
            // An unparseable body is the engine's to explain, not this service's to
            // swallow — but it must not leak past the filter either.
            throw new WorkspaceService.AccessDenied("The model list could not be checked.");
        }
    }

    @GetMapping("/{modelId}")
    public ResponseEntity<String> get(@PathVariable String modelId, HttpServletRequest request) {
        requireModel(modelId, request, Capability.VIEW);
        return flowable.get("/repository/models/" + modelId, request);
    }

    @PostMapping
    public ResponseEntity<String> create(@RequestBody String body,
            @RequestHeader(value = WORKSPACE_HEADER, required = false) String workspaceId,
            HttpServletRequest request) {

        Caller caller = callers.resolve(request);
        // Checked before the model exists: creating it first and then discovering the
        // caller may not put it anywhere would leave an orphan in the engine.
        if (workspaceId != null && !workspaceId.isBlank()) {
            service.require(workspaceId, caller, Capability.EDIT);
        }
        ResponseEntity<String> created = flowable.post("/repository/models", body, request);
        if (created.getStatusCode().is2xxSuccessful() && workspaceId != null && !workspaceId.isBlank()) {
            idOf(created.getBody()).ifPresent(id -> service.assignModel(id, workspaceId, caller));
        }
        return created;
    }

    @PutMapping("/{modelId}")
    public ResponseEntity<String> update(@PathVariable String modelId, @RequestBody String body,
            HttpServletRequest request) {
        requireModel(modelId, request, Capability.EDIT);
        return flowable.put("/repository/models/" + modelId, body, request);
    }

    @DeleteMapping("/{modelId}")
    public ResponseEntity<String> delete(@PathVariable String modelId, HttpServletRequest request) {
        requireModel(modelId, request, Capability.DELETE);
        ResponseEntity<String> deleted = flowable.delete("/repository/models/" + modelId, request);
        if (deleted.getStatusCode().is2xxSuccessful()) {
            // Only after the engine agreed. Unassigning first would orphan the model from
            // its workspace if the delete then failed, silently widening who can see it.
            service.unassignModel(modelId);
        }
        return deleted;
    }

    @GetMapping("/{modelId}/source")
    public ResponseEntity<byte[]> getSource(@PathVariable String modelId, HttpServletRequest request) {
        requireModel(modelId, request, Capability.VIEW);
        return flowable.getBytes("/repository/models/" + modelId + "/source", request);
    }

    @PutMapping("/{modelId}/source")
    public ResponseEntity<String> putSource(@PathVariable String modelId,
            @RequestParam("file") MultipartFile file, HttpServletRequest request) {

        requireModel(modelId, request, Capability.EDIT);
        MultiValueMap<String, Object> form = new LinkedMultiValueMap<>();
        form.add("file", new NamedResource(file));
        return flowable.postMultipart("/repository/models/" + modelId + "/source", form, request);
    }

    static final String WORKSPACE_HEADER = "X-Workspace-Id";

    private void requireModel(String modelId, HttpServletRequest request, Capability capability) {
        Caller caller = callers.resolve(request);
        if (!service.mayTouchModel(modelId, caller, capability)) {
            throw new WorkspaceService.AccessDenied(
                    "You don't have permission to do that with this model.");
        }
    }

    private java.util.Optional<String> idOf(String body) {
        try {
            JsonNode node = json.readTree(body);
            String id = node.path("id").asText(null);
            return java.util.Optional.ofNullable(id);
        } catch (Exception unparseable) {
            return java.util.Optional.empty();
        }
    }

    /** Keeps the uploaded file's name, which Flowable's multipart handler reads. */
    private static final class NamedResource extends ByteArrayResource {
        private final String filename;

        private NamedResource(MultipartFile file) {
            super(readAll(file));
            this.filename = file.getOriginalFilename() == null ? "model.xml" : file.getOriginalFilename();
        }

        private static byte[] readAll(MultipartFile file) {
            try {
                return file.getBytes();
            } catch (Exception unreadable) {
                return new byte[0];
            }
        }

        @Override
        public String getFilename() {
            return filename;
        }
    }

    /** Everything the proxy needs from the upstream headers, in one place. */
    static HttpHeaders forwarded(HttpServletRequest request) {
        HttpHeaders headers = new HttpHeaders();
        String authorization = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (authorization != null) {
            headers.set(HttpHeaders.AUTHORIZATION, authorization);
        }
        String tenant = request.getHeader(CallerResolver.TENANT_HEADER);
        if (tenant != null) {
            headers.set(CallerResolver.TENANT_HEADER, tenant);
        }
        return headers;
    }
}
