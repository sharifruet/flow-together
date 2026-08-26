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
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;

import org.flowable.eventregistry.api.EventRegistry;
import org.flowable.eventregistry.api.EventRegistryEvent;
import org.flowable.eventregistry.api.InboundEvent;
import org.flowable.eventregistry.api.InboundEventProcessingPipeline;
import org.flowable.eventregistry.api.runtime.EventInstance;
import org.flowable.eventregistry.api.runtime.EventPayloadInstance;
import org.flowable.eventregistry.model.InboundChannelModel;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class RecordingInboundEventProcessorTest {

    private static final Instant NOON = Instant.parse("2026-08-25T12:00:00Z");

    private RecordingStore store;
    private EventRegistry registry;
    private EventRecorderProperties properties;

    @BeforeEach
    void setUp() {
        store = new RecordingStore();
        registry = mock(EventRegistry.class);
        properties = new EventRecorderProperties();
    }

    @Test
    void recordsTheChannelTheEventArrivedOn() {
        // The whole reason this sits on the processor seam rather than the consumer
        // seam: a consumer is never told the channel.
        processor().eventReceived(channel("orders", pipelineReturning(event("orderPlaced", "acme"))),
                inboundEvent("{\"id\":1}"));

        assertThat(store.records).singleElement().satisfies(recorded -> {
            assertThat(recorded.channelKey()).isEqualTo("orders");
            assertThat(recorded.eventKey()).isEqualTo("orderPlaced");
            assertThat(recorded.tenantId()).isEqualTo("acme");
            assertThat(recorded.status()).isEqualTo(EventRecordStatus.RECEIVED);
            assertThat(recorded.payload()).isEqualTo("{\"id\":1}");
            assertThat(recorded.receivedAt()).isEqualTo(NOON);
        });
    }

    @Test
    void dispatchesEveryProducedEventInOrder() {
        InboundChannelModel channel = channel("orders",
                pipelineReturning(event("first", null), event("second", null)));

        processor().eventReceived(channel, inboundEvent("{}"));

        var dispatched = org.mockito.ArgumentCaptor.forClass(EventRegistryEvent.class);
        verify(registry, org.mockito.Mockito.times(2)).sendEventToConsumers(dispatched.capture());
        assertThat(dispatched.getAllValues()).extracting(EventRegistryEvent::getType)
                .containsExactly("first", "second");
    }

    @Test
    void recordsAPayloadThatResolvedToNothing() {
        // "It arrived and matched nothing" is invisible from every other vantage point,
        // and is the single most useful row this feed produces.
        processor().eventReceived(channel("orders", pipelineReturning()), inboundEvent("{\"unknown\":true}"));

        assertThat(store.records).singleElement().satisfies(recorded -> {
            assertThat(recorded.status()).isEqualTo(EventRecordStatus.UNRESOLVED);
            assertThat(recorded.eventKey()).isNull();
            assertThat(recorded.payload()).isEqualTo("{\"unknown\":true}");
        });
        verify(registry, never()).sendEventToConsumers(any());
    }

    @Test
    void recordsAndRethrowsAPipelineFailure() {
        InboundChannelModel channel = channel("orders", (model, event) -> {
            throw new IllegalStateException("no key detector");
        });

        assertThatThrownBy(() -> processor().eventReceived(channel, inboundEvent("bad")))
                .isInstanceOf(IllegalStateException.class);

        assertThat(store.records).singleElement().satisfies(recorded -> {
            assertThat(recorded.status()).isEqualTo(EventRecordStatus.FAILED);
            assertThat(recorded.errorMessage()).isEqualTo("IllegalStateException: no key detector");
        });
    }

    @Test
    void keepsProcessingWhenTheStoreIsBroken() {
        // §13.4: a recorder that cannot write loses a diagnostic, never an event.
        EventRecordStore broken = mock(EventRecordStore.class);
        doThrow(new RuntimeException("disk full")).when(broken).record(any());
        var processor = new RecordingInboundEventProcessor(registry, broken, properties, fixedClock());

        processor.eventReceived(channel("orders", pipelineReturning(event("orderPlaced", null))),
                inboundEvent("{}"));

        verify(registry).sendEventToConsumers(any());
    }

    @Test
    void recordsBeforeDispatchingSoAConsumerFailureKeepsTheEvidence() {
        doThrow(new RuntimeException("consumer exploded")).when(registry).sendEventToConsumers(any());

        assertThatThrownBy(() -> processor().eventReceived(
                channel("orders", pipelineReturning(event("orderPlaced", null))), inboundEvent("{}")))
                .isInstanceOf(RuntimeException.class);

        assertThat(store.records).hasSize(1);
    }

    @Test
    void truncatesAnOversizedPayloadAndSaysSo() {
        properties.setMaxPayloadLength(10);

        processor().eventReceived(channel("orders", pipelineReturning(event("orderPlaced", null))),
                inboundEvent("0123456789ABCDEF"));

        assertThat(store.records).singleElement().satisfies(recorded -> {
            assertThat(recorded.payload()).isEqualTo("0123456789");
            assertThat(recorded.truncated()).isTrue();
        });
    }

    @Test
    void omitsThePayloadEntirelyWhenStorageIsTurnedOff() {
        // §13.7: the arrival record is useful even where the contents must not be kept.
        properties.setStorePayload(false);

        processor().eventReceived(channel("orders", pipelineReturning(event("orderPlaced", null))),
                inboundEvent("{\"ssn\":\"123-45-6789\"}"));

        assertThat(store.records).singleElement().satisfies(recorded -> {
            assertThat(recorded.payload()).isNull();
            assertThat(recorded.truncated()).isFalse();
            assertThat(recorded.eventKey()).isEqualTo("orderPlaced");
        });
    }

    private RecordingInboundEventProcessor processor() {
        return new RecordingInboundEventProcessor(registry, store, properties, fixedClock());
    }

    private static Clock fixedClock() {
        return Clock.fixed(NOON, ZoneOffset.UTC);
    }

    private static InboundChannelModel channel(String key, InboundEventProcessingPipeline pipeline) {
        InboundChannelModel model = new InboundChannelModel();
        model.setKey(key);
        model.setInboundEventProcessingPipeline(pipeline);
        return model;
    }

    private static InboundEventProcessingPipeline pipelineReturning(EventRegistryEvent... events) {
        return (model, event) -> List.of(events);
    }

    private static InboundEvent inboundEvent(String body) {
        return new InboundEvent() {

            @Override
            public Object getRawEvent() {
                return body;
            }

            @Override
            public Object getBody() {
                return body;
            }

            @Override
            public Map<String, Object> getHeaders() {
                return Map.of();
            }
        };
    }

    private static EventRegistryEvent event(String key, String tenantId) {
        EventInstance instance = new EventInstance() {

            @Override
            public String getEventKey() {
                return key;
            }

            @Override
            public Collection<EventPayloadInstance> getPayloadInstances() {
                return List.of();
            }

            @Override
            public Collection<EventPayloadInstance> getHeaderInstances() {
                return List.of();
            }

            @Override
            public Collection<EventPayloadInstance> getCorrelationParameterInstances() {
                return List.of();
            }

            @Override
            public String getTenantId() {
                return tenantId;
            }
        };
        return new EventRegistryEvent() {

            @Override
            public String getType() {
                return key;
            }

            @Override
            public Object getEventObject() {
                return instance;
            }
        };
    }

    /** A store that keeps rows in a list — enough to assert on, with no database. */
    private static final class RecordingStore implements EventRecordStore {

        private final List<RecordedEvent> records = new ArrayList<>();

        @Override
        public void record(RecordedEvent event) {
            records.add(event);
        }

        @Override
        public EventRecordPage query(EventRecordQuery query) {
            return new EventRecordPage(List.copyOf(records), records.size(), query.start(), query.size());
        }

        @Override
        public int purgeOlderThan(Instant before) {
            return 0;
        }
    }
}
