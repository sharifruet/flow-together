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
package org.flowable.form.engine.test.validation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.flowable.form.api.FormFieldValidationError;
import org.flowable.form.engine.impl.validation.FormFieldValidator;
import org.flowable.form.model.FormField;
import org.flowable.form.model.FormFieldTypes;
import org.flowable.form.model.FormOutcome;
import org.flowable.form.model.Option;
import org.flowable.form.model.OptionFormField;
import org.flowable.form.model.SimpleFormModel;
import org.junit.jupiter.api.Test;

/**
 * FORM_REQUIREMENTS.md FR-S.3: one test per rule, and one proving every failing field is reported at once.
 */
public class FormFieldValidatorTest {

    protected FormFieldValidator validator = new FormFieldValidator();

    @Test
    public void requiredFieldsAreReportedTogether() {
        SimpleFormModel model = model(field("a", FormFieldTypes.SINGLE_LINE_TEXT, true), field("b", FormFieldTypes.INTEGER, true),
                field("c", FormFieldTypes.BOOLEAN, false));

        List<FormFieldValidationError> errors = validator.validate(model, Map.of("c", "  "), null);

        assertThat(errors).extracting(FormFieldValidationError::getFieldId, FormFieldValidationError::getCode)
                .containsExactlyInAnyOrder(tuple("a", "required"), tuple("b", "required"));
    }

    @Test
    public void presentationalReadOnlyAndExpressionFieldsAreSkipped() {
        FormField readOnly = field("ro", FormFieldTypes.SINGLE_LINE_TEXT, true);
        readOnly.setReadOnly(true);
        SimpleFormModel model = model(field("h", FormFieldTypes.HEADLINE, true), field("e", FormFieldTypes.EXPRESSION, true), readOnly);

        assertThat(validator.validate(model, Map.of(), null)).isEmpty();
    }

    @Test
    public void textLengthAndPattern() {
        FormField text = field("t", FormFieldTypes.SINGLE_LINE_TEXT, false);
        text.setParams(Map.of("minLength", "3", "maxLength", "5", "pattern", "[a-z]+", "patternMessage", "lowercase letters only"));
        SimpleFormModel model = model(text);

        assertThat(codes(validator.validate(model, Map.of("t", "ab"), null))).containsExactly("minLength");
        assertThat(codes(validator.validate(model, Map.of("t", "abcdefg"), null))).containsExactly("maxLength");
        assertThat(validator.validate(model, Map.of("t", "ABC"), null))
                .extracting(FormFieldValidationError::getCode, FormFieldValidationError::getMessage)
                .containsExactly(tuple("pattern", "Form field t lowercase letters only"));
        assertThat(validator.validate(model, Map.of("t", "abcd"), null)).isEmpty();
    }

    @Test
    public void numbersTypeAndRange() {
        FormField integer = field("i", FormFieldTypes.INTEGER, false);
        integer.setParams(Map.of("min", "1", "max", "10"));
        FormField amount = field("a", FormFieldTypes.AMOUNT, false);
        amount.setParams(Map.of("minValue", "0.5", "maxValue", "99.99"));
        SimpleFormModel model = model(integer, amount);

        assertThat(codes(validator.validate(model, Map.of("i", "x", "a", "abc"), null))).containsExactly("type", "type");
        assertThat(codes(validator.validate(model, Map.of("i", "0", "a", "0.25"), null))).containsExactly("min", "min");
        assertThat(codes(validator.validate(model, Map.of("i", 11L, "a", "100"), null))).containsExactly("max", "max");
        assertThat(validator.validate(model, Map.of("i", "5", "a", "12.34"), null)).isEmpty();
    }

    @Test
    public void datesTypeAndRange() {
        FormField date = field("d", FormFieldTypes.DATE, false);
        date.setParams(Map.of("minDate", "2026-01-01", "maxDate", "2026-12-31"));
        SimpleFormModel model = model(date);

        assertThat(codes(validator.validate(model, Map.of("d", "not a date"), null))).containsExactly("type");
        assertThat(codes(validator.validate(model, Map.of("d", "2025-12-31"), null))).containsExactly("minDate");
        assertThat(codes(validator.validate(model, Map.of("d", "2027-01-01"), null))).containsExactly("maxDate");
        assertThat(validator.validate(model, Map.of("d", "2026-06-15"), null)).isEmpty();
    }

    @Test
    public void booleans() {
        SimpleFormModel model = model(field("b", FormFieldTypes.BOOLEAN, false));

        assertThat(codes(validator.validate(model, Map.of("b", "maybe"), null))).containsExactly("type");
        assertThat(validator.validate(model, Map.of("b", "TRUE"), null)).isEmpty();
        assertThat(validator.validate(model, Map.of("b", Boolean.FALSE), null)).isEmpty();
    }

    @Test
    public void optionsMustBeOneOfTheDeclaredOnes() {
        OptionFormField radio = new OptionFormField();
        radio.setId("r");
        radio.setType(FormFieldTypes.RADIO_BUTTONS);
        radio.setOptions(Arrays.asList(option("approve", "Approve"), option("return", "Return")));
        SimpleFormModel model = model(radio);

        assertThat(codes(validator.validate(model, Map.of("r", "maybe"), null))).containsExactly("option");
        assertThat(validator.validate(model, Map.of("r", "approve"), null)).isEmpty();
        assertThat(validator.validate(model, Map.of("r", "Return"), null)).isEmpty();
        Map<String, Object> asObject = new HashMap<>();
        asObject.put("id", "approve");
        assertThat(validator.validate(model, Map.of("r", asObject), null)).isEmpty();
    }

    @Test
    public void identitiesAreCheckedOnlyWhenAResolverIsConfigured() {
        SimpleFormModel model = model(field("p", FormFieldTypes.PEOPLE, false), field("g", FormFieldTypes.FUNCTIONAL_GROUP, false));

        assertThat(validator.validate(model, Map.of("p", "nobody", "g", "nowhere"), null)).isEmpty();

        validator.setUserExists("kermit"::equals).setGroupExists("admin"::equals);
        assertThat(codes(validator.validate(model, Map.of("p", "nobody", "g", "nowhere"), null))).containsExactly("identity", "identity");
        assertThat(validator.validate(model, Map.of("p", "kermit", "g", "admin"), null)).isEmpty();
    }

    @Test
    public void outcomeMustBeDeclared() {
        SimpleFormModel model = model(field("t", FormFieldTypes.SINGLE_LINE_TEXT, false));
        FormOutcome approve = new FormOutcome();
        approve.setId("approve");
        approve.setName("Approve");
        model.setOutcomes(List.of(approve));

        assertThat(validator.validate(model, Map.of(), null)).isEmpty();
        assertThat(validator.validate(model, Map.of(), "Approve")).isEmpty();
        assertThat(validator.validate(model, Map.of(), "reject"))
                .extracting(FormFieldValidationError::getFieldId, FormFieldValidationError::getCode)
                .containsExactly(tuple(null, "outcome"));
    }

    protected static List<String> codes(List<FormFieldValidationError> errors) {
        List<String> codes = new ArrayList<>();
        for (FormFieldValidationError error : errors) {
            codes.add(error.getCode());
        }
        return codes;
    }

    protected static SimpleFormModel model(FormField... fields) {
        SimpleFormModel model = new SimpleFormModel();
        model.setKey("test");
        model.setFields(new ArrayList<>(Arrays.asList(fields)));
        return model;
    }

    protected static FormField field(String id, String type, boolean required) {
        FormField field = new FormField();
        field.setId(id);
        field.setName(id);
        field.setType(type);
        field.setRequired(required);
        return field;
    }

    protected static Option option(String id, String name) {
        Option option = new Option();
        option.setId(id);
        option.setName(name);
        return option;
    }
}
