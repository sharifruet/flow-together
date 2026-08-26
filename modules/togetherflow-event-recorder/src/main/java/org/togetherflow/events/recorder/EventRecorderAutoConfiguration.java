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

import java.time.Clock;

import javax.sql.DataSource;

import org.flowable.eventregistry.api.EventRegistry;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;

/**
 * Wires the inbound event log, and only when asked (REQUIREMENTS.md §7.2, ADR 0015).
 *
 * <p>Three gates, deliberately: the jar has to be on the classpath, the event registry
 * API has to be there with it, and {@code togetherflow.events.recorder.enabled} has to be
 * {@code true}. A deployment that does none of those carries no cost at all — no table,
 * no endpoint, and no write on the inbound path.
 */
@AutoConfiguration(afterName = "org.flowable.spring.boot.eventregistry.EventRegistryServicesAutoConfiguration")
@ConditionalOnClass(EventRegistry.class)
@ConditionalOnProperty(prefix = "togetherflow.events.recorder", name = "enabled", havingValue = "true")
@EnableConfigurationProperties(EventRecorderProperties.class)
public class EventRecorderAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean(name = "eventRecorderClock")
    public Clock eventRecorderClock() {
        return Clock.systemUTC();
    }

    @Bean
    @ConditionalOnMissingBean(EventRecordStore.class)
    public EventRecordStore eventRecordStore(DataSource dataSource, EventRecorderProperties properties) {
        return new JdbcEventRecordStore(dataSource, properties);
    }

    @Bean
    public EventRecorderController eventRecorderController(EventRecordStore store) {
        return new EventRecorderController(store);
    }

    @Bean
    public EventRecorderInstaller eventRecorderInstaller(ObjectProvider<EventRegistry> eventRegistry,
            EventRecordStore store, EventRecorderProperties properties, Clock eventRecorderClock) {
        return new EventRecorderInstaller(eventRegistry, store, properties, eventRecorderClock);
    }

    @Bean
    public EventRecorderRetention eventRecorderRetention(EventRecordStore store,
            EventRecorderProperties properties, Clock eventRecorderClock) {
        return new EventRecorderRetention(store, properties, eventRecorderClock);
    }
}
