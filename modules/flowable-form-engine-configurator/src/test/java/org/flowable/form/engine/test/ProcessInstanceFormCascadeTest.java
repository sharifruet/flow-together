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

import java.util.Collections;

import org.flowable.engine.HistoryService;
import org.flowable.engine.TaskService;
import org.flowable.engine.runtime.ProcessInstance;
import org.flowable.engine.test.Deployment;
import org.flowable.form.api.FormInfo;
import org.flowable.form.api.FormService;
import org.flowable.form.engine.FormEngines;
import org.flowable.task.api.Task;
import org.junit.jupiter.api.Test;

/**
 * FR-H.2: a process instance's submissions are deleted with the (historic) process instance.
 */
public class ProcessInstanceFormCascadeTest extends AbstractFlowableFormEngineConfiguratorTest {

    @Test
    @Deployment(resources = {
            "org/flowable/form/engine/test/deployment/oneTaskWithStartFormProcess.bpmn20.xml",
            "org/flowable/form/engine/test/deployment/simple.form"
    })
    public void formInstancesGoWithTheProcessInstance() {
        FormService formService = FormEngines.getDefaultFormEngine().getFormService();
        TaskService taskService = processEngine.getTaskService();
        HistoryService historyService = processEngine.getHistoryService();
        FormInfo formInfo = formRepositoryService.getFormModelByKey("form1");

        ProcessInstance processInstance = runtimeService.createProcessInstanceBuilder()
                .processDefinitionKey("oneTaskWithStartFormProcess")
                .startFormVariables(Collections.singletonMap("input1", "start"))
                .outcome("go")
                .start();
        Task task = taskService.createTaskQuery().processInstanceId(processInstance.getId()).singleResult();
        taskService.completeTaskWithForm(task.getId(), formInfo.getId(), "done", Collections.singletonMap("input1", "task"));

        assertThat(formService.createFormInstanceQuery().processInstanceId(processInstance.getId()).count()).isEqualTo(2);

        historyService.deleteHistoricProcessInstance(processInstance.getId());

        assertThat(formService.createFormInstanceQuery().processInstanceId(processInstance.getId()).count())
                .as("both submissions deleted with the historic process instance")
                .isZero();
    }
}
