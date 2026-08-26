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
 * Filters for the inbound log. Every field is optional; a null means "don't constrain".
 *
 * <p>Paging is mandatory rather than optional, matching the engine's own collection
 * resources and REQUIREMENTS.md §8 ("never load unbounded result sets client-side").
 */
public record EventRecordQuery(
        String channelKey,
        String eventKey,
        String tenantId,
        EventRecordStatus status,
        Instant receivedAfter,
        Instant receivedBefore,
        int start,
        int size) {

    public EventRecordQuery {
        if (start < 0) {
            start = 0;
        }
        if (size < 1) {
            size = 1;
        }
    }
}
