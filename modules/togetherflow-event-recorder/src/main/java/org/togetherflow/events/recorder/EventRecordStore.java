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
 * Where the inbound log lives. One implementation ships ({@link JdbcEventRecordStore});
 * the interface exists so a deployment that wants records somewhere else — a log
 * shipper, an existing observability pipeline — can supply its own bean without
 * forking anything.
 */
public interface EventRecordStore {

    /**
     * Appends one row.
     *
     * <p>Called on the thread delivering the event, so implementations must be cheap and
     * must not throw: {@link RecordingInboundEventProcessor} treats recording as
     * best-effort precisely so that a full disk cannot stop event processing.
     */
    void record(RecordedEvent event);

    /** Reads a page, newest first. */
    EventRecordPage query(EventRecordQuery query);

    /**
     * Drops rows older than {@code before}.
     *
     * @return how many were removed
     */
    int purgeOlderThan(Instant before);
}
