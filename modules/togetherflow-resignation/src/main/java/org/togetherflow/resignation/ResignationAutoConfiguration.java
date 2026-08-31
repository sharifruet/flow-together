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
import org.flowable.engine.IdentityService;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;

/**
 * Wires the two beans the resignation models call, and optionally the sample identities.
 *
 * <p>The models reach these by bean name - {@code ${resignationNotifier.send(...)}} and
 * {@code ${resignationDocuments.register(...)}} - because Flowable resolves an expression
 * against the Spring context. Renaming a bean here breaks the models, which is why both are
 * declared with their names spelled out rather than taken from the method.
 *
 * <p>Both are {@link ConditionalOnMissingBean}: an application that wants to actually send mail
 * declares its own {@code resignationNotifier} and this one steps aside.
 */
@AutoConfiguration
@EnableConfigurationProperties(ResignationSampleDataProperties.class)
public class ResignationAutoConfiguration {

    @Bean(name = "resignationNotifier")
    @ConditionalOnMissingBean(ResignationNotifier.class)
    public ResignationNotifier resignationNotifier() {
        return new LoggingResignationNotifier();
    }

    @Bean(name = "resignationDocuments")
    @ConditionalOnMissingBean(ResignationDocuments.class)
    public ResignationDocuments resignationDocuments() {
        return new ResignationDocuments();
    }

    /**
     * Seeds the sample identities once the engine is up.
     *
     * <p>A {@link CommandLineRunner} rather than an {@code @PostConstruct}: the identity tables
     * belong to the process engine, and this has to run after the engine has built them, not
     * while the context is still assembling.
     */
    @Bean
    @ConditionalOnBean(IdentityService.class)
    @ConditionalOnProperty(prefix = "togetherflow.resignation.sample-users", name = "enabled", havingValue = "true")
    public CommandLineRunner resignationSampleIdentityRunner(IdentityService identityService,
            ResignationSampleDataProperties properties) {
        return args -> new ResignationSampleIdentity(identityService, properties.getPassword()).apply();
    }

    /**
     * Deploys the app definition, which Flowable's own autodeployment does not pick up.
     *
     * <p>{@link ConditionalOnClass} as well as {@link ConditionalOnBean}: the app engine is a
     * {@code provided} dependency here, so a host that runs only the process and CMMN engines
     * has no {@code AppRepositoryService} class at all, and a bean method mentioning one would
     * fail to load rather than back off quietly.
     *
     * <p>A {@link CommandLineRunner} for the same reason as the seeder above - the repository
     * tables belong to the engine, and this has to run after the engine has built them.
     */
    @Bean
    @ConditionalOnClass(AppRepositoryService.class)
    @ConditionalOnBean(AppRepositoryService.class)
    @ConditionalOnProperty(prefix = "togetherflow.resignation.app-definition", name = "deploy",
            havingValue = "true", matchIfMissing = true)
    public CommandLineRunner resignationAppDefinitionRunner(AppRepositoryService appRepositoryService) {
        return args -> new ResignationAppDeployer(appRepositoryService).deploy();
    }
}
