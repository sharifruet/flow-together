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
package org.flowable.form.engine.impl.validation;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.function.Predicate;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

import org.apache.commons.lang3.StringUtils;
import org.flowable.form.api.FormFieldValidationError;
import org.flowable.form.engine.impl.util.FormValueUtil;
import org.flowable.form.model.FormField;
import org.flowable.form.model.FormFieldTypes;
import org.flowable.form.model.FormOutcome;
import org.flowable.form.model.Option;
import org.flowable.form.model.OptionFormField;
import org.flowable.form.model.SimpleFormModel;

/**
 * Validates a submission against its form model and reports every failing field
 * (FORM_REQUIREMENTS.md FR-S.3).
 *
 * <p>Presentational fields, containers, expression fields and read-only fields are never
 * validated: the first three carry no value and the last cannot be changed by a submission.
 * Constraints are read from the field's {@code params}, under the same keys the Design builder
 * writes and the Work renderer honours: {@code minLength}, {@code maxLength}, {@code min} /
 * {@code minValue}, {@code max} / {@code maxValue}, {@code pattern}, {@code patternMessage},
 * {@code minDate}, {@code maxDate}.
 *
 * <p>Option lists that come from an {@code optionsExpression} are expected to be evaluated by the
 * caller before validation (the model handed in carries the resolved options), so this class has
 * no expression context. Identity checks for {@code people} / {@code functional-group} are
 * delegated to a {@link Predicate} the engine configures when an IDM engine is present.
 */
public class FormFieldValidator {

    public static final String PARAM_MIN_LENGTH = "minLength";
    public static final String PARAM_MAX_LENGTH = "maxLength";
    public static final String PARAM_MIN = "min";
    public static final String PARAM_MIN_VALUE = "minValue";
    public static final String PARAM_MAX = "max";
    public static final String PARAM_MAX_VALUE = "maxValue";
    public static final String PARAM_PATTERN = "pattern";
    public static final String PARAM_PATTERN_MESSAGE = "patternMessage";
    public static final String PARAM_MIN_DATE = "minDate";
    public static final String PARAM_MAX_DATE = "maxDate";

    /** Answers whether a user id exists; {@code null} means "cannot tell, accept". */
    protected Predicate<String> userExists;
    /** Answers whether a group id exists; {@code null} means "cannot tell, accept". */
    protected Predicate<String> groupExists;

    public List<FormFieldValidationError> validate(SimpleFormModel formModel, Map<String, Object> values, String outcome) {
        Map<String, Object> submitted = values != null ? values : Collections.emptyMap();
        List<FormFieldValidationError> errors = new ArrayList<>();

        if (formModel != null && formModel.getFields() != null) {
            for (FormField field : formModel.allFieldsAsMap().values()) {
                if (!isSubmittable(field)) {
                    continue;
                }
                Object value = submitted.get(field.getId());
                if (isEmpty(value)) {
                    if (field.isRequired() && !FormFieldTypes.UPLOAD.equals(field.getType())) {
                        errors.add(error(field, FormFieldValidationError.CODE_REQUIRED, "is required, but no value was found"));
                    }
                    continue;
                }
                validateValue(field, value, errors);
            }
        }

        validateOutcome(formModel, outcome, errors);
        return errors;
    }

    protected void validateValue(FormField field, Object value, List<FormFieldValidationError> errors) {
        String type = field.getType();
        switch (type) {
            case FormFieldTypes.SINGLE_LINE_TEXT:
            case FormFieldTypes.MULTI_LINE_TEXT:
                validateText(field, String.valueOf(value), errors);
                break;
            case FormFieldTypes.INTEGER:
                validateInteger(field, value, errors);
                break;
            case FormFieldTypes.DECIMAL:
            case FormFieldTypes.AMOUNT:
                validateDecimal(field, value, errors);
                break;
            case FormFieldTypes.DATE:
                validateDate(field, value, errors);
                break;
            case FormFieldTypes.BOOLEAN:
                validateBoolean(field, value, errors);
                break;
            case FormFieldTypes.DROPDOWN:
            case FormFieldTypes.RADIO_BUTTONS:
                validateOption(field, value, errors);
                break;
            case FormFieldTypes.PEOPLE:
                validateIdentity(field, value, userExists, "user", errors);
                break;
            case FormFieldTypes.FUNCTIONAL_GROUP:
                validateIdentity(field, value, groupExists, "group", errors);
                break;
            default:
                // upload and anything unknown: nothing to check here
                break;
        }
    }

    protected void validateText(FormField field, String text, List<FormFieldValidationError> errors) {
        Integer minLength = intParam(field, PARAM_MIN_LENGTH);
        Integer maxLength = intParam(field, PARAM_MAX_LENGTH);
        if (minLength != null && text.length() < minLength) {
            errors.add(error(field, FormFieldValidationError.CODE_MIN_LENGTH, "must be at least " + minLength + " characters"));
        }
        if (maxLength != null && text.length() > maxLength) {
            errors.add(error(field, FormFieldValidationError.CODE_MAX_LENGTH, "must be at most " + maxLength + " characters"));
        }
        String pattern = stringParam(field, PARAM_PATTERN);
        if (StringUtils.isNotEmpty(pattern)) {
            try {
                if (!Pattern.compile(pattern).matcher(text).matches()) {
                    String message = stringParam(field, PARAM_PATTERN_MESSAGE);
                    errors.add(error(field, FormFieldValidationError.CODE_PATTERN,
                            StringUtils.isNotEmpty(message) ? message : "does not match the required pattern"));
                }
            } catch (PatternSyntaxException e) {
                // A broken pattern is a modelling error, not the submitter's; do not block them on it.
            }
        }
    }

    protected void validateInteger(FormField field, Object value, List<FormFieldValidationError> errors) {
        Long number;
        try {
            number = FormValueUtil.toLong(value);
        } catch (Exception e) {
            errors.add(error(field, FormFieldValidationError.CODE_TYPE, "must be a whole number"));
            return;
        }
        validateRange(field, number != null ? new BigDecimal(number) : null, errors);
    }

    protected void validateDecimal(FormField field, Object value, List<FormFieldValidationError> errors) {
        BigDecimal number;
        try {
            number = FormValueUtil.toBigDecimal(value);
        } catch (Exception e) {
            errors.add(error(field, FormFieldValidationError.CODE_TYPE, "must be a number"));
            return;
        }
        validateRange(field, number, errors);
    }

    protected void validateRange(FormField field, BigDecimal number, List<FormFieldValidationError> errors) {
        if (number == null) {
            return;
        }
        BigDecimal min = decimalParam(field, PARAM_MIN, PARAM_MIN_VALUE);
        BigDecimal max = decimalParam(field, PARAM_MAX, PARAM_MAX_VALUE);
        if (min != null && number.compareTo(min) < 0) {
            errors.add(error(field, FormFieldValidationError.CODE_MIN, "must be at least " + min.toPlainString()));
        }
        if (max != null && number.compareTo(max) > 0) {
            errors.add(error(field, FormFieldValidationError.CODE_MAX, "must be at most " + max.toPlainString()));
        }
    }

    protected void validateDate(FormField field, Object value, List<FormFieldValidationError> errors) {
        LocalDate date;
        try {
            date = FormValueUtil.toLocalDate(value);
        } catch (Exception e) {
            errors.add(error(field, FormFieldValidationError.CODE_TYPE, "must be a date in the form yyyy-MM-dd"));
            return;
        }
        if (date == null) {
            return;
        }
        LocalDate minDate = dateParam(field, PARAM_MIN_DATE);
        LocalDate maxDate = dateParam(field, PARAM_MAX_DATE);
        if (minDate != null && date.isBefore(minDate)) {
            errors.add(error(field, FormFieldValidationError.CODE_MIN_DATE, "must not be before " + minDate));
        }
        if (maxDate != null && date.isAfter(maxDate)) {
            errors.add(error(field, FormFieldValidationError.CODE_MAX_DATE, "must not be after " + maxDate));
        }
    }

    protected void validateBoolean(FormField field, Object value, List<FormFieldValidationError> errors) {
        if (value instanceof Boolean) {
            return;
        }
        String text = String.valueOf(value).trim().toLowerCase();
        if (!"true".equals(text) && !"false".equals(text)) {
            errors.add(error(field, FormFieldValidationError.CODE_TYPE, "must be true or false"));
        }
    }

    protected void validateOption(FormField field, Object value, List<FormFieldValidationError> errors) {
        if (!(field instanceof OptionFormField)) {
            return;
        }
        OptionFormField optionField = (OptionFormField) field;
        List<Option> options = optionField.getOptions();
        if (options == null || options.isEmpty()) {
            // Nothing to check against: either free-form or the expression was not resolvable here.
            return;
        }
        String candidate = optionValue(value);
        if (candidate == null) {
            errors.add(error(field, FormFieldValidationError.CODE_OPTION, "is not one of the allowed options"));
            return;
        }
        for (Option option : options) {
            if (candidate.equals(option.getId()) || candidate.equals(option.getName())) {
                return;
            }
        }
        errors.add(error(field, FormFieldValidationError.CODE_OPTION, "'" + candidate + "' is not one of the allowed options"));
    }

    protected void validateIdentity(FormField field, Object value, Predicate<String> exists, String kind, List<FormFieldValidationError> errors) {
        if (exists == null) {
            return;
        }
        String id = optionValue(value);
        if (id == null || !exists.test(id)) {
            errors.add(error(field, FormFieldValidationError.CODE_IDENTITY, "'" + id + "' is not a known " + kind));
        }
    }

    protected void validateOutcome(SimpleFormModel formModel, String outcome, List<FormFieldValidationError> errors) {
        if (formModel == null || outcome == null || formModel.getOutcomes() == null || formModel.getOutcomes().isEmpty()) {
            // A model with outcomes may still be completed without one (a plain task complete);
            // the outcome variable is simply not written. Only a *wrong* outcome is an error.
            return;
        }
        for (FormOutcome formOutcome : formModel.getOutcomes()) {
            if (outcome.equals(formOutcome.getId()) || outcome.equals(formOutcome.getName())) {
                return;
            }
        }
        errors.add(new FormFieldValidationError(null, FormFieldValidationError.CODE_OUTCOME,
                "Outcome '" + outcome + "' is not one of the form's outcomes"));
    }

    // ---- helpers -------------------------------------------------------------------------------

    /** The option/identity id a submission carries, whether posted as a plain id or as {id, name}. */
    protected static String optionValue(Object value) {
        if (value instanceof Map) {
            Object id = ((Map<?, ?>) value).get("id");
            if (id == null) {
                id = ((Map<?, ?>) value).get("name");
            }
            return id != null ? String.valueOf(id) : null;
        }
        return value != null ? String.valueOf(value) : null;
    }

    protected static FormFieldValidationError error(FormField field, String code, String message) {
        return new FormFieldValidationError(field.getId(), code, "Form field " + field.getId() + " " + message);
    }

    protected static String stringParam(FormField field, String... names) {
        for (String name : names) {
            Object raw = field.getParam(name);
            if (raw != null && StringUtils.isNotEmpty(raw.toString())) {
                return raw.toString();
            }
        }
        return null;
    }

    protected static Integer intParam(FormField field, String name) {
        BigDecimal decimal = decimalParam(field, name);
        return decimal != null ? decimal.intValue() : null;
    }

    protected static BigDecimal decimalParam(FormField field, String... names) {
        String raw = stringParam(field, names);
        if (raw == null) {
            return null;
        }
        try {
            return new BigDecimal(raw.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    protected static LocalDate dateParam(FormField field, String name) {
        String raw = stringParam(field, name);
        if (raw == null) {
            return null;
        }
        try {
            return FormValueUtil.toLocalDate(raw);
        } catch (Exception e) {
            return null;
        }
    }

    public static boolean isSubmittable(FormField field) {
        if (field == null || field.getType() == null) {
            return false;
        }
        switch (field.getType()) {
            case FormFieldTypes.CONTAINER:
            case FormFieldTypes.EXPRESSION:
            case FormFieldTypes.HYPERLINK:
            case FormFieldTypes.SPACER:
            case FormFieldTypes.HORIZONTAL_LINE:
            case FormFieldTypes.HEADLINE:
            case FormFieldTypes.HEADLINE_WITH_LINE:
                return false;
            default:
                return !field.isReadOnly();
        }
    }

    public static boolean isEmpty(Object value) {
        if (value == null) {
            return true;
        }
        if (value instanceof CharSequence) {
            return ((CharSequence) value).toString().trim().isEmpty();
        }
        if (value instanceof Collection) {
            return ((Collection<?>) value).isEmpty();
        }
        if (value instanceof Map) {
            return ((Map<?, ?>) value).isEmpty();
        }
        return false;
    }

    public Predicate<String> getUserExists() {
        return userExists;
    }

    public FormFieldValidator setUserExists(Predicate<String> userExists) {
        this.userExists = userExists;
        return this;
    }

    public Predicate<String> getGroupExists() {
        return groupExists;
    }

    public FormFieldValidator setGroupExists(Predicate<String> groupExists) {
        this.groupExists = groupExists;
        return this;
    }
}
