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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class EventRecorderControllerTest {

    private CapturingStore store;
    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        store = new CapturingStore();
        mockMvc = MockMvcBuilders.standaloneSetup(new EventRecorderController(store)).build();
    }

    @Test
    void bindsEveryFilterOntoTheQuery() throws Exception {
        mockMvc.perform(get("/event-recorder/events")
                        .param("channelKey", "orders")
                        .param("eventKey", "orderPlaced")
                        .param("tenantId", "acme")
                        .param("status", "UNRESOLVED")
                        .param("receivedAfter", "2026-08-25T10:00:00Z")
                        .param("receivedBefore", "2026-08-25T12:00:00Z")
                        .param("start", "50")
                        .param("size", "10"))
                .andExpect(status().isOk());

        assertThat(store.lastQuery.channelKey()).isEqualTo("orders");
        assertThat(store.lastQuery.eventKey()).isEqualTo("orderPlaced");
        assertThat(store.lastQuery.tenantId()).isEqualTo("acme");
        assertThat(store.lastQuery.status()).isEqualTo(EventRecordStatus.UNRESOLVED);
        assertThat(store.lastQuery.receivedAfter()).isEqualTo(Instant.parse("2026-08-25T10:00:00Z"));
        assertThat(store.lastQuery.receivedBefore()).isEqualTo(Instant.parse("2026-08-25T12:00:00Z"));
        assertThat(store.lastQuery.start()).isEqualTo(50);
        assertThat(store.lastQuery.size()).isEqualTo(10);
    }

    @Test
    void defaultsToAFirstPageWithNoFilters() throws Exception {
        mockMvc.perform(get("/event-recorder/events")).andExpect(status().isOk());

        assertThat(store.lastQuery.start()).isZero();
        assertThat(store.lastQuery.size()).isEqualTo(25);
        assertThat(store.lastQuery.channelKey()).isNull();
        assertThat(store.lastQuery.status()).isNull();
    }

    @Test
    void capsThePageSizeRatherThanTrustingTheCaller() throws Exception {
        mockMvc.perform(get("/event-recorder/events").param("size", "100000")).andExpect(status().isOk());

        assertThat(store.lastQuery.size()).isEqualTo(100);
    }

    private static final class CapturingStore implements EventRecordStore {

        private EventRecordQuery lastQuery;

        @Override
        public void record(RecordedEvent event) {
            throw new UnsupportedOperationException();
        }

        @Override
        public EventRecordPage query(EventRecordQuery query) {
            this.lastQuery = query;
            return new EventRecordPage(List.of(), 0, query.start(), query.size());
        }

        @Override
        public int purgeOlderThan(Instant before) {
            throw new UnsupportedOperationException();
        }
    }
}
