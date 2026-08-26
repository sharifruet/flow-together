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

import java.time.Instant;

/**
 * One row of the inbound log: something arrived on a channel, and this is what it was.
 *
 * @param id           surrogate id, generated here — the engine assigns none
 * @param receivedAt   when the recorder saw it, not when the producer sent it
 * @param channelKey   the inbound channel it arrived on
 * @param eventKey     the event definition it resolved to; null unless {@code RECEIVED}
 * @param tenantId     tenant of the resolved event; null when unresolved or untenanted
 * @param status       see {@link EventRecordStatus}
 * @param payload      the body as received, possibly truncated — see {@code truncated}
 * @param truncated    whether {@code payload} was cut to the configured maximum
 * @param errorMessage why the pipeline rejected it; null unless {@code FAILED}
 */
public record RecordedEvent(
        String id,
        Instant receivedAt,
        String channelKey,
        String eventKey,
        String tenantId,
        EventRecordStatus status,
        String payload,
        boolean truncated,
        String errorMessage) {
}
