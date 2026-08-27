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
import static org.mockito.Mockito.mock;

import org.flowable.engine.IdentityService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * What an application gets by putting this jar on its classpath.
 *
 * <p>The bean <em>names</em> are the contract here, not the types: the models reach these beans
 * through {@code ${resignationNotifier...}} and {@code ${resignationDocuments...}} expressions,
 * which Flowable resolves by name against the Spring context. A rename that compiles cleanly
 * would break every service task in the module, so it is asserted.
 */
class ResignationAutoConfigurationTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(ResignationAutoConfiguration.class));

    @Test
    @DisplayName("the models' two beans are registered under the names the models use")
    void registersTheBeansTheModelsCall() {
        runner.run(context -> {
            assertThat(context).hasBean("resignationNotifier").hasBean("resignationDocuments");
            assertThat(context.getBean("resignationNotifier")).isInstanceOf(LoggingResignationNotifier.class);
        });
    }

    @Test
    @DisplayName("an application that sends real mail keeps its own notifier")
    void backsOffForAnApplicationsOwnNotifier() {
        runner.withUserConfiguration(OwnNotifierConfiguration.class).run(context -> {
            assertThat(context).hasSingleBean(ResignationNotifier.class);
            assertThat(context.getBean(ResignationNotifier.class)).isNotInstanceOf(LoggingResignationNotifier.class);
        });
    }

    @Test
    @DisplayName("the sample identities are not created unless somebody asks")
    void doesNotSeedIdentitiesByDefault() {
        runner.withUserConfiguration(IdentityServiceConfiguration.class)
                .run(context -> assertThat(context).doesNotHaveBean("resignationSampleIdentityRunner"));
    }

    @Test
    @DisplayName("turning the property on registers the seeder")
    void seedsIdentitiesWhenAsked() {
        runner.withUserConfiguration(IdentityServiceConfiguration.class)
                .withPropertyValues("togetherflow.resignation.sample-users.enabled=true")
                .run(context -> {
                    assertThat(context).hasBean("resignationSampleIdentityRunner");
                    assertThat(context.getBean(ResignationSampleDataProperties.class).getPassword()).isEqualTo("demo");
                });
    }

    @Test
    @DisplayName("without a process engine there is nothing to seed into")
    void doesNotSeedWithoutAnIdentityService() {
        runner.withPropertyValues("togetherflow.resignation.sample-users.enabled=true")
                .run(context -> assertThat(context).doesNotHaveBean("resignationSampleIdentityRunner"));
    }

    @Configuration(proxyBeanMethods = false)
    static class IdentityServiceConfiguration {

        @Bean
        IdentityService identityService() {
            return mock(IdentityService.class);
        }
    }

    @Configuration(proxyBeanMethods = false)
    static class OwnNotifierConfiguration {

        @Bean
        ResignationNotifier resignationNotifier() {
            return (event, employeeId, recipients) -> true;
        }
    }
}
