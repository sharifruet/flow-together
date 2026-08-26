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
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * The {@code GET} the engine never had (REQUIREMENTS.md §7.2).
 *
 * <p>Mounted alongside the host application's other endpoints, so it inherits whatever
 * <em>authentication</em> that application already enforces — this adds no authentication
 * of its own, and must not be exposed on an unauthenticated port.
 *
 * <p><strong>Authorization it does enforce.</strong> Under
 * {@link EventRecorderTenantScope#STRICT}, rows are filtered to the tenant an
 * {@link EventRecorderTenantResolver} names, and a {@code tenantId} parameter that
 * disagrees is refused. This used to be missing entirely: {@code tenantId} was a filter the
 * caller chose, so omitting it returned every tenant's rows, payloads and all, to anyone the
 * host application had authenticated. The UI always sent the active tenant, but the UI is
 * not a boundary — that value came from a client-side setting.
 */
@RestController
public class EventRecorderController {

    /**
     * Matches the engine's own collection resources, which cap at 100 per page. Deep
     * paging over a diagnostic feed is not a use case worth widening it for.
     */
    private static final int MAX_PAGE_SIZE = 100;

    private final EventRecordStore store;
    private final EventRecorderProperties properties;
    private final EventRecorderTenantResolver tenantResolver;

    /**
     * @param tenantResolver required under {@link EventRecorderTenantScope#STRICT} and
     *                       ignored under {@code SINGLE_TENANT}; the autoconfiguration
     *                       refuses to start rather than passing {@code null} for the first
     */
    public EventRecorderController(EventRecordStore store, EventRecorderProperties properties,
            EventRecorderTenantResolver tenantResolver) {
        this.store = store;
        this.properties = properties;
        this.tenantResolver = tenantResolver;
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
                channelKey, eventKey, tenantFor(tenantId), status, receivedAfter, receivedBefore,
                // Only the cap is applied here. Flooring belongs to EventRecordQuery's
                // compact constructor, which already does it — repeating it would read as
                // two independent guards when there is one.
                start, Math.min(size, MAX_PAGE_SIZE)));
    }

    /**
     * The tenant this query actually runs under.
     *
     * <p>Under {@code STRICT} the resolver decides, never the caller. A caller-supplied
     * value is allowed only when it agrees — silently overriding a mismatch would hide both
     * a UI bug and an attempt, and they look identical from here.
     */
    private String tenantFor(String requested) {
        if (properties.getTenantScope() == EventRecorderTenantScope.SINGLE_TENANT) {
            return requested;
        }

        String allowed = tenantResolver.currentTenantId();
        if (allowed == null || allowed.isBlank()) {
            // Not "no restriction". The resolver could not say who is asking, and the
            // answer to that is no rows, not all of them.
            throw new TenantNotPermitted("The current caller's tenant could not be determined.");
        }
        if (requested != null && !requested.isBlank() && !requested.equals(allowed)) {
            throw new TenantNotPermitted("Not permitted to read events for tenant " + requested + ".");
        }
        return allowed;
    }

    /** 403 rather than 404: the rows may well exist, and this caller may not have them. */
    @ResponseStatus(HttpStatus.FORBIDDEN)
    static class TenantNotPermitted extends ResponseStatusException {

        private static final long serialVersionUID = 1L;

        TenantNotPermitted(String reason) {
            super(HttpStatus.FORBIDDEN, reason);
        }
    }
}
