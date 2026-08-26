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
package org.togetherflow.events.recorder;

import static org.assertj.core.api.Assertions.assertThat;

import javax.sql.DataSource;

import org.flowable.eventregistry.api.EventRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseBuilder;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseType;

/**
 * The startup gate.
 *
 * <p>What is being pinned is that the unsafe configuration is unreachable by accident.
 * Before this, enabling the recorder was enough to serve every tenant's recorded payloads
 * to every caller the host application authenticated, and nothing said so at startup — the
 * only warning was a paragraph in a README.
 */
class EventRecorderAutoConfigurationTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(EventRecorderAutoConfiguration.class))
            .withUserConfiguration(Infrastructure.class)
            .withPropertyValues("togetherflow.events.recorder.enabled=true");

    @Test
    void refusesToStartUnderTheDefaultScopeWithNoResolver() {
        runner.run(context -> assertThat(context)
                .hasFailed()
                .getFailure()
                .rootCause()
                .hasMessageContaining("EventRecorderTenantResolver")
                .hasMessageContaining("tenant-scope=single-tenant"));
    }

    @Test
    void startsUnderTheDefaultScopeOnceAResolverIsSupplied() {
        runner.withBean(EventRecorderTenantResolver.class, () -> () -> "acme")
                .run(context -> assertThat(context).hasSingleBean(EventRecorderController.class));
    }

    @Test
    void startsWithoutAResolverOnlyWhenTheDeploymentSaysItIsSingleTenant() {
        runner.withPropertyValues("togetherflow.events.recorder.tenant-scope=single-tenant")
                .run(context -> assertThat(context).hasSingleBean(EventRecorderController.class));
    }

    @Test
    void doesNothingAtAllWhenTheRecorderIsNotEnabled() {
        new ApplicationContextRunner()
                .withConfiguration(AutoConfigurations.of(EventRecorderAutoConfiguration.class))
                .withUserConfiguration(Infrastructure.class)
                .run(context -> assertThat(context).doesNotHaveBean(EventRecorderController.class));
    }

    @Configuration(proxyBeanMethods = false)
    static class Infrastructure {

        @Bean
        DataSource dataSource() {
            return new EmbeddedDatabaseBuilder()
                    .setType(EmbeddedDatabaseType.H2)
                    .setName("recorder-autoconfig")
                    .build();
        }

        @Bean
        EventRegistry eventRegistry() {
            return org.mockito.Mockito.mock(EventRegistry.class);
        }
    }
}
