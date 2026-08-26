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

package org.flowable.rest.service.api.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;

import org.apache.http.HttpHeaders;
import org.apache.http.HttpStatus;
import org.apache.http.client.methods.CloseableHttpResponse;
import org.apache.http.client.methods.HttpPost;
import org.apache.http.entity.ContentType;
import org.apache.http.entity.StringEntity;
import org.flowable.rest.service.BaseSpringRestTestCase;
import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

/**
 * Covers {@link ModelValidationResource}: validating BPMN 2.0 XML without deploying it.
 */
public class ModelValidationResourceTest extends BaseSpringRestTestCase {

    protected static final String URL = "repository/model-validation";

    protected static final String VALID_PROCESS = """
            <?xml version="1.0" encoding="UTF-8"?>
            <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
                         xmlns:flowable="http://flowable.org/bpmn"
                         targetNamespace="http://flowable.org/test">
              <process id="validProcess" name="Valid process" isExecutable="true">
                <startEvent id="start"/>
                <sequenceFlow id="flow1" sourceRef="start" targetRef="approve"/>
                <userTask id="approve" name="Approve" flowable:assignee="kermit"/>
                <sequenceFlow id="flow2" sourceRef="approve" targetRef="end"/>
                <endEvent id="end"/>
              </process>
            </definitions>
            """;

    /** The service task has no class, expression or delegate — an error the engine also rejects. */
    protected static final String INVALID_PROCESS = """
            <?xml version="1.0" encoding="UTF-8"?>
            <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
                         xmlns:flowable="http://flowable.org/bpmn"
                         targetNamespace="http://flowable.org/test">
              <process id="invalidProcess" name="Invalid process" isExecutable="true">
                <startEvent id="start"/>
                <sequenceFlow id="flow1" sourceRef="start" targetRef="doWork"/>
                <serviceTask id="doWork" name="Do work"/>
                <sequenceFlow id="flow2" sourceRef="doWork" targetRef="end"/>
                <endEvent id="end"/>
              </process>
            </definitions>
            """;

    @Test
    public void testValidateValidProcess() throws Exception {
        JsonNode result = validate(VALID_PROCESS, HttpStatus.SC_OK);

        assertThat(result.get("valid").asBoolean()).isTrue();
        assertThat(result.get("errorCount").asInt()).isZero();
        assertThat(result.get("errors")).isEmpty();
    }

    @Test
    public void testValidateReportsProblemsWithoutDeploying() throws Exception {
        long deploymentsBefore = repositoryService.createDeploymentQuery().count();

        JsonNode result = validate(INVALID_PROCESS, HttpStatus.SC_OK);

        assertThat(result.get("valid").asBoolean()).isFalse();
        assertThat(result.get("errorCount").asInt()).isPositive();

        JsonNode error = result.get("errors").get(0);
        assertThat(error.get("problem").asText()).isEqualTo("flowable-servicetask-missing-implementation");
        assertThat(error.get("activityId").asText()).isEqualTo("doWork");
        assertThat(error.get("warning").asBoolean()).isFalse();
        assertThat(error.get("defaultDescription").asText()).isNotEmpty();

        // The whole point of the endpoint: a verdict without a side effect.
        assertThat(repositoryService.createDeploymentQuery().count()).isEqualTo(deploymentsBefore);
        assertThat(repositoryService.createProcessDefinitionQuery().processDefinitionKey("invalidProcess").count()).isZero();
    }

    @Test
    public void testValidateRejectsUnreadableXml() throws Exception {
        closeResponse(post("this is not xml at all", HttpStatus.SC_BAD_REQUEST));
    }

    @Test
    public void testValidateRejectsEmptyBody() throws Exception {
        closeResponse(post("", HttpStatus.SC_BAD_REQUEST));
    }

    protected JsonNode validate(String xml, int expectedStatus) {
        CloseableHttpResponse response = post(xml, expectedStatus);
        JsonNode result = readContent(response);
        closeResponse(response);
        return result;
    }

    protected CloseableHttpResponse post(String xml, int expectedStatus) {
        HttpPost httpPost = new HttpPost(SERVER_URL_PREFIX + URL);
        ContentType contentType = ContentType.create("application/xml", StandardCharsets.UTF_8);
        // Set on the request, not only on the entity: the test harness defaults a request with
        // no Content-Type *header* to application/json, which this endpoint does not consume.
        httpPost.setHeader(HttpHeaders.CONTENT_TYPE, contentType.toString());
        httpPost.setEntity(new StringEntity(xml, contentType));
        return executeRequest(httpPost, expectedStatus);
    }
}
