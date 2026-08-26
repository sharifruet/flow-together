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

import java.io.ByteArrayInputStream;
import java.util.List;

import jakarta.servlet.http.HttpServletRequest;

import org.flowable.bpmn.converter.BpmnXMLConverter;
import org.flowable.bpmn.model.BpmnModel;
import org.flowable.common.engine.api.FlowableIllegalArgumentException;
import org.flowable.common.engine.impl.util.io.InputStreamSource;
import org.flowable.engine.impl.cfg.ProcessEngineConfigurationImpl;
import org.flowable.validation.ProcessValidator;
import org.flowable.validation.ValidationError;
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
 * Validates a BPMN 2.0 model without deploying it.
 *
 * The modeler needs the engine's own verdict before a deploy, not an approximation of it: a
 * client-side check can only encode what someone remembered to reimplement, and it drifts as
 * soon as a validator is added here. This runs the very {@link ProcessValidator} the engine
 * uses at deployment time, so what it reports and what a deploy would reject are the same list.
 *
 * Nothing is persisted, no deployment is created, and no command is executed against the
 * database — this is a pure function of the submitted XML.
 */
@RestController
@Api(tags = { "Models" }, authorizations = { @Authorization(value = "basicAuth") })
public class ModelValidationResource {

    @Autowired
    protected ProcessEngineConfigurationImpl processEngineConfiguration;

    @ApiOperation(value = "Validate a BPMN 2.0 model without deploying it", tags = { "Models" },
            consumes = "application/xml", produces = "application/json",
            notes = "Runs the engine's own process validator over the submitted XML and returns every problem it "
                    + "reports. Nothing is deployed and nothing is stored. A model whose only problems are warnings "
                    + "is reported as valid, because the engine would deploy it.")
    @ApiResponses(value = {
            @ApiResponse(code = 200, message = "Indicates the XML was read and the validation result is returned. "
                    + "A model that failed validation is still a 200 — the errors are in the body."),
            @ApiResponse(code = 400, message = "Indicates the request body was empty or could not be read as BPMN 2.0 XML.")
    })
    @PostMapping(value = "/repository/model-validation", consumes = { "application/xml", "text/xml" }, produces = "application/json")
    public ModelValidationResponse validateModel(@RequestBody byte[] bpmnXml, HttpServletRequest request) {
        if (bpmnXml == null || bpmnXml.length == 0) {
            throw new FlowableIllegalArgumentException("A BPMN 2.0 XML body is required.");
        }

        // The request's own charset wins when it declares one; otherwise the engine's, which is
        // what a deployment of the same bytes would be read with.
        String encoding = request.getCharacterEncoding();
        if (encoding == null) {
            encoding = processEngineConfiguration.getXmlEncoding();
        }

        BpmnModel bpmnModel;
        try {
            /*
             * Schema validation is deliberately off. It is a separate question from "would this
             * deploy": the engine's own default (`bpmnStrictValidation`) leaves it to deployment
             * configuration, and turning it on here would reject a model for reasons the process
             * validator below never reports, giving the modeler a verdict the deploy does not share.
             *
             * XXE and DTD handling do not depend on either flag — BpmnXMLConverter disables
             * external entities, external DTD and external schema access unconditionally, on the
             * same factory it parses with. `enableSafeBpmnXml` is nonetheless passed as **true**
             * even though it is unreachable while `validateSchema` is false: it is only consulted
             * inside `if (validateSchema)`, and the false/false combination is the one branch that
             * reads the document through a reader the converter has not hardened. Anyone who later
             * turns schema validation on here inherits the safe path rather than that one.
             */
            bpmnModel = new BpmnXMLConverter().convertToBpmnModel(
                    new InputStreamSource(new ByteArrayInputStream(bpmnXml)), false, true, encoding);
        } catch (Exception e) {
            // Not well-formed BPMN 2.0 is a bad request body, not a model with problems: there is
            // no model to report problems against.
            throw new FlowableIllegalArgumentException("Could not read the request body as BPMN 2.0 XML: " + e.getMessage(), e);
        }

        ProcessValidator processValidator = processEngineConfiguration.getProcessValidator();
        if (processValidator == null) {
            throw new FlowableIllegalArgumentException("No process validator is configured on this engine.");
        }

        List<ValidationError> validationErrors = processValidator.validate(bpmnModel);
        return ModelValidationResponse.from(validationErrors);
    }
}
