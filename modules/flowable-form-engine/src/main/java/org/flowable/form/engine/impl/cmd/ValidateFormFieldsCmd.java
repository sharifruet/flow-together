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
package org.flowable.form.engine.impl.cmd;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.flowable.common.engine.api.delegate.Expression;
import org.flowable.common.engine.impl.el.VariableContainerWrapper;
import org.flowable.common.engine.impl.interceptor.Command;
import org.flowable.common.engine.impl.interceptor.CommandContext;
import org.flowable.common.engine.impl.interceptor.EngineConfigurationConstants;
import org.flowable.form.api.FlowableFormValidationException;
import org.flowable.form.api.FormFieldValidationError;
import org.flowable.form.api.FormInfo;
import org.flowable.form.engine.FormEngineConfiguration;
import org.flowable.form.engine.impl.util.CommandContextUtil;
import org.flowable.form.engine.impl.validation.FormFieldValidator;
import org.flowable.form.model.FormField;
import org.flowable.form.model.Option;
import org.flowable.form.model.OptionFormField;
import org.flowable.form.model.SimpleFormModel;
import org.flowable.idm.api.IdmEngineConfigurationApi;
import org.flowable.idm.api.IdmIdentityService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import tools.jackson.core.type.TypeReference;

/**
 * Server-side validation of a submission (FORM_REQUIREMENTS.md FR-S.3). The element context is
 * carried so element-specific rules can be added without changing the API again.
 */
public class ValidateFormFieldsCmd implements Command<Void> {

    private static final Logger LOGGER = LoggerFactory.getLogger(ValidateFormFieldsCmd.class);

    protected String elementId;
    protected String elementType;
    protected String scopeId;
    protected String scopeDefinitionId;
    protected String scopeType;
    protected FormInfo formInfo;
    protected Map<String, Object> values;
    protected String outcome;

    public ValidateFormFieldsCmd(String elementId, String elementType, String scopeId, String scopeDefinitionId,
            String scopeType, FormInfo formInfo, Map<String, Object> values) {
        this(elementId, elementType, scopeId, scopeDefinitionId, scopeType, formInfo, values, null);
    }

    public ValidateFormFieldsCmd(String elementId, String elementType, String scopeId, String scopeDefinitionId,
            String scopeType, FormInfo formInfo, Map<String, Object> values, String outcome) {
        this.elementId = elementId;
        this.elementType = elementType;
        this.scopeId = scopeId;
        this.scopeDefinitionId = scopeDefinitionId;
        this.scopeType = scopeType;
        this.formInfo = formInfo;
        this.values = values;
        this.outcome = outcome;
    }

    @Override
    public Void execute(CommandContext commandContext) {
        if (formInfo == null || !(formInfo.getFormModel() instanceof SimpleFormModel)) {
            return null;
        }
        FormEngineConfiguration formEngineConfiguration = CommandContextUtil.getFormEngineConfiguration(commandContext);
        SimpleFormModel formModel = (SimpleFormModel) formInfo.getFormModel();
        resolveOptionExpressions(formModel, formEngineConfiguration);

        FormFieldValidator validator = formEngineConfiguration.getFormFieldValidator();
        if (validator.getUserExists() == null || validator.getGroupExists() == null) {
            IdmEngineConfigurationApi idmEngineConfiguration = (IdmEngineConfigurationApi) commandContext.getEngineConfigurations()
                    .get(EngineConfigurationConstants.KEY_IDM_ENGINE_CONFIG);
            if (idmEngineConfiguration != null) {
                IdmIdentityService identityService = idmEngineConfiguration.getIdmIdentityService();
                if (validator.getUserExists() == null) {
                    validator.setUserExists(id -> identityService.createUserQuery().userId(id).count() > 0);
                }
                if (validator.getGroupExists() == null) {
                    validator.setGroupExists(id -> identityService.createGroupQuery().groupId(id).count() > 0);
                }
            }
        }

        List<FormFieldValidationError> errors = validator.validate(formModel, values, outcome);
        if (!errors.isEmpty()) {
            throw new FlowableFormValidationException(errors);
        }
        return null;
    }

    /**
     * Options that come from an expression are resolved against the submitted values, which is the
     * best context this command has. A failing expression leaves the field unchecked rather than
     * refusing the submission for a modelling problem.
     */
    protected void resolveOptionExpressions(SimpleFormModel formModel, FormEngineConfiguration formEngineConfiguration) {
        for (FormField field : formModel.allFieldsAsMap().values()) {
            if (!(field instanceof OptionFormField)) {
                continue;
            }
            OptionFormField optionField = (OptionFormField) field;
            if (optionField.getOptionsExpression() == null || (optionField.getOptions() != null && !optionField.getOptions().isEmpty())) {
                continue;
            }
            try {
                Expression expression = formEngineConfiguration.getExpressionManager().createExpression(optionField.getOptionsExpression());
                Object value = expression.getValue(new VariableContainerWrapper(values != null ? values : new HashMap<>()));
                if (value instanceof List) {
                    @SuppressWarnings("unchecked")
                    List<Option> options = (List<Option>) value;
                    optionField.setOptions(options);
                } else if (value instanceof String) {
                    optionField.setOptions(formEngineConfiguration.getObjectMapper().readValue((String) value, new TypeReference<List<Option>>() { }));
                }
            } catch (Exception e) {
                LOGGER.debug("Could not resolve optionsExpression '{}' for field {} during validation", optionField.getOptionsExpression(), field.getId(), e);
            }
        }
    }
}
