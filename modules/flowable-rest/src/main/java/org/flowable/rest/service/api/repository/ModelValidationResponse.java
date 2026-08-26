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

import java.util.ArrayList;
import java.util.List;

import org.flowable.validation.ValidationError;

import io.swagger.annotations.ApiModelProperty;

/**
 * The outcome of validating a BPMN 2.0 model without deploying it.
 *
 * {@code valid} reflects errors only. Warnings are reported but do not make a model invalid,
 * because the engine deploys a model that carries them.
 */
public class ModelValidationResponse {

    protected boolean valid;
    protected int errorCount;
    protected int warningCount;
    protected List<ValidationErrorResponse> errors = new ArrayList<>();

    public static ModelValidationResponse from(List<ValidationError> validationErrors) {
        ModelValidationResponse response = new ModelValidationResponse();
        if (validationErrors != null) {
            for (ValidationError error : validationErrors) {
                response.errors.add(ValidationErrorResponse.from(error));
                if (error.isWarning()) {
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

    public List<ValidationErrorResponse> getErrors() {
        return errors;
    }

    public void setErrors(List<ValidationErrorResponse> errors) {
        this.errors = errors;
    }
}
