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
import java.util.Collection;
import java.util.UUID;

import org.flowable.eventregistry.api.EventRegistry;
import org.flowable.eventregistry.api.EventRegistryEvent;
import org.flowable.eventregistry.api.InboundEvent;
import org.flowable.eventregistry.api.InboundEventProcessingPipeline;
import org.flowable.eventregistry.api.InboundEventProcessor;
import org.flowable.eventregistry.api.runtime.EventInstance;
import org.flowable.eventregistry.model.InboundChannelModel;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * The seam. Sits where the engine's own inbound processor sits, records what arrived,
 * and dispatches exactly as the default does.
 *
 * <p><strong>Why here and not on the consumer seam.</strong> The obvious hook is
 * {@code EventRegistryEventConsumer}, which the registry already invites callers to
 * register. It cannot serve this feature: a consumer is handed an
 * {@code EventRegistryEvent} wrapping an {@link EventInstance}, and an
 * {@code EventInstance} carries the event key, tenant and payload but <em>not the
 * channel it arrived on</em> — the channel is known to
 * {@code DefaultInboundEventProcessor} and dropped before consumers are called. Since
 * §7.2 asks for events "received on a channel", channel attribution is the requirement,
 * not a nicety. The processor seam is public API ({@link EventRegistry#setInboundEventProcessor})
 * and is the earliest point that sees the channel, the raw payload, and the outcome.
 *
 * <p>It also sees the two cases a consumer never does: a payload that resolved to no
 * event at all, and a payload the pipeline rejected. Those are the interesting rows.
 *
 * <p><strong>What this replaces.</strong> Dispatch below is the stock
 * {@code DefaultInboundEventProcessor} behaviour — run the channel's pipeline, hand each
 * resulting event to the consumers, in order. A deployment that has installed its own
 * {@code InboundEventProcessor} must not enable the recorder, because this replaces it
 * rather than wrapping it; the installer logs what it displaced so that is visible.
 */
public class RecordingInboundEventProcessor implements InboundEventProcessor {

    private static final Logger LOGGER = LoggerFactory.getLogger(RecordingInboundEventProcessor.class);

    /** The width of {@code ERROR_}. Anything longer would fail the insert. */
    private static final int MAX_ERROR_LENGTH = 1000;

    private final EventRegistry eventRegistry;
    private final EventRecordStore store;
    private final EventRecorderProperties properties;
    private final Clock clock;

    public RecordingInboundEventProcessor(EventRegistry eventRegistry, EventRecordStore store,
            EventRecorderProperties properties, Clock clock) {
        this.eventRegistry = eventRegistry;
        this.store = store;
        this.properties = properties;
        this.clock = clock;
    }

    @Override
    public void eventReceived(InboundChannelModel channelModel, InboundEvent event) {
        // Not null-guarded: the pipeline is read off it below, so a null would have thrown
        // two lines later anyway. Guarding only the key read made it look otherwise.
        String channelKey = channelModel.getKey();
        String payload = payloadOf(event);

        Collection<EventRegistryEvent> produced;
        try {
            InboundEventProcessingPipeline pipeline =
                    (InboundEventProcessingPipeline) channelModel.getInboundEventProcessingPipeline();
            produced = pipeline.run(channelModel, event);
        } catch (RuntimeException rejected) {
            // Recorded before rethrowing: a payload the pipeline refuses is precisely
            // what an operator is hunting for, and it would otherwise leave no trace
            // beyond a stack trace in the log.
            record(channelKey, null, null, EventRecordStatus.FAILED, payload, describe(rejected));
            throw rejected;
        }

        if (produced == null || produced.isEmpty()) {
            record(channelKey, null, null, EventRecordStatus.UNRESOLVED, payload, null);
            return;
        }

        for (EventRegistryEvent registryEvent : produced) {
            // Record first, then dispatch: a consumer that throws must not cost us the
            // evidence that the event arrived.
            record(channelKey, eventKeyOf(registryEvent), tenantOf(registryEvent),
                    EventRecordStatus.RECEIVED, payload, null);
            eventRegistry.sendEventToConsumers(registryEvent);
        }
    }

    /**
     * Best-effort by design. This runs on the thread delivering the event — a broker
     * listener, or an HTTP request — and REQUIREMENTS.md §13.4 asks for degradation
     * rather than collapse. A recorder that cannot write is a lost diagnostic, not a
     * lost event, so every failure is swallowed after being logged.
     */
    private void record(String channelKey, String eventKey, String tenantId, EventRecordStatus status,
            String payload, String errorMessage) {
        try {
            boolean truncated = payload != null && payload.length() > properties.getMaxPayloadLength();
            String stored = !properties.isStorePayload() ? null
                    : truncated ? payload.substring(0, properties.getMaxPayloadLength()) : payload;
            store.record(new RecordedEvent(
                    UUID.randomUUID().toString(),
                    clock.instant(),
                    channelKey,
                    eventKey,
                    tenantId,
                    status,
                    stored,
                    properties.isStorePayload() && truncated,
                    errorMessage));
        } catch (Exception failed) {
            LOGGER.warn("Could not record an inbound event on channel {}; event processing continues",
                    channelKey, failed);
        }
    }

    private static String payloadOf(InboundEvent event) {
        if (event == null) {
            return null;
        }
        Object body = event.getBody();
        if (body == null) {
            body = event.getRawEvent();
        }
        return body == null ? null : body.toString();
    }

    private static String eventKeyOf(EventRegistryEvent event) {
        Object payload = event.getEventObject();
        return payload instanceof EventInstance instance ? instance.getEventKey() : event.getType();
    }

    private static String tenantOf(EventRegistryEvent event) {
        Object payload = event.getEventObject();
        return payload instanceof EventInstance instance ? instance.getTenantId() : null;
    }

    /**
     * Class name included: "null" on its own has sent people looking in the wrong place.
     *
     * <p>The message is dropped when payload storage is off, because it can carry the
     * payload. The stock pipeline throws {@code "No event model found for event key " +
     * eventKey}, and on a JSON channel that key is read straight out of the body — so the
     * one setting offered for "record the arrival, not the contents" was being bypassed on
     * exactly the rows most likely to hold malformed personal data.
     */
    private String describe(RuntimeException failure) {
        if (!properties.isStorePayload()) {
            return failure.getClass().getSimpleName();
        }
        String message = failure.getMessage();
        String text = failure.getClass().getSimpleName() + (message == null ? "" : ": " + message);
        return text.length() > MAX_ERROR_LENGTH ? text.substring(0, MAX_ERROR_LENGTH) : text;
    }
}
