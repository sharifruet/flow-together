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
package org.flowable.form.engine.test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.entry;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;

import org.flowable.cmmn.api.CmmnHistoryService;
import org.flowable.cmmn.api.CmmnRepositoryService;
import org.flowable.cmmn.api.CmmnRuntimeService;
import org.flowable.cmmn.api.CmmnTaskService;
import org.flowable.cmmn.api.repository.CaseDefinition;
import org.flowable.cmmn.api.runtime.CaseInstance;
import org.flowable.cmmn.engine.CmmnEngineConfiguration;
import org.flowable.common.engine.api.scope.ScopeTypes;
import org.flowable.common.engine.impl.interceptor.EngineConfigurationConstants;
import org.flowable.form.api.FlowableFormValidationException;
import org.flowable.form.api.FormFieldValidationError;
import org.flowable.form.api.FormInfo;
import org.flowable.form.api.FormInstanceInfo;
import org.flowable.form.api.FormService;
import org.flowable.form.engine.FormEngines;
import org.flowable.task.api.Task;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * The form engine seen from the CMMN engine: a case deployed together with its form, started
 * through the start form, its task completed through the task form, the submission visible on the
 * historic task, and everything gone with the case (FORM_REQUIREMENTS.md FR-R.2, FR-S.1/2, FR-R.5, FR-H.2).
 */
public class CaseWithFormTest extends AbstractFlowableFormEngineConfiguratorTest {

    protected CmmnEngineConfiguration cmmnEngineConfiguration;
    protected CmmnRepositoryService cmmnRepositoryService;
    protected CmmnRuntimeService cmmnRuntimeService;
    protected CmmnTaskService cmmnTaskService;
    protected CmmnHistoryService cmmnHistoryService;
    protected FormService formService;
    protected String deploymentId;

    @BeforeEach
    public void deployCase() {
        cmmnEngineConfiguration = (CmmnEngineConfiguration) processEngineConfiguration.getEngineConfigurations()
                .get(EngineConfigurationConstants.KEY_CMMN_ENGINE_CONFIG);
        cmmnRepositoryService = cmmnEngineConfiguration.getCmmnRepositoryService();
        cmmnRuntimeService = cmmnEngineConfiguration.getCmmnRuntimeService();
        cmmnTaskService = cmmnEngineConfiguration.getCmmnTaskService();
        cmmnHistoryService = cmmnEngineConfiguration.getCmmnHistoryService();
        formService = FormEngines.getDefaultFormEngine().getFormService();

        deploymentId = cmmnRepositoryService.createDeployment()
                .addClasspathResource("org/flowable/form/engine/test/deployment/oneHumanTaskWithFormCase.cmmn")
                .addClasspathResource("org/flowable/form/engine/test/deployment/simple.form")
                .deploy()
                .getId();
    }

    @AfterEach
    public void undeployCase() {
        cmmnRepositoryService.deleteDeployment(deploymentId, true);
        assertThat(formRepositoryService.createDeploymentQuery().parentDeploymentId(deploymentId).count())
                .as("the .form deployed with the case goes with it")
                .isZero();
    }

    @Test
    public void caseDeploymentCarriesItsForm() {
        CaseDefinition caseDefinition = cmmnRepositoryService.createCaseDefinitionQuery().deploymentId(deploymentId).singleResult();
        assertThat(caseDefinition).isNotNull();
        assertThat(formRepositoryService.createFormDefinitionQuery().parentDeploymentId(deploymentId).list())
                .extracting(d -> d.getKey())
                .containsExactly("form1");
        assertThat(cmmnRepositoryService.getFormDefinitionsForCaseDefinition(caseDefinition.getId()))
                .extracting(d -> d.getKey())
                .containsExactly("form1");
    }

    @Test
    public void startWithFormCompleteWithFormAndReadItBack() {
        FormInfo formInfo = formRepositoryService.getFormModelByKey("form1");

        CaseInstance caseInstance = cmmnRuntimeService.createCaseInstanceBuilder()
                .caseDefinitionKey("oneHumanTaskWithFormCase")
                .startFormVariables(Map.of("input1", "from the start form"))
                .outcome("go")
                .startWithForm();

        assertThat(cmmnRuntimeService.getVariables(caseInstance.getId()))
                .contains(entry("input1", "from the start form"), entry("form_form1_outcome", "go"));
        assertThat(formService.createFormInstanceQuery().scopeId(caseInstance.getId()).scopeType(ScopeTypes.CMMN).count())
                .as("the start submission is recorded")
                .isEqualTo(1);

        Task task = cmmnTaskService.createTaskQuery().caseInstanceId(caseInstance.getId()).singleResult();
        FormInfo taskForm = cmmnTaskService.getTaskFormModel(task.getId());
        assertThat(taskForm.getKey()).isEqualTo("form1");

        cmmnTaskService.completeTaskWithForm(task.getId(), formInfo.getId(), "done", Map.of("input1", "from the task"));

        assertThat(formService.createFormInstanceQuery().scopeId(caseInstance.getId()).scopeType(ScopeTypes.CMMN).count())
                .as("start + task submissions")
                .isEqualTo(2);

        // The historic task form is *this task's* submission, not the case's start submission.
        FormInfo historicForm = cmmnTaskService.getTaskFormModel(task.getId());
        assertThat(historicForm).isInstanceOf(FormInstanceInfo.class);
        FormInstanceInfo submission = (FormInstanceInfo) historicForm;
        assertThat(submission.getSelectedOutcome()).isEqualTo("done");
        assertThat(submission.getTaskId()).isEqualTo(task.getId());

        assertThat(cmmnHistoryService.createHistoricCaseInstanceQuery().caseInstanceId(caseInstance.getId()).singleResult().getEndTime()).isNotNull();

        cmmnHistoryService.deleteHistoricCaseInstance(caseInstance.getId());
        assertThat(formService.createFormInstanceQuery().scopeId(caseInstance.getId()).count())
                .as("form instances go with the historic case instance")
                .isZero();
    }

    @Test
    public void validationRunsOnTheCmmnEngineToo() {
        // Deploy a stricter form under the same key: the *latest* version wins for a standalone lookup.
        String strictDeployment = formRepositoryService.createDeployment()
                .addString("strict.form", "{\"key\":\"form1\",\"name\":\"strict\",\"fields\":[{\"id\":\"amount\",\"name\":\"Amount\",\"type\":\"amount\","
                        + "\"required\":true,\"params\":{\"min\":\"10\"}}],\"outcomes\":[{\"id\":\"ok\",\"name\":\"OK\"}]}")
                .deploy()
                .getId();
        try {
            CaseInstance caseInstance = cmmnRuntimeService.createCaseInstanceBuilder()
                    .caseDefinitionKey("oneHumanTaskWithFormCase")
                    .start();
            Task task = cmmnTaskService.createTaskQuery().caseInstanceId(caseInstance.getId()).singleResult();
            FormInfo strict = formRepositoryService.getFormModelByKey("form1");

            Map<String, Object> bad = new HashMap<>();
            bad.put("amount", "5");
            assertThatThrownBy(() -> cmmnTaskService.completeTaskWithForm(task.getId(), strict.getId(), "nope", bad))
                    .isInstanceOfSatisfying(FlowableFormValidationException.class, e ->
                            assertThat(e.getErrors()).extracting(FormFieldValidationError::getCode).containsExactlyInAnyOrder("min", "outcome"));

            cmmnTaskService.completeTaskWithForm(task.getId(), strict.getId(), "ok", Map.of("amount", "12.50"));
            assertThat(cmmnHistoryService.createHistoricVariableInstanceQuery().caseInstanceId(caseInstance.getId()).variableName("amount").singleResult().getValue())
                    .isEqualTo(new BigDecimal("12.50"));

            cmmnHistoryService.deleteHistoricCaseInstance(caseInstance.getId());
        } finally {
            formRepositoryService.deleteDeployment(strictDeployment, true);
        }
    }
}
