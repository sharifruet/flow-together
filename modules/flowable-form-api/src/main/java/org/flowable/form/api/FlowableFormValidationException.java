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
package org.flowable.form.api;

import java.util.Collections;
import java.util.List;

import org.flowable.common.engine.api.FlowableIllegalArgumentException;

/**
 * A form submission that does not satisfy its form model. Carries every failing field, so a client
 * can show them all at once rather than one per round trip.
 */
public class FlowableFormValidationException extends FlowableIllegalArgumentException {

    private static final long serialVersionUID = 1L;

    protected final List<FormFieldValidationError> errors;

    public FlowableFormValidationException(String message) {
        super(message);
        this.errors = Collections.emptyList();
    }

    public FlowableFormValidationException(String message, Throwable cause) {
        super(message, cause);
        this.errors = Collections.emptyList();
    }

    public FlowableFormValidationException(List<FormFieldValidationError> errors) {
        super(describe(errors));
        this.errors = List.copyOf(errors);
    }

    public List<FormFieldValidationError> getErrors() {
        return errors;
    }

    protected static String describe(List<FormFieldValidationError> errors) {
        StringBuilder sb = new StringBuilder("Form validation failed");
        if (errors != null && !errors.isEmpty()) {
            sb.append(": ");
            for (int i = 0; i < errors.size(); i++) {
                if (i > 0) {
                    sb.append("; ");
                }
                sb.append(errors.get(i));
            }
        }
        return sb.toString();
    }
}
