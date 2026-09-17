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

import org.flowable.engine.ProcessEngine;
import org.flowable.engine.RepositoryService;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.impl.cfg.ProcessEngineConfigurationImpl;
import org.flowable.engine.impl.util.EngineServiceUtil;
import org.flowable.engine.test.FlowableTest;
import org.flowable.form.api.FormRepositoryService;
import org.junit.jupiter.api.BeforeEach;

/**
 * @author Yvo Swillens
 */
@FlowableTest
public class AbstractFlowableFormEngineConfiguratorTest {

    protected ProcessEngine processEngine;
    protected RepositoryService repositoryService;
    protected RuntimeService runtimeService;
    protected FormRepositoryService formRepositoryService;
    protected ProcessEngineConfigurationImpl processEngineConfiguration;

    @BeforeEach
    public void initProcessEngine(ProcessEngine processEngine) {
        this.processEngine = processEngine;
        this.repositoryService = processEngine.getRepositoryService();
        this.runtimeService = processEngine.getRuntimeService();
        this.formRepositoryService = EngineServiceUtil.getFormRepositoryService(processEngine.getProcessEngineConfiguration());
        if (processEngine.getProcessEngineConfiguration() instanceof ProcessEngineConfigurationImpl) {
            this.processEngineConfiguration = (ProcessEngineConfigurationImpl) processEngine.getProcessEngineConfiguration();
        }
    }

    protected ProcessEngineConfigurationImpl getProcessEngineConfiguration() {
        return processEngineConfiguration;
    }
}
