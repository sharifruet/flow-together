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

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The {@code GET} the engine never had (REQUIREMENTS.md §7.2).
 *
 * <p>Mounted alongside the host application's other endpoints, so it inherits whatever
 * authentication that application already enforces — this adds no security model of its
 * own, and must not be exposed on an unauthenticated port. Payloads are readable here,
 * which is the point and also the risk; see {@code store-payload} in
 * {@link EventRecorderProperties}.
 */
@RestController
public class EventRecorderController {

    /**
     * Matches the engine's own collection resources, which cap at 100 per page. Deep
     * paging over a diagnostic feed is not a use case worth widening it for.
     */
    private static final int MAX_PAGE_SIZE = 100;

    private final EventRecordStore store;

    public EventRecorderController(EventRecordStore store) {
        this.store = store;
    }

    @GetMapping(value = "/event-recorder/events", produces = "application/json")
    public EventRecordPage list(
            @RequestParam(required = false) String channelKey,
            @RequestParam(required = false) String eventKey,
            @RequestParam(required = false) String tenantId,
            @RequestParam(required = false) EventRecordStatus status,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant receivedAfter,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant receivedBefore,
            @RequestParam(defaultValue = "0") int start,
            @RequestParam(defaultValue = "25") int size) {

        return store.query(new EventRecordQuery(
                channelKey, eventKey, tenantId, status, receivedAfter, receivedBefore,
                start, Math.min(size, MAX_PAGE_SIZE)));
    }
}
