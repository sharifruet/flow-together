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

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Configuration for the inbound event log (REQUIREMENTS.md §7.2, ADR 0015).
 */
@ConfigurationProperties(prefix = "togetherflow.events.recorder")
public class EventRecorderProperties {

    /**
     * The width of {@code PAYLOAD_}, and so the largest value {@link #maxPayloadLength}
     * can take.
     *
     * <p>Setting it higher used to be the quietest possible misconfiguration: every insert
     * overflowed the column, the recorder's best-effort {@code catch} swallowed it, and the
     * feature looked enabled while the table stayed empty. It is rejected at startup now.
     */
    public static final int MAX_PAYLOAD_COLUMN_LENGTH = 4000;

    /**
     * Off unless asked for. Recording adds a write to the path of every inbound event,
     * which is exactly the cost the engine's own design avoids, so it is not something
     * to switch on by accident.
     */
    private boolean enabled = false;

    /** Table name, in case {@code TF_EVENT_RECORD} collides with something. */
    private String tableName = "TF_EVENT_RECORD";

    /**
     * Who may read which rows. Defaults to {@link EventRecorderTenantScope#STRICT}, which
     * requires an {@link EventRecorderTenantResolver} bean and fails startup without one.
     *
     * <p>The previous behaviour is {@code single-tenant}: it is still available, and it is
     * still correct for a deployment with one tenant. What changed is that reaching it now
     * takes a line of configuration rather than being what happens by default.
     */
    private EventRecorderTenantScope tenantScope = EventRecorderTenantScope.STRICT;

    /**
     * Whether the payload itself is kept. Event payloads routinely carry personal data
     * (REQUIREMENTS.md §13.7), and a deployment may want the arrival record — which
     * channel, which event, when — without retaining the contents.
     */
    private boolean storePayload = true;

    /**
     * Payloads longer than this are truncated, and the row says so. The column is a
     * plain {@code VARCHAR} so the table stays portable across every dialect this repo
     * supports; 4000 is the smallest of their limits (Oracle's), and therefore also the
     * ceiling — see {@link #MAX_PAYLOAD_COLUMN_LENGTH}.
     */
    private int maxPayloadLength = 4000;


    /** How long rows are kept. Purging is what stops a diagnostic feed becoming a heap. */
    private Duration retention = Duration.ofDays(7);

    /** How often the purge runs. */
    private Duration purgeInterval = Duration.ofHours(1);

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getTableName() {
        return tableName;
    }

    public EventRecorderTenantScope getTenantScope() {
        return tenantScope;
    }

    public void setTenantScope(EventRecorderTenantScope tenantScope) {
        this.tenantScope = tenantScope;
    }

    public void setTableName(String tableName) {
        this.tableName = tableName;
    }

    public boolean isStorePayload() {
        return storePayload;
    }

    public void setStorePayload(boolean storePayload) {
        this.storePayload = storePayload;
    }

    public int getMaxPayloadLength() {
        return maxPayloadLength;
    }

    public void setMaxPayloadLength(int maxPayloadLength) {
        this.maxPayloadLength = maxPayloadLength;
    }

    public Duration getRetention() {
        return retention;
    }

    public void setRetention(Duration retention) {
        this.retention = retention;
    }

    public Duration getPurgeInterval() {
        return purgeInterval;
    }

    public void setPurgeInterval(Duration purgeInterval) {
        this.purgeInterval = purgeInterval;
    }
}
