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

import java.io.ByteArrayInputStream;
import java.util.List;

import jakarta.servlet.http.HttpServletRequest;

import org.flowable.cmmn.converter.CmmnXmlConverter;
import org.flowable.cmmn.engine.CmmnEngineConfiguration;
import org.flowable.cmmn.model.CmmnModel;
import org.flowable.cmmn.validation.CaseValidator;
import org.flowable.cmmn.validation.validator.ValidationEntry;
import org.flowable.common.engine.api.FlowableIllegalArgumentException;
import org.flowable.common.engine.impl.util.io.InputStreamSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import io.swagger.annotations.ApiResponse;
import io.swagger.annotations.ApiResponses;
import io.swagger.annotations.Authorization;

/**
 * Validates a CMMN 1.1 model without deploying it — the CMMN counterpart of the BPMN
 * {@code /repository/model-validation} resource.
 *
 * Runs the very {@link CaseValidator} {@code CmmnParserImpl} runs at deployment time, so what a
 * modeler is shown and what a deploy would reject are the same list. Nothing is persisted and no
 * deployment is created.
 */
@RestController
@Api(tags = { "Case Definitions" }, authorizations = { @Authorization(value = "basicAuth") })
public class CaseModelValidationResource {

    @Autowired
    protected CmmnEngineConfiguration cmmnEngineConfiguration;

    @ApiOperation(value = "Validate a CMMN 1.1 model without deploying it", tags = { "Case Definitions" },
            consumes = "application/xml", produces = "application/json",
            notes = "Runs the engine's own case validator over the submitted XML and returns every problem it "
                    + "reports. Nothing is deployed and nothing is stored. A model whose only problems are warnings "
                    + "is reported as valid, because the engine would deploy it.")
    @ApiResponses(value = {
            @ApiResponse(code = 200, message = "Indicates the XML was read and the validation result is returned. "
                    + "A model that failed validation is still a 200 — the errors are in the body."),
            @ApiResponse(code = 400, message = "Indicates the request body was empty or could not be read as CMMN 1.1 XML.")
    })
    @PostMapping(value = "/cmmn-repository/model-validation", consumes = { "application/xml", "text/xml" }, produces = "application/json")
    public CaseModelValidationResponse validateModel(@RequestBody byte[] cmmnXml, HttpServletRequest request) {
        if (cmmnXml == null || cmmnXml.length == 0) {
            throw new FlowableIllegalArgumentException("A CMMN 1.1 XML body is required.");
        }

        // The request's own charset wins when it declares one; otherwise the engine's, which is
        // what a deployment of the same bytes would be read with.
        String encoding = request.getCharacterEncoding();
        if (encoding == null) {
            encoding = cmmnEngineConfiguration.getXmlEncoding();
        }

        CmmnModel cmmnModel;
        try {
            // Schema validation is off for the same reason as the BPMN resource: it answers a
            // different question from "would this deploy", and the engine leaves it to deployment
            // configuration. External entity, DTD and schema access are disabled by the converter
            // regardless of either flag. `enableSafeXml` is passed true anyway — it is only read
            // inside `if (validateSchema)`, and false/false is the one branch that parses through
            // a reader the converter has not hardened. See ModelValidationResource for the detail.
            cmmnModel = new CmmnXmlConverter().convertToCmmnModel(
                    new InputStreamSource(new ByteArrayInputStream(cmmnXml)), false, true, encoding);
        } catch (Exception e) {
            // Not well-formed CMMN 1.1 is a bad request body, not a model with problems: there is
            // no model to report problems against.
            throw new FlowableIllegalArgumentException("Could not read the request body as CMMN 1.1 XML: " + e.getMessage(), e);
        }

        CaseValidator caseValidator = cmmnEngineConfiguration.getCaseValidator();
        if (caseValidator == null) {
            throw new FlowableIllegalArgumentException("No case validator is configured on this engine.");
        }

        List<ValidationEntry> validationEntries = caseValidator.validate(cmmnModel);
        return CaseModelValidationResponse.from(validationEntries);
    }
}
