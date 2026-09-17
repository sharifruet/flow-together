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
package org.flowable.common.rest.exception;

import java.util.ArrayList;
import java.util.List;

import org.flowable.form.api.FlowableFormValidationException;
import org.flowable.form.api.FormFieldValidationError;

/**
 * A 400 for a form submission the engine refused, carrying every failing field so a client can
 * show them all at once. {@code code} is stable and meant for translation; {@code message} is the
 * engine's default wording.
 */
public class FormValidationErrorInfo extends ErrorInfo {

    protected List<FieldError> fields = new ArrayList<>();

    public FormValidationErrorInfo(FlowableFormValidationException ex) {
        super("Form validation failed", ex);
        for (FormFieldValidationError error : ex.getErrors()) {
            fields.add(new FieldError(error.getFieldId(), error.getCode(), error.getMessage()));
        }
    }

    public List<FieldError> getFields() {
        return fields;
    }

    public void setFields(List<FieldError> fields) {
        this.fields = fields;
    }

    public static class FieldError {

        protected String id;
        protected String code;
        protected String message;

        public FieldError(String id, String code, String message) {
            this.id = id;
            this.code = code;
            this.message = message;
        }

        public String getId() {
            return id;
        }

        public String getCode() {
            return code;
        }

        public String getMessage() {
            return message;
        }
    }
}
