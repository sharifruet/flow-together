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
package org.togetherflow.resignation;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.flowable.cmmn.api.CmmnRepositoryService;
import org.flowable.cmmn.api.CmmnRuntimeService;
import org.flowable.cmmn.api.CmmnTaskService;
import org.flowable.cmmn.engine.CmmnEngineConfiguration;
import org.flowable.cmmn.engine.configurator.CmmnEngineConfigurator;
import org.flowable.common.engine.api.scope.ScopeTypes;
import org.flowable.engine.IdentityService;
import org.flowable.engine.ProcessEngine;
import org.flowable.engine.RepositoryService;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.TaskService;
import org.flowable.engine.impl.cfg.StandaloneProcessEngineConfiguration;
import org.flowable.task.api.Task;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;

/**
 * Runs the resignation models on a real engine.
 *
 * <p>A process engine with the CMMN engine configured onto it, which is what a CMMN process
 * task needs to reach a BPMN process. The two beans the models call are put in both engines'
 * bean maps, because an expression in a case is resolved by the CMMN engine's expression
 * manager and an expression in a process by the process engine's.
 *
 * <p>The resources are the shipped ones, loaded from the classpath. Nothing here re-states what
 * the models say; if a task id in the XML changes, these tests stop finding it.
 */
public abstract class ResignationEngineTest {

    protected static final List<String> PROCESS_RESOURCES = List.of(
            "processes/resignation-sales-approval.bpmn20.xml",
            "processes/resignation-sales-admin-routing.bpmn20.xml",
            "processes/resignation-department-clearance.bpmn20.xml",
            "processes/resignation-acceptance.bpmn20.xml",
            "processes/resignation-final-settlement.bpmn20.xml");

    protected static final String CASE_RESOURCE = "cases/resignation-sales.cmmn";

    protected ProcessEngine processEngine;
    protected RepositoryService repositoryService;
    protected RuntimeService runtimeService;
    protected TaskService taskService;
    protected IdentityService identityService;
    protected CmmnEngineConfiguration cmmnEngineConfiguration;
    protected CmmnRepositoryService cmmnRepositoryService;
    protected CmmnRuntimeService cmmnRuntimeService;
    protected CmmnTaskService cmmnTaskService;
    protected RecordingNotifier notifier;
    protected ResignationDocuments documents;

    @BeforeEach
    void bootEngine() {
        notifier = new RecordingNotifier();
        documents = new ResignationDocuments();
        Map<Object, Object> beans = new HashMap<>();
        beans.put("resignationNotifier", notifier);
        beans.put("resignationDocuments", documents);

        CmmnEngineConfiguration cmmnConfiguration = new CmmnEngineConfiguration();
        cmmnConfiguration.setJdbcUrl(jdbcUrl());
        cmmnConfiguration.setDatabaseSchemaUpdate(CmmnEngineConfiguration.DB_SCHEMA_UPDATE_TRUE);
        cmmnConfiguration.setBeans(beans);

        StandaloneProcessEngineConfiguration configuration = new StandaloneProcessEngineConfiguration();
        configuration.setJdbcUrl(jdbcUrl());
        configuration.setDatabaseSchemaUpdate(StandaloneProcessEngineConfiguration.DB_SCHEMA_UPDATE_TRUE);
        configuration.setBeans(beans);
        configuration.addConfigurator(new CmmnEngineConfigurator().setCmmnEngineConfiguration(cmmnConfiguration));

        processEngine = configuration.buildProcessEngine();
        repositoryService = processEngine.getRepositoryService();
        runtimeService = processEngine.getRuntimeService();
        taskService = processEngine.getTaskService();
        identityService = processEngine.getIdentityService();

        // The configurator builds the CMMN engine from this very object, so its services
        // are on it once the process engine is up.
        cmmnEngineConfiguration = cmmnConfiguration;
        cmmnRepositoryService = cmmnEngineConfiguration.getCmmnRepositoryService();
        cmmnRuntimeService = cmmnEngineConfiguration.getCmmnRuntimeService();
        cmmnTaskService = cmmnEngineConfiguration.getCmmnTaskService();
    }

    @AfterEach
    void shutdownEngine() {
        if (processEngine != null) {
            processEngine.close();
        }
    }

    /** A fresh in-memory database per test, so one test's case file is not another's. */
    protected String jdbcUrl() {
        return "jdbc:h2:mem:resignation-" + getClass().getSimpleName() + "-" + System.nanoTime()
                + ";DB_CLOSE_DELAY=1000";
    }

    protected void deployModels() {
        var deployment = repositoryService.createDeployment().name("resignation-processes");
        PROCESS_RESOURCES.forEach(deployment::addClasspathResource);
        deployment.deploy();
        cmmnRepositoryService.createDeployment().name("resignation-case").addClasspathResource(CASE_RESOURCE).deploy();
    }

    /**
     * Completes the one task with this definition key, whether it belongs to the case or to a
     * process started by it.
     *
     * <p>Asserting that there is exactly one is the point: it is what makes the walk through
     * the case a statement about the model's sequencing rather than a tour of whatever happened
     * to be open.
     */
    protected Task complete(String taskDefinitionKey, Map<String, Object> variables) {
        List<Task> tasks = cmmnTaskService.createTaskQuery().taskDefinitionKey(taskDefinitionKey).list();
        assertThat(tasks)
                .as("exactly one open task with definition key '%s'", taskDefinitionKey)
                .hasSize(1);
        Task task = tasks.get(0);
        completeTask(task, variables);
        return task;
    }

    /**
     * A task belongs to whichever engine created it: the case's own human tasks to the CMMN
     * engine, everything a process task started to the process engine. Both engines see all of
     * them in a query, but only the owning one may complete one.
     */
    protected void completeTask(Task task, Map<String, Object> variables) {
        if (ScopeTypes.CMMN.equals(task.getScopeType())) {
            cmmnTaskService.complete(task.getId(), variables);
        } else {
            taskService.complete(task.getId(), variables);
        }
    }

    protected Task complete(String taskDefinitionKey) {
        return complete(taskDefinitionKey, Map.of());
    }

    protected Task approve(String taskDefinitionKey) {
        return complete(taskDefinitionKey, Map.of("decision", "approve"));
    }

    protected List<String> openTaskKeys() {
        return cmmnTaskService.createTaskQuery().list().stream().map(Task::getTaskDefinitionKey).sorted().toList();
    }

    /** Keeps what the models notified, so a test can assert on the mail the spreadsheet promises. */
    protected static class RecordingNotifier implements ResignationNotifier {

        private final List<String> sent = new java.util.ArrayList<>();

        @Override
        public boolean send(String event, String employeeId, String recipients) {
            sent.add(event + "|" + employeeId + "|" + recipients);
            return true;
        }

        List<String> events() {
            return sent.stream().map(entry -> entry.split("\\|")[0]).toList();
        }

        List<String> sent() {
            return sent;
        }
    }
}
