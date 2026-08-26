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
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.InitializingBean;

/**
 * Drops rows past their retention window.
 *
 * <p>An inbound feed with no expiry is a table that grows for as long as the deployment
 * runs, on the busiest path the system has. REQUIREMENTS.md §13.7 also wants a stated
 * retention story for anything that can hold personal data, and an event payload can.
 *
 * <p>Its own single-threaded executor rather than {@code @Scheduled}: enabling Spring's
 * scheduling would switch it on for the whole host application, which is not this
 * module's decision to make.
 */
public class EventRecorderRetention implements InitializingBean, DisposableBean {

    private static final Logger LOGGER = LoggerFactory.getLogger(EventRecorderRetention.class);

    private final EventRecordStore store;
    private final EventRecorderProperties properties;
    private final Clock clock;
    private ScheduledExecutorService executor;

    public EventRecorderRetention(EventRecordStore store, EventRecorderProperties properties, Clock clock) {
        this.store = store;
        this.properties = properties;
        this.clock = clock;
    }

    @Override
    public void afterPropertiesSet() {
        long intervalSeconds = Math.max(60, properties.getPurgeInterval().toSeconds());
        executor = Executors.newSingleThreadScheduledExecutor(runnable -> {
            Thread thread = new Thread(runnable, "togetherflow-event-recorder-purge");
            // Never hold shutdown open for a purge; the next start will catch up.
            thread.setDaemon(true);
            return thread;
        });
        executor.scheduleWithFixedDelay(this::purge, intervalSeconds, intervalSeconds, TimeUnit.SECONDS);
    }

    /** Visible for testing: one purge, run inline. */
    void purge() {
        try {
            int removed = store.purgeOlderThan(clock.instant().minus(properties.getRetention()));
            if (removed > 0) {
                LOGGER.debug("Purged {} inbound event records past retention", removed);
            }
        } catch (Exception failed) {
            // scheduleWithFixedDelay cancels the schedule if the task throws, so a single
            // failed purge must not be allowed to end all future ones.
            LOGGER.warn("Inbound event log purge failed; will retry at the next interval", failed);
        }
    }

    @Override
    public void destroy() {
        if (executor != null) {
            executor.shutdownNow();
        }
    }
}
