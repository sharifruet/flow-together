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

import org.flowable.eventregistry.api.EventRegistry;
import org.flowable.eventregistry.api.InboundEventProcessor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.SmartInitializingSingleton;

/**
 * Puts {@link RecordingInboundEventProcessor} in place once the engine has finished
 * building itself.
 *
 * <p>{@link SmartInitializingSingleton} rather than a constructor or {@code @PostConstruct}:
 * the engine installs its own processor while the {@code EventRegistryEngine} bean is
 * created, so anything earlier would be overwritten by it. Anything later — an
 * {@code ApplicationReadyEvent}, say — widens the window in which a channel adapter is
 * already delivering events that go unrecorded. This is the narrowest gap available
 * without engine changes, and it is not zero: events arriving during startup are not
 * recorded, which the README states plainly.
 */
public class EventRecorderInstaller implements SmartInitializingSingleton {

    private static final Logger LOGGER = LoggerFactory.getLogger(EventRecorderInstaller.class);

    private final ObjectProvider<EventRegistry> eventRegistry;
    private final EventRecordStore store;
    private final EventRecorderProperties properties;
    private final Clock clock;

    public EventRecorderInstaller(ObjectProvider<EventRegistry> eventRegistry, EventRecordStore store,
            EventRecorderProperties properties, Clock clock) {
        this.eventRegistry = eventRegistry;
        this.store = store;
        this.properties = properties;
        this.clock = clock;
    }

    @Override
    public void afterSingletonsInstantiated() {
        EventRegistry registry = eventRegistry.getIfAvailable();
        if (registry == null) {
            // Enabled in an application with no event registry engine. Say so rather
            // than leaving someone to wonder why the feed stays empty.
            LOGGER.warn("togetherflow.events.recorder is enabled but no EventRegistry bean exists; "
                    + "no inbound events will be recorded");
            return;
        }
        install(registry);
    }

    void install(EventRegistry registry) {
        InboundEventProcessor replaced = currentProcessor(registry);
        registry.setInboundEventProcessor(
                new RecordingInboundEventProcessor(registry, store, properties, clock));
        LOGGER.info("Inbound event recording enabled; replaced inbound event processor {}. "
                        + "Payload storage: {}. Retention: {}.",
                replaced == null ? "<none>" : replaced.getClass().getName(),
                properties.isStorePayload() ? "on" : "off",
                properties.getRetention());
    }

    /**
     * Only for the log line above, so a deployment that had customised the processor can
     * see in one line that it was displaced. {@code EventRegistry} exposes a setter but
     * no getter, so there is nothing to read back and nothing to restore.
     */
    private static InboundEventProcessor currentProcessor(EventRegistry registry) {
        try {
            var field = registry.getClass().getDeclaredField("inboundEventProcessor");
            field.setAccessible(true);
            return (InboundEventProcessor) field.get(registry);
        } catch (ReflectiveOperationException | RuntimeException unavailable) {
            return null;
        }
    }
}
