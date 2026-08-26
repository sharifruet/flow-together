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

package org.flowable.cmmn.rest.service.api.repository;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;

import org.apache.http.HttpHeaders;
import org.apache.http.HttpStatus;
import org.apache.http.client.methods.CloseableHttpResponse;
import org.apache.http.client.methods.HttpPost;
import org.apache.http.entity.ContentType;
import org.apache.http.entity.StringEntity;
import org.flowable.cmmn.rest.service.BaseSpringRestTestCase;
import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;

/**
 * Covers {@link CaseModelValidationResource}: validating CMMN 1.1 XML without deploying it.
 */
public class CaseModelValidationResourceTest extends BaseSpringRestTestCase {

    protected static final String URL = "cmmn-repository/model-validation";

    protected static final String VALID_CASE = """
            <?xml version="1.0" encoding="UTF-8"?>
            <definitions xmlns="http://www.omg.org/spec/CMMN/20151109/MODEL"
                         xmlns:flowable="http://flowable.org/cmmn"
                         targetNamespace="http://flowable.org/cmmn">
              <case id="validCase">
                <casePlanModel id="planModel" name="Plan model">
                  <planItem id="planItem1" name="Task One" definitionRef="task1"/>
                  <humanTask id="task1" name="Task 1" flowable:assignee="kermit"/>
                </casePlanModel>
              </case>
            </definitions>
            """;

    /** The decision task references no decision table or service — an error the engine rejects. */
    protected static final String INVALID_CASE = """
            <?xml version="1.0" encoding="UTF-8"?>
            <definitions xmlns="http://www.omg.org/spec/CMMN/20151109/MODEL"
                         xmlns:flowable="http://flowable.org/cmmn"
                         targetNamespace="http://flowable.org/cmmn">
              <case id="invalidCase">
                <casePlanModel id="planModel" name="Plan model">
                  <planItem id="planItem1" name="Decide" definitionRef="decide"/>
                  <decisionTask id="decide" name="Decide"/>
                </casePlanModel>
              </case>
            </definitions>
            """;

    /** An empty plan model is a warning, not an error — the engine deploys it. */
    protected static final String EMPTY_PLAN_MODEL_CASE = """
            <?xml version="1.0" encoding="UTF-8"?>
            <definitions xmlns="http://www.omg.org/spec/CMMN/20151109/MODEL"
                         xmlns:flowable="http://flowable.org/cmmn"
                         targetNamespace="http://flowable.org/cmmn">
              <case id="emptyCase">
                <casePlanModel id="planModel" name="Plan model"/>
              </case>
            </definitions>
            """;

    @Test
    public void testValidateValidCase() throws Exception {
        JsonNode result = validate(VALID_CASE, HttpStatus.SC_OK);

        assertThat(result.get("valid").asBoolean()).isTrue();
        assertThat(result.get("errorCount").asInt()).isZero();
        assertThat(result.get("errors")).isEmpty();
    }

    @Test
    public void testValidateReportsProblemsWithoutDeploying() throws Exception {
        long deploymentsBefore = repositoryService.createDeploymentQuery().count();

        JsonNode result = validate(INVALID_CASE, HttpStatus.SC_OK);

        assertThat(result.get("valid").asBoolean()).isFalse();
        assertThat(result.get("errorCount").asInt()).isPositive();

        JsonNode error = result.get("errors").get(0);
        assertThat(error.get("problem").asText())
                .isEqualTo("flowable-decision-task-missing-decision-table-or-decision-service");
        assertThat(error.get("itemId").asText()).isEqualTo("decide");
        assertThat(error.get("warning").asBoolean()).isFalse();

        // The whole point of the endpoint: a verdict without a side effect.
        assertThat(repositoryService.createDeploymentQuery().count()).isEqualTo(deploymentsBefore);
        assertThat(repositoryService.createCaseDefinitionQuery().caseDefinitionKey("invalidCase").count()).isZero();
    }

    @Test
    public void testWarningsDoNotMakeAModelInvalid() throws Exception {
        JsonNode result = validate(EMPTY_PLAN_MODEL_CASE, HttpStatus.SC_OK);

        assertThat(result.get("warningCount").asInt()).isPositive();
        assertThat(result.get("errorCount").asInt()).isZero();
        assertThat(result.get("valid").asBoolean()).isTrue();
        assertThat(result.get("errors").get(0).get("warning").asBoolean()).isTrue();
    }

    @Test
    public void testValidateRejectsUnreadableXml() throws Exception {
        closeResponse(post("this is not xml at all", HttpStatus.SC_BAD_REQUEST));
    }

    @Test
    public void testValidateRejectsEmptyBody() throws Exception {
        closeResponse(post("", HttpStatus.SC_BAD_REQUEST));
    }

    protected JsonNode validate(String xml, int expectedStatus) throws Exception {
        CloseableHttpResponse response = post(xml, expectedStatus);
        JsonNode result = objectMapper.readTree(response.getEntity().getContent());
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
