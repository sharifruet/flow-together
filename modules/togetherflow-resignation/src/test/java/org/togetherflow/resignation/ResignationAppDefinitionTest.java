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

import org.flowable.app.api.repository.AppDefinition;
import org.flowable.app.engine.AppEngine;
import org.flowable.app.engine.impl.cfg.StandaloneInMemAppEngineConfiguration;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * The app definition, deployed for real.
 *
 * <p>Worth its own test because it is the one artefact here that Spring Boot's autodeployment
 * does <em>not</em> pick up: {@code FlowableAppProperties} scans {@code classpath*:/apps/} for
 * {@code **.zip} and {@code **.bar} only, so a bare {@code .app} sitting next to them is
 * deployed by hand or not at all. This at least proves the file is deployable when it is.
 */
class ResignationAppDefinitionTest {

    private AppEngine appEngine;

    @BeforeEach
    void bootAppEngine() {
        StandaloneInMemAppEngineConfiguration configuration = new StandaloneInMemAppEngineConfiguration();
        configuration.setJdbcUrl("jdbc:h2:mem:resignation-app-" + System.nanoTime() + ";DB_CLOSE_DELAY=1000");
        appEngine = configuration.buildAppEngine();
    }

    @AfterEach
    void shutdownAppEngine() {
        if (appEngine != null) {
            appEngine.close();
        }
    }

    @Test
    @DisplayName("deploys, and grants access to every group the models assign work to")
    void deploysTheApp() throws Exception {
        appEngine.getAppRepositoryService().createDeployment()
                .name("resignation-app")
                .addClasspathResource("apps/resignation-sales.app")
                .deploy();

        AppDefinition definition = appEngine.getAppRepositoryService().createAppDefinitionQuery()
                .appDefinitionKey("resignationSalesApp")
                .singleResult();

        assertThat(definition).isNotNull();
        assertThat(definition.getName()).isEqualTo("Resignation (Sales)");

        // `groupsAccess` is not on the AppModel interface, so read it back off the stored
        // model rather than casting to the engine's internal implementation of it.
        JsonNode model = new ObjectMapper()
                .readTree(appEngine.getAppRepositoryService().convertAppModelToJson(definition.getId()));
        assertThat(model.path("groupsAccess").asText().split(","))
                .as("everyone with a task in the case can open the app")
                .contains(ResignationRoles.ASE, ResignationRoles.HRM, ResignationRoles.HEAD_OF_HR,
                        ResignationRoles.ACC_DIRECTOR, ResignationRoles.GAD);
    }

    @Test
    @DisplayName("the deployer deploys it, and a restart does not stack a second copy")
    void theDeployerDeploysItOnceOnly() {
        ResignationAppDeployer deployer = new ResignationAppDeployer(appEngine.getAppRepositoryService());

        String first = deployer.deploy();
        String second = deployer.deploy();

        assertThat(second)
                .as("duplicate filtering means a restart redeploys nothing")
                .isEqualTo(first);
        assertThat(appEngine.getAppRepositoryService().createAppDefinitionQuery()
                .appDefinitionKey("resignationSalesApp").count())
                .isEqualTo(1);
    }
}
