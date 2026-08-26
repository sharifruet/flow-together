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

import java.util.ArrayList;
import java.util.List;

import org.flowable.cmmn.validation.validator.ValidationEntry;

import io.swagger.annotations.ApiModelProperty;

/**
 * The outcome of validating a CMMN 1.1 model without deploying it.
 *
 * {@code valid} reflects errors only. Warnings are reported but do not make a model invalid,
 * matching {@code CmmnParserImpl}, which only throws on the error-level entries.
 */
public class CaseModelValidationResponse {

    protected boolean valid;
    protected int errorCount;
    protected int warningCount;
    protected List<CaseValidationEntryResponse> errors = new ArrayList<>();

    public static CaseModelValidationResponse from(List<ValidationEntry> validationEntries) {
        CaseModelValidationResponse response = new CaseModelValidationResponse();
        if (validationEntries != null) {
            for (ValidationEntry entry : validationEntries) {
                response.errors.add(CaseValidationEntryResponse.from(entry));
                if (entry.getLevel() == ValidationEntry.Level.Warning) {
                    response.warningCount++;
                } else {
                    response.errorCount++;
                }
            }
        }
        response.valid = response.errorCount == 0;
        return response;
    }

    @ApiModelProperty(example = "false", value = "True when nothing but warnings was reported, i.e. the model would deploy.")
    public boolean isValid() {
        return valid;
    }

    public void setValid(boolean valid) {
        this.valid = valid;
    }

    @ApiModelProperty(example = "2")
    public int getErrorCount() {
        return errorCount;
    }

    public void setErrorCount(int errorCount) {
        this.errorCount = errorCount;
    }

    @ApiModelProperty(example = "1")
    public int getWarningCount() {
        return warningCount;
    }

    public void setWarningCount(int warningCount) {
        this.warningCount = warningCount;
    }

    public List<CaseValidationEntryResponse> getErrors() {
        return errors;
    }

    public void setErrors(List<CaseValidationEntryResponse> errors) {
        this.errors = errors;
    }
}
