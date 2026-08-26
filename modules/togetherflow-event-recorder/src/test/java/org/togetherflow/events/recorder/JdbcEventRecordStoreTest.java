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

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import javax.sql.DataSource;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseBuilder;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseType;

class JdbcEventRecordStoreTest {

    private static final Instant NOON = Instant.parse("2026-08-25T12:00:00Z");

    private DataSource dataSource;
    private JdbcEventRecordStore store;

    @BeforeEach
    void setUp() {
        dataSource = new EmbeddedDatabaseBuilder()
                .setType(EmbeddedDatabaseType.H2)
                .setName(UUID.randomUUID().toString())
                .build();
        store = new JdbcEventRecordStore(dataSource, new EventRecorderProperties());
    }

    @Test
    void createsItsTableOnFirstUse() {
        store.record(record("orders", "orderPlaced", NOON, EventRecordStatus.RECEIVED));

        assertThat(store.query(query(25)).data()).hasSize(1);
    }

    @Test
    void isIdempotentWhenTheTableAlreadyExists() {
        store.record(record("orders", "orderPlaced", NOON, EventRecordStatus.RECEIVED));

        // A second instance over the same datasource — a restart, or a second replica —
        // must not try to create the table again.
        JdbcEventRecordStore second = new JdbcEventRecordStore(dataSource, new EventRecorderProperties());

        assertThat(second.query(query(25)).data()).hasSize(1);
    }

    @Test
    void returnsNewestFirst() {
        store.record(record("orders", "first", NOON.minus(2, ChronoUnit.MINUTES), EventRecordStatus.RECEIVED));
        store.record(record("orders", "second", NOON.minus(1, ChronoUnit.MINUTES), EventRecordStatus.RECEIVED));
        store.record(record("orders", "third", NOON, EventRecordStatus.RECEIVED));

        assertThat(store.query(query(25)).data())
                .extracting(RecordedEvent::eventKey)
                .containsExactly("third", "second", "first");
    }

    @Test
    void pagesWithoutRepeatingOrSkippingAcrossTheBoundary() {
        for (int i = 0; i < 5; i++) {
            store.record(record("orders", "event-" + i, NOON.minusSeconds(i), EventRecordStatus.RECEIVED));
        }

        EventRecordPage first = store.query(new EventRecordQuery(null, null, null, null, null, null, 0, 2));
        EventRecordPage second = store.query(new EventRecordQuery(null, null, null, null, null, null, 2, 2));
        EventRecordPage last = store.query(new EventRecordQuery(null, null, null, null, null, null, 4, 2));

        assertThat(first.total()).isEqualTo(5);
        assertThat(first.data()).extracting(RecordedEvent::eventKey).containsExactly("event-0", "event-1");
        assertThat(second.data()).extracting(RecordedEvent::eventKey).containsExactly("event-2", "event-3");
        assertThat(last.data()).extracting(RecordedEvent::eventKey).containsExactly("event-4");
    }

    @Test
    void ordersDeterministicallyWhenTimestampsCollide() {
        // Several events in the same millisecond is the normal case for a busy channel,
        // and the reason the sort has ID_ as a tiebreak.
        for (int i = 0; i < 6; i++) {
            store.record(record("orders", "same-" + i, NOON, EventRecordStatus.RECEIVED));
        }

        var firstPage = store.query(new EventRecordQuery(null, null, null, null, null, null, 0, 3)).data();
        var secondPage = store.query(new EventRecordQuery(null, null, null, null, null, null, 3, 3)).data();

        assertThat(firstPage).extracting(RecordedEvent::id)
                .doesNotContainAnyElementsOf(secondPage.stream().map(RecordedEvent::id).toList());
    }

    @Test
    void filtersByChannelEventStatusAndWindow() {
        store.record(record("orders", "orderPlaced", NOON, EventRecordStatus.RECEIVED));
        store.record(record("shipping", "orderPlaced", NOON, EventRecordStatus.RECEIVED));
        store.record(record("orders", null, NOON, EventRecordStatus.UNRESOLVED));
        store.record(record("orders", "orderPlaced", NOON.minus(2, ChronoUnit.DAYS), EventRecordStatus.RECEIVED));

        assertThat(store.query(new EventRecordQuery("orders", null, null, null, null, null, 0, 25)).total())
                .isEqualTo(3);
        assertThat(store.query(new EventRecordQuery(null, "orderPlaced", null, null, null, null, 0, 25)).total())
                .isEqualTo(3);
        assertThat(store.query(new EventRecordQuery(
                null, null, null, EventRecordStatus.UNRESOLVED, null, null, 0, 25)).total())
                .isEqualTo(1);
        assertThat(store.query(new EventRecordQuery(
                null, null, null, null, NOON.minus(1, ChronoUnit.DAYS), null, 0, 25)).total())
                .isEqualTo(3);
    }

    /**
     * Pins a **known limitation**, not a desired behaviour: with no tenant filter the
     * store returns every tenant's rows, because {@code appendEquals} skips a null value
     * and the endpoint's {@code tenantId} parameter is optional.
     *
     * <p>Written down as a test so it cannot change silently in either direction. The
     * README and ADR 0015 both warn about it; if someone enforces tenant scoping here,
     * this test fails and points at the documents that need updating with it. Note the
     * fix is not to reject a forged {@code tenantId} — it is to supply one when the
     * caller does not, which needs the host application's authenticated principal.
     */
    @Test
    void returnsEveryTenantWhenNoTenantIsAsked() {
        store.record(new RecordedEvent("a", NOON, "orders", "orderPlaced", "acme",
                EventRecordStatus.RECEIVED, "{}", false, null));
        store.record(new RecordedEvent("g", NOON, "orders", "orderPlaced", "globex",
                EventRecordStatus.RECEIVED, "{}", false, null));

        assertThat(store.query(query(25)).data())
                .extracting(RecordedEvent::tenantId)
                .containsExactlyInAnyOrder("acme", "globex");

        // Supplied, it does scope correctly — the gap is the unfiltered default.
        assertThat(store.query(new EventRecordQuery(null, null, "acme", null, null, null, 0, 25)).data())
                .extracting(RecordedEvent::tenantId)
                .containsExactly("acme");
    }

    @Test
    void roundTripsEveryField() {
        store.record(new RecordedEvent("id-1", NOON, "orders", "orderPlaced", "acme",
                EventRecordStatus.FAILED, "{\"a\":1}", true, "BoomException: nope"));

        RecordedEvent stored = store.query(query(25)).data().get(0);

        assertThat(stored.id()).isEqualTo("id-1");
        assertThat(stored.receivedAt()).isEqualTo(NOON);
        assertThat(stored.channelKey()).isEqualTo("orders");
        assertThat(stored.eventKey()).isEqualTo("orderPlaced");
        assertThat(stored.tenantId()).isEqualTo("acme");
        assertThat(stored.status()).isEqualTo(EventRecordStatus.FAILED);
        assertThat(stored.payload()).isEqualTo("{\"a\":1}");
        assertThat(stored.truncated()).isTrue();
        assertThat(stored.errorMessage()).isEqualTo("BoomException: nope");
    }

    @Test
    void purgesOnlyWhatIsPastRetention() {
        store.record(record("orders", "old", NOON.minus(8, ChronoUnit.DAYS), EventRecordStatus.RECEIVED));
        store.record(record("orders", "recent", NOON, EventRecordStatus.RECEIVED));

        int removed = store.purgeOlderThan(NOON.minus(7, ChronoUnit.DAYS));

        assertThat(removed).isEqualTo(1);
        assertThat(store.query(query(25)).data()).extracting(RecordedEvent::eventKey).containsExactly("recent");
    }

    @Test
    void refusesATableNameThatIsNotAPlainIdentifier() {
        EventRecorderProperties injected = new EventRecorderProperties();
        injected.setTableName("TF_EVENT_RECORD; DROP TABLE ACT_RU_TASK");

        assertThatThrownBy(() -> new JdbcEventRecordStore(dataSource, injected))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("plain SQL identifier");
    }

    private static EventRecordQuery query(int size) {
        return new EventRecordQuery(null, null, null, null, null, null, 0, size);
    }

    private static RecordedEvent record(String channel, String eventKey, Instant at, EventRecordStatus status) {
        return new RecordedEvent(UUID.randomUUID().toString(), at, channel, eventKey, null, status, "{}", false, null);
    }
}
