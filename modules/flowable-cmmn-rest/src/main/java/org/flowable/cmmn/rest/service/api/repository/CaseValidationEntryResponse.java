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

import org.flowable.cmmn.validation.validator.ValidationEntry;

import io.swagger.annotations.ApiModelProperty;

/**
 * One problem reported by {@code flowable-case-validation}, in the shape a client can render.
 *
 * Deliberately shaped like the BPMN {@code ValidationErrorResponse} so a modeler can render both
 * with one component, including the {@code warning} flag: the CMMN validator models severity as an
 * enum, which is flattened here rather than exposing a second convention for the same idea.
 */
public class CaseValidationEntryResponse {

    protected String validatorSetName;
    protected String problem;
    protected String defaultDescription;
    protected String caseDefinitionId;
    protected String caseDefinitionName;
    protected String itemId;
    protected String itemName;
    protected int xmlLineNumber;
    protected int xmlColumnNumber;
    protected boolean warning;

    public static CaseValidationEntryResponse from(ValidationEntry entry) {
        CaseValidationEntryResponse response = new CaseValidationEntryResponse();
        response.setValidatorSetName(entry.getValidatorSetName());
        response.setProblem(entry.getProblem());
        response.setDefaultDescription(entry.getDefaultDescription());
        response.setCaseDefinitionId(entry.getCaseDefinitionId());
        response.setCaseDefinitionName(entry.getCaseDefinitionName());
        response.setItemId(entry.getItemId());
        response.setItemName(entry.getItemName());
        response.setXmlLineNumber(entry.getXmlLineNumber());
        response.setXmlColumnNumber(entry.getXmlColumnNumber());
        response.setWarning(entry.getLevel() == ValidationEntry.Level.Warning);
        return response;
    }

    @ApiModelProperty(example = "flowable-humantask")
    public String getValidatorSetName() {
        return validatorSetName;
    }

    public void setValidatorSetName(String validatorSetName) {
        this.validatorSetName = validatorSetName;
    }

    @ApiModelProperty(value = "Stable identifier for the problem. Prefer this over defaultDescription when translating or matching.")
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

    @ApiModelProperty(example = "orderCase")
    public String getCaseDefinitionId() {
        return caseDefinitionId;
    }

    public void setCaseDefinitionId(String caseDefinitionId) {
        this.caseDefinitionId = caseDefinitionId;
    }

    public String getCaseDefinitionName() {
        return caseDefinitionName;
    }

    public void setCaseDefinitionName(String caseDefinitionName) {
        this.caseDefinitionName = caseDefinitionName;
    }

    @ApiModelProperty(example = "planItem1", value = "The offending plan item or element, when the problem is attached to one.")
    public String getItemId() {
        return itemId;
    }

    public void setItemId(String itemId) {
        this.itemId = itemId;
    }

    public String getItemName() {
        return itemName;
    }

    public void setItemName(String itemName) {
        this.itemName = itemName;
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
