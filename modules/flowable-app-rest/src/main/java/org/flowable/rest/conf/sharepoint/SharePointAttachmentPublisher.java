/* Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package org.flowable.rest.conf.sharepoint;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

import org.flowable.common.engine.api.FlowableException;
import org.flowable.common.engine.api.delegate.event.FlowableEngineEventType;
import org.flowable.common.engine.api.delegate.event.FlowableEntityEvent;
import org.flowable.common.engine.api.delegate.event.FlowableEvent;
import org.flowable.common.engine.api.delegate.event.FlowableEventListener;
import org.flowable.common.engine.api.delegate.event.FlowableEventType;
import org.flowable.common.engine.impl.identity.Authentication;
import org.flowable.common.engine.impl.persistence.entity.ByteArrayEntity;
import org.flowable.engine.history.HistoricProcessInstance;
import org.flowable.engine.impl.cfg.ProcessEngineConfigurationImpl;
import org.flowable.engine.impl.persistence.entity.AttachmentEntity;
import org.flowable.engine.impl.persistence.entity.ExecutionEntity;
import org.flowable.engine.impl.util.CommandContextUtil;
import org.flowable.engine.repository.ProcessDefinition;
import org.flowable.task.api.Task;
import org.flowable.task.api.history.HistoricTaskInstance;
import org.flowable.variable.api.persistence.entity.VariableInstance;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Copies a newly stored task attachment into SharePoint.
 *
 * <p>Runs for every attachment the engine creates — a file uploaded on a task form, a
 * file attached from the task page, or a file a process generates with
 * {@code TaskService.createAttachment}. An attachment that is already a link is left
 * alone, so a file the Work app sent straight to the gateway is not uploaded twice.
 * The bytes stay in the engine as well; the attachment's URL becomes the SharePoint
 * item, which is what the task page opens.
 */
public class SharePointAttachmentPublisher implements FlowableEventListener {

    private static final Logger LOGGER = LoggerFactory.getLogger(SharePointAttachmentPublisher.class);

    private final String gatewayUrl;
    private final boolean required;
    private final HttpClient http;

    public SharePointAttachmentPublisher(String gatewayUrl, boolean required) {
        this.gatewayUrl = gatewayUrl.replaceAll("/+$", "");
        this.required = required;
        this.http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    }

    @Override
    public void onEvent(FlowableEvent event) {
        if (!(event instanceof FlowableEntityEvent entityEvent)) {
            return;
        }
        if (entityEvent.getEntity() instanceof VariableInstance variable && "caseNumber".equals(variable.getName())) {
            if (event.getType() == FlowableEngineEventType.ENTITY_CREATED
                    || event.getType() == FlowableEngineEventType.ENTITY_UPDATED) {
                stampCaseNumber(variable);
            }
            return;
        }
        if (event.getType() != FlowableEngineEventType.ENTITY_CREATED
                || !(entityEvent.getEntity() instanceof AttachmentEntity attachment)) {
            return;
        }
        if (attachment.getUrl() != null && !attachment.getUrl().isBlank()) {
            return;
        }
        ByteArrayEntity content = attachment.getContent();
        if (content == null || content.getBytes() == null || content.getBytes().length == 0) {
            return;
        }
        if (isBlank(attachment.getTaskId()) && isBlank(attachment.getProcessInstanceId())) {
            fail(attachment, "Attachment has no task or process to file it under.", null);
            return;
        }

        try {
            String url = upload(attachment, content.getBytes());
            attachment.setUrl(url);
            LOGGER.info("Published attachment {} for task {} to SharePoint", attachment.getId(),
                    attachment.getTaskId());
        } catch (IOException | InterruptedException | RuntimeException cause) {
            if (cause instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            fail(attachment, "SharePoint did not accept attachment " + attachment.getName(), cause);
        }
    }

    private void fail(AttachmentEntity attachment, String message, Exception cause) {
        if (required) {
            if (cause instanceof RuntimeException runtime && cause.getMessage() != null) {
                throw runtime;
            }
            throw new FlowableException(message, cause);
        }
        LOGGER.warn("{} ({})", message, attachment.getName(), cause);
    }

    private String upload(AttachmentEntity attachment, byte[] bytes) throws IOException, InterruptedException {
        String boundary = "----TogetherFlow" + UUID.randomUUID().toString().replace("-", "");
        byte[] body = multipart(boundary, attachment, bytes);
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(gatewayUrl + "/attachments"))
                .timeout(Duration.ofSeconds(60))
                .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                .POST(HttpRequest.BodyPublishers.ofByteArray(body))
                .build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        if (response.statusCode() / 100 != 2) {
            String detail = response.body() == null ? "" : response.body();
            if (detail.length() > 200) {
                detail = detail.substring(0, 200);
            }
            throw new FlowableException("SharePoint gateway returned " + response.statusCode()
                    + (detail.isBlank() ? "" : ": " + detail));
        }
        return urlFrom(response.body());
    }

    private static byte[] multipart(String boundary, AttachmentEntity attachment, byte[] bytes) throws IOException {
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        writeField(body, boundary, "taskId", attachment.getTaskId());
        writeField(body, boundary, "processInstanceId", attachment.getProcessInstanceId());
        writeField(body, boundary, "taskName", taskName(attachment));
        writeField(body, boundary, "processName", processName(attachment));
        writeField(body, boundary, "caseNumber", caseNumber(attachment));
        writeField(body, boundary, "userName", userName(attachment));
        String filename = safeFilename(attachment.getName());
        String contentType = attachment.getType() != null && attachment.getType().contains("/")
                && !attachment.getType().contains("\r") && !attachment.getType().contains("\n")
                ? attachment.getType() : "application/octet-stream";
        body.write(("--" + boundary + "\r\n").getBytes(StandardCharsets.UTF_8));
        body.write(("Content-Disposition: form-data; name=\"file\"; filename=\"" + filename + "\"\r\n")
                .getBytes(StandardCharsets.UTF_8));
        body.write(("Content-Type: " + contentType + "\r\n\r\n").getBytes(StandardCharsets.UTF_8));
        body.write(bytes);
        body.write(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
        return body.toByteArray();
    }

    private static void writeField(ByteArrayOutputStream body, String boundary, String name, String value)
            throws IOException {
        body.write(("--" + boundary + "\r\n").getBytes(StandardCharsets.UTF_8));
        body.write(("Content-Disposition: form-data; name=\"" + name + "\"\r\n\r\n")
                .getBytes(StandardCharsets.UTF_8));
        String text = value == null ? "" : value.replace("\r", "").replace("\n", "");
        body.write(text.getBytes(StandardCharsets.UTF_8));
        body.write("\r\n".getBytes(StandardCharsets.UTF_8));
    }

    static String urlFrom(String json) {
        if (json == null) {
            throw new FlowableException("SharePoint gateway returned no url.");
        }
        int key = json.indexOf("\"url\"");
        if (key < 0) {
            throw new FlowableException("SharePoint gateway returned no url.");
        }
        int start = json.indexOf('"', json.indexOf(':', key) + 1);
        int end = start < 0 ? -1 : json.indexOf('"', start + 1);
        if (start < 0 || end <= start) {
            throw new FlowableException("SharePoint gateway returned no url.");
        }
        String url = json.substring(start + 1, end);
        if (url.isBlank()) {
            throw new FlowableException("SharePoint gateway returned no url.");
        }
        return url;
    }

    /**
     * The name a person sees on the task, resolved inside the command that created the
     * attachment. A missing context (or a task that has no name) yields an empty label
     * so the library never falls back to printing the task id.
     */
    private static String taskName(AttachmentEntity attachment) {
        if (isBlank(attachment.getTaskId())) {
            return "";
        }
        try {
            ProcessEngineConfigurationImpl engine = CommandContextUtil.getProcessEngineConfiguration();
            if (engine == null) {
                return "";
            }
            Task task = engine.getTaskServiceConfiguration().getTaskEntityManager().findById(attachment.getTaskId());
            if (task != null && !isBlank(task.getName())) {
                return task.getName();
            }
            HistoricTaskInstance historic = engine.getTaskServiceConfiguration().getHistoricTaskInstanceEntityManager()
                    .findById(attachment.getTaskId());
            if (historic != null && !isBlank(historic.getName())) {
                return historic.getName();
            }
        } catch (RuntimeException ex) {
            LOGGER.debug("Task name was not available for {}", attachment.getTaskId(), ex);
        }
        return "";
    }

    /**
     * The case number, such as {@code RES-010203-07102026}. It is the process variable
     * when that has been assigned, and otherwise the process business key.
     */
    private static String caseNumber(AttachmentEntity attachment) {
        if (isBlank(attachment.getProcessInstanceId())) {
            return "";
        }
        try {
            ProcessEngineConfigurationImpl engine = CommandContextUtil.getProcessEngineConfiguration();
            if (engine == null) {
                return "";
            }
            ExecutionEntity execution = engine.getExecutionEntityManager().findById(attachment.getProcessInstanceId());
            if (execution != null) {
                Object value = execution.getVariable("caseNumber");
                if (value != null && !value.toString().isBlank()) {
                    return value.toString().trim();
                }
                if (!isBlank(execution.getBusinessKey())) {
                    return execution.getBusinessKey();
                }
            }
            HistoricProcessInstance historic = engine.getHistoricProcessInstanceEntityManager()
                    .findById(attachment.getProcessInstanceId());
            if (historic != null && !isBlank(historic.getBusinessKey())) {
                return historic.getBusinessKey();
            }
        } catch (RuntimeException ex) {
            LOGGER.debug("Case number was not available for {}", attachment.getProcessInstanceId(), ex);
        }
        return "";
    }

    /**
     * The sign-in id of the task's user. A file generated for a task names that task's
     * assignee. A file uploaded onto a task that nobody is assigned to names the person
     * who uploaded it.
     */
    private static String userName(AttachmentEntity attachment) {
        String assignee = taskAssignee(attachment);
        if (!isBlank(assignee)) {
            return assignee;
        }
        String actor = Authentication.getAuthenticatedUserId();
        return actor == null ? "" : actor;
    }

    private static String taskAssignee(AttachmentEntity attachment) {
        if (isBlank(attachment.getTaskId())) {
            return "";
        }
        try {
            ProcessEngineConfigurationImpl engine = CommandContextUtil.getProcessEngineConfiguration();
            if (engine == null) {
                return "";
            }
            Task task = engine.getTaskServiceConfiguration().getTaskEntityManager().findById(attachment.getTaskId());
            if (task != null && !isBlank(task.getAssignee())) {
                return task.getAssignee();
            }
            HistoricTaskInstance historic = engine.getTaskServiceConfiguration().getHistoricTaskInstanceEntityManager()
                    .findById(attachment.getTaskId());
            if (historic != null && !isBlank(historic.getAssignee())) {
                return historic.getAssignee();
            }
        } catch (RuntimeException ex) {
            LOGGER.debug("Task assignee was not available for {}", attachment.getTaskId(), ex);
        }
        return "";
    }

    /**
     * Writes the case number onto files already in the library. The employee often
     * uploads before the process assigns {@code RES-…}, so the number arrives later.
     * A failure here is logged and does not roll back the process: the file is already stored.
     */
    private void stampCaseNumber(VariableInstance variable) {
        String processInstanceId = variable.getProcessInstanceId();
        if (isBlank(processInstanceId)) {
            return;
        }
        Object raw;
        try {
            raw = variable.getValue();
        } catch (RuntimeException ex) {
            LOGGER.debug("Case number value was not readable for {}", processInstanceId, ex);
            return;
        }
        String caseNumber = raw == null ? "" : raw.toString().trim();
        if (caseNumber.isEmpty()) {
            return;
        }
        try {
            String query = "caseNumber=" + URLEncoder.encode(caseNumber, StandardCharsets.UTF_8);
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(gatewayUrl + "/sharepoint/processes/" + processInstanceId + "/case?" + query))
                    .timeout(Duration.ofSeconds(15))
                    .POST(HttpRequest.BodyPublishers.noBody())
                    .build();
            HttpResponse<String> response = http.send(request,
                    HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() / 100 != 2) {
                LOGGER.warn("SharePoint did not record case number {} for process {} ({})", caseNumber,
                        processInstanceId, response.statusCode());
            }
        } catch (IOException | InterruptedException | RuntimeException cause) {
            if (cause instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            LOGGER.warn("SharePoint did not record case number {} for process {}", caseNumber, processInstanceId,
                    cause);
        }
    }

    /** The process definition name, such as "Resignation Process New", never the instance id. */
    private static String processName(AttachmentEntity attachment) {
        if (isBlank(attachment.getProcessInstanceId())) {
            return "";
        }
        try {
            ProcessEngineConfigurationImpl engine = CommandContextUtil.getProcessEngineConfiguration();
            if (engine == null) {
                return "";
            }
            HistoricProcessInstance historic = engine.getHistoricProcessInstanceEntityManager()
                    .findById(attachment.getProcessInstanceId());
            if (historic != null && !isBlank(historic.getProcessDefinitionName())) {
                return historic.getProcessDefinitionName();
            }
            String definitionId = historic != null ? historic.getProcessDefinitionId() : null;
            if (isBlank(definitionId)) {
                ExecutionEntity execution = engine.getExecutionEntityManager().findById(attachment.getProcessInstanceId());
                definitionId = execution == null ? null : execution.getProcessDefinitionId();
            }
            if (isBlank(definitionId)) {
                return "";
            }
            ProcessDefinition definition = engine.getDeploymentManager().findDeployedProcessDefinitionById(definitionId);
            if (definition == null) {
                return "";
            }
            if (!isBlank(definition.getName())) {
                return definition.getName();
            }
            return definition.getKey() == null ? "" : definition.getKey();
        } catch (RuntimeException ex) {
            LOGGER.debug("Process name was not available for {}", attachment.getProcessInstanceId(), ex);
        }
        return "";
    }

    private static String safeFilename(String name) {
        String cleaned = name == null ? "" : name.replaceAll("[\\r\\n\"]", "");
        return cleaned.isBlank() ? "file" : cleaned;
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    @Override
    public boolean isFailOnException() {
        return required;
    }

    @Override
    public boolean isFireOnTransactionLifecycleEvent() {
        return false;
    }

    @Override
    public String getOnTransaction() {
        return null;
    }

    @Override
    public Collection<? extends FlowableEventType> getTypes() {
        return List.of(FlowableEngineEventType.ENTITY_CREATED, FlowableEngineEventType.ENTITY_UPDATED);
    }
}
