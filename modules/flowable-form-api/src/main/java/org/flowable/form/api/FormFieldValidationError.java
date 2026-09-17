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

import java.io.Serializable;

/**
 * One field that failed validation on submission. {@code code} is stable and meant for clients to
 * translate; {@code message} is a developer-facing default.
 */
public class FormFieldValidationError implements Serializable {

    private static final long serialVersionUID = 1L;

    public static final String CODE_REQUIRED = "required";
    public static final String CODE_TYPE = "type";
    public static final String CODE_MIN = "min";
    public static final String CODE_MAX = "max";
    public static final String CODE_MIN_LENGTH = "minLength";
    public static final String CODE_MAX_LENGTH = "maxLength";
    public static final String CODE_PATTERN = "pattern";
    public static final String CODE_MIN_DATE = "minDate";
    public static final String CODE_MAX_DATE = "maxDate";
    public static final String CODE_OPTION = "option";
    public static final String CODE_IDENTITY = "identity";
    public static final String CODE_OUTCOME = "outcome";
    public static final String CODE_UPLOAD = "upload";

    protected final String fieldId;
    protected final String code;
    protected final String message;

    public FormFieldValidationError(String fieldId, String code, String message) {
        this.fieldId = fieldId;
        this.code = code;
        this.message = message;
    }

    public String getFieldId() {
        return fieldId;
    }

    public String getCode() {
        return code;
    }

    public String getMessage() {
        return message;
    }

    @Override
    public String toString() {
        return fieldId + ": " + code + " (" + message + ")";
    }
}
