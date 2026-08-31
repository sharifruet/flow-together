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

import org.flowable.app.api.AppRepositoryService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Deploys {@code apps/resignation-sales.app}, which nothing else will.
 *
 * <p>The case and the five processes are picked up by Flowable's own autodeployment - they sit
 * on {@code classpath*:/cases/} and {@code classpath*:/processes/}, which the Spring Boot
 * autoconfiguration scans. The app definition is the exception: {@code FlowableAppProperties}
 * scans {@code classpath*:/apps/} for {@code **.zip} and {@code **.bar} only, so a bare
 * {@code .app} sitting beside them is deployed by hand or not at all.
 *
 * <p>This is that hand. It runs only where an app engine is actually present, and it deploys
 * with duplicate filtering on, so a restart does not stack a new revision of an unchanged
 * definition.
 */
public class ResignationAppDeployer {

    /** The classpath resource, and the deployment name duplicate filtering compares against. */
    static final String RESOURCE = "apps/resignation-sales.app";
    static final String DEPLOYMENT_NAME = "Resignation (Sales) - app definition";

    private static final Logger LOGGER = LoggerFactory.getLogger(ResignationAppDeployer.class);

    private final AppRepositoryService appRepositoryService;

    public ResignationAppDeployer(AppRepositoryService appRepositoryService) {
        this.appRepositoryService = appRepositoryService;
    }

    /**
     * Deploys the app definition if an identical one is not already deployed.
     *
     * @return the deployment id, or the existing one when duplicate filtering suppressed the write
     */
    public String deploy() {
        String deploymentId = appRepositoryService.createDeployment()
                .name(DEPLOYMENT_NAME)
                .addClasspathResource(RESOURCE)
                .enableDuplicateFiltering()
                .deploy()
                .getId();

        LOGGER.info("Resignation (Sales) app definition deployed from {} as deployment {}", RESOURCE, deploymentId);
        return deploymentId;
    }
}
