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

import org.flowable.validation.ValidationError;

import io.swagger.annotations.ApiModelProperty;

/**
 * One problem reported by {@code flowable-process-validation}, in the shape a client can render.
 *
 * The line and column numbers are only populated when the model was read from XML, which is the
 * case for everything this endpoint validates.
 */
public class ValidationErrorResponse {

    protected String validatorSetName;
    protected String problem;
    protected String defaultDescription;
    protected String processDefinitionId;
    protected String processDefinitionName;
    protected String activityId;
    protected String activityName;
    protected int xmlLineNumber;
    protected int xmlColumnNumber;
    protected boolean warning;

    public static ValidationErrorResponse from(ValidationError error) {
        ValidationErrorResponse response = new ValidationErrorResponse();
        response.setValidatorSetName(error.getValidatorSetName());
        response.setProblem(error.getProblem());
        response.setDefaultDescription(error.getDefaultDescription());
        response.setProcessDefinitionId(error.getProcessDefinitionId());
        response.setProcessDefinitionName(error.getProcessDefinitionName());
        response.setActivityId(error.getActivityId());
        response.setActivityName(error.getActivityName());
        response.setXmlLineNumber(error.getXmlLineNumber());
        response.setXmlColumnNumber(error.getXmlColumnNumber());
        response.setWarning(error.isWarning());
        return response;
    }

    @ApiModelProperty(example = "flowable-usertask")
    public String getValidatorSetName() {
        return validatorSetName;
    }

    public void setValidatorSetName(String validatorSetName) {
        this.validatorSetName = validatorSetName;
    }

    @ApiModelProperty(example = "flowable-usertask-listener-implementation-missing",
            value = "Stable identifier for the problem. Prefer this over defaultDescription when translating or matching.")
    public String getProblem() {
        return problem;
    }

    public void setProblem(String problem) {
        this.problem = problem;
    }

    @ApiModelProperty(value = "Human-readable description, in English only.")
    public String getDefaultDescription() {
        return defaultDescription;
    }

    public void setDefaultDescription(String defaultDescription) {
        this.defaultDescription = defaultDescription;
    }

    @ApiModelProperty(example = "orderProcess")
    public String getProcessDefinitionId() {
        return processDefinitionId;
    }

    public void setProcessDefinitionId(String processDefinitionId) {
        this.processDefinitionId = processDefinitionId;
    }

    public String getProcessDefinitionName() {
        return processDefinitionName;
    }

    public void setProcessDefinitionName(String processDefinitionName) {
        this.processDefinitionName = processDefinitionName;
    }

    @ApiModelProperty(example = "approveOrder", value = "The offending element, when the problem is attached to one.")
    public String getActivityId() {
        return activityId;
    }

    public void setActivityId(String activityId) {
        this.activityId = activityId;
    }

    public String getActivityName() {
        return activityName;
    }

    public void setActivityName(String activityName) {
        this.activityName = activityName;
    }

    @ApiModelProperty(example = "42", value = "Line in the submitted XML, or 0 when the problem has no single location.")
    public int getXmlLineNumber() {
        return xmlLineNumber;
    }

    public void setXmlLineNumber(int xmlLineNumber) {
        this.xmlLineNumber = xmlLineNumber;
    }

    @ApiModelProperty(example = "17")
    public int getXmlColumnNumber() {
        return xmlColumnNumber;
    }

    public void setXmlColumnNumber(int xmlColumnNumber) {
        this.xmlColumnNumber = xmlColumnNumber;
    }

    @ApiModelProperty(value = "A warning does not block deployment; an error does.")
    public boolean isWarning() {
        return warning;
    }

    public void setWarning(boolean warning) {
        this.warning = warning;
    }
}
