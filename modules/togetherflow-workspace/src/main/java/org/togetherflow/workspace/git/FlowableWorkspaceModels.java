package org.togetherflow.workspace.git;

import java.util.ArrayList;
import java.util.List;

import jakarta.servlet.http.HttpServletRequest;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import org.togetherflow.workspace.FlowableClient;
import org.togetherflow.workspace.WorkspaceStore;

/**
 * The models in a workspace, read from and written to Flowable's model repository.
 *
 * <p>Calls go out as the *caller*, carrying their credentials, so a pull cannot write a
 * model the person pulling could not have written by hand.
 */
public class FlowableWorkspaceModels implements WorkspaceModels {

    private static final Logger LOGGER = LoggerFactory.getLogger(FlowableWorkspaceModels.class);

    private final WorkspaceStore store;
    private final FlowableClient flowable;
    private final ObjectMapper json = new ObjectMapper();

    public FlowableWorkspaceModels(WorkspaceStore store, FlowableClient flowable) {
        this.store = store;
        this.flowable = flowable;
    }

    @Override
    public List<ExportedModel> export(String workspaceId, HttpServletRequest request) {
        List<ExportedModel> exported = new ArrayList<>();
        for (String modelId : store.modelIdsIn(workspaceId)) {
            try {
                ResponseEntity<String> model = flowable.get("/repository/models/" + modelId, request);
                if (!model.getStatusCode().is2xxSuccessful() || model.getBody() == null) {
                    continue;
                }
                JsonNode node = json.readTree(model.getBody());
                ResponseEntity<byte[]> source =
                        flowable.getBytes("/repository/models/" + modelId + "/source", request);
                String content = source.getStatusCode().is2xxSuccessful() && source.getBody() != null
                        ? new String(source.getBody(), java.nio.charset.StandardCharsets.UTF_8)
                        : "";
                exported.add(new ExportedModel(modelId, node.path("key").asText(modelId),
                        node.path("name").asText(""), node.path("category").asText(""), content));
            } catch (Exception unreadable) {
                // One unreadable model must not stop the commit: the rest is still worth
                // recording, and a missing file is visible in review.
                LOGGER.warn("Skipping model {} while exporting workspace {}", modelId, workspaceId,
                        unreadable);
            }
        }
        return exported;
    }

    @Override
    public ImportSummary apply(String workspaceId, List<ExportedModel> models,
            HttpServletRequest request) {

        List<String> created = new ArrayList<>();
        List<String> updated = new ArrayList<>();
        List<String> failed = new ArrayList<>();

        for (ExportedModel model : models) {
            try {
                String existingId = findByKey(workspaceId, model.key(), request);
                if (existingId == null) {
                    String body = json.createObjectNode()
                            .put("name", model.name())
                            .put("key", model.key())
                            .put("category", model.category())
                            .toString();
                    ResponseEntity<String> response =
                            flowable.post("/repository/models", body, request);
                    if (!response.getStatusCode().is2xxSuccessful()) {
                        failed.add(model.key());
                        continue;
                    }
                    String id = json.readTree(response.getBody()).path("id").asText(null);
                    if (id == null) {
                        failed.add(model.key());
                        continue;
                    }
                    store.assignModel(id, workspaceId);
                    putSource(id, model.source(), request);
                    created.add(model.key());
                } else {
                    putSource(existingId, model.source(), request);
                    updated.add(model.key());
                }
            } catch (Exception cause) {
                LOGGER.warn("Could not apply model {} to workspace {}", model.key(), workspaceId, cause);
                failed.add(model.key());
            }
        }
        return new ImportSummary(created, updated, failed);
    }

    /** Matches on key *within the workspace*, so a pull cannot adopt somebody else's model. */
    private String findByKey(String workspaceId, String key, HttpServletRequest request)
            throws Exception {

        for (String modelId : store.modelIdsIn(workspaceId)) {
            ResponseEntity<String> model = flowable.get("/repository/models/" + modelId, request);
            if (model.getStatusCode().is2xxSuccessful() && model.getBody() != null
                    && json.readTree(model.getBody()).path("key").asText("").equals(key)) {
                return modelId;
            }
        }
        return null;
    }

    private void putSource(String modelId, String source, HttpServletRequest request) {
        org.springframework.util.MultiValueMap<String, Object> form =
                new org.springframework.util.LinkedMultiValueMap<>();
        form.add("file", new org.springframework.core.io.ByteArrayResource(
                (source == null ? "" : source).getBytes(java.nio.charset.StandardCharsets.UTF_8)) {
            @Override
            public String getFilename() {
                return "model.xml";
            }
        });
        flowable.postMultipart("/repository/models/" + modelId + "/source", form, request);
    }
}
