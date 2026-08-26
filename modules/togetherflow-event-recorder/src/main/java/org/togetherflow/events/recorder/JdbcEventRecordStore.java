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

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

import javax.sql.DataSource;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

/**
 * The inbound log in a table of its own.
 *
 * <p>Deliberately <em>not</em> part of the event registry engine's schema. That schema is
 * versioned: adding to it means a create script per dialect, an upgrade step per dialect
 * and a {@code FlowableVersions} entry, and it would diverge this fork from upstream for
 * a feature upstream does not have. This table is TogetherFlow's own, created on first
 * use, and dropping it costs nothing but the history in it.
 *
 * <p>The column types are the intersection of what every dialect in this repo accepts:
 * {@code VARCHAR}, {@code TIMESTAMP} and {@code SMALLINT}, no {@code CLOB} and no
 * {@code BOOLEAN}. That is why the payload is a bounded {@code VARCHAR} rather than
 * unbounded text — see {@link EventRecorderProperties#getMaxPayloadLength()}.
 */
public class JdbcEventRecordStore implements EventRecordStore {

    private static final Logger LOGGER = LoggerFactory.getLogger(JdbcEventRecordStore.class);

    /**
     * The table name is interpolated into SQL rather than bound, because a table name
     * cannot be a bind parameter. It is therefore checked against this rather than
     * trusted — the property is operator-supplied, and "operator-supplied" is not the
     * same as "safe".
     */
    private static final Pattern SAFE_IDENTIFIER = Pattern.compile("[A-Za-z_][A-Za-z0-9_]{0,62}");

    private static final RowMapper<RecordedEvent> ROW_MAPPER = (rs, rowNum) -> new RecordedEvent(
            rs.getString("ID_"),
            rs.getTimestamp("RECEIVED_AT_").toInstant(),
            rs.getString("CHANNEL_KEY_"),
            rs.getString("EVENT_KEY_"),
            rs.getString("TENANT_ID_"),
            EventRecordStatus.valueOf(rs.getString("STATUS_")),
            rs.getString("PAYLOAD_"),
            rs.getShort("TRUNCATED_") != 0,
            rs.getString("ERROR_"));

    private final JdbcTemplate jdbc;
    private final String table;
    private final boolean limitOffsetDialect;

    public JdbcEventRecordStore(DataSource dataSource, EventRecorderProperties properties) {
        String name = properties.getTableName();
        if (name == null || !SAFE_IDENTIFIER.matcher(name).matches()) {
            throw new IllegalArgumentException(
                    "togetherflow.events.recorder.table-name must be a plain SQL identifier, got: " + name);
        }
        this.jdbc = new JdbcTemplate(dataSource);
        this.table = name;
        this.limitOffsetDialect = usesLimitOffset(dataSource);
        createTableIfAbsent();
    }

    /**
     * MySQL and MariaDB never implemented {@code OFFSET .. FETCH}; everything else this
     * repo supports does. Detected once, from the driver, rather than configured — an
     * operator should not have to tell us what database they already pointed us at.
     */
    private static boolean usesLimitOffset(DataSource dataSource) {
        try (var connection = dataSource.getConnection()) {
            String product = connection.getMetaData().getDatabaseProductName();
            if (product == null) {
                return false;
            }
            String lower = product.toLowerCase(Locale.ROOT);
            return lower.contains("mysql") || lower.contains("mariadb");
        } catch (Exception e) {
            // Standard syntax is the safer default: it covers five of the seven dialects.
            LOGGER.warn("Could not determine the database product; assuming OFFSET/FETCH paging", e);
            return false;
        }
    }

    /**
     * Probes rather than issuing {@code CREATE TABLE IF NOT EXISTS}, which Oracle and DB2
     * do not accept. A failing select is the one existence check every dialect agrees on.
     */
    private void createTableIfAbsent() {
        try {
            jdbc.execute("SELECT 1 FROM " + table + " WHERE 1 = 0");
            return;
        } catch (Exception notThere) {
            LOGGER.info("Creating inbound event log table {}", table);
        }
        jdbc.execute("CREATE TABLE " + table + " ("
                + "ID_ VARCHAR(64) NOT NULL, "
                + "RECEIVED_AT_ TIMESTAMP NOT NULL, "
                + "CHANNEL_KEY_ VARCHAR(255), "
                + "EVENT_KEY_ VARCHAR(255), "
                + "TENANT_ID_ VARCHAR(255), "
                + "STATUS_ VARCHAR(16) NOT NULL, "
                + "PAYLOAD_ VARCHAR(4000), "
                + "TRUNCATED_ SMALLINT NOT NULL, "
                + "ERROR_ VARCHAR(1000), "
                + "PRIMARY KEY (ID_))");
        // Every read orders by it and the purge deletes by it, so it is the one index
        // that earns its keep.
        jdbc.execute("CREATE INDEX " + table + "_RECV ON " + table + " (RECEIVED_AT_)");
    }

    @Override
    public void record(RecordedEvent event) {
        jdbc.update("INSERT INTO " + table
                        + " (ID_, RECEIVED_AT_, CHANNEL_KEY_, EVENT_KEY_, TENANT_ID_, STATUS_, PAYLOAD_, TRUNCATED_, ERROR_)"
                        + " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                event.id(),
                Timestamp.from(event.receivedAt()),
                event.channelKey(),
                event.eventKey(),
                event.tenantId(),
                event.status().name(),
                event.payload(),
                (short) (event.truncated() ? 1 : 0),
                event.errorMessage());
    }

    @Override
    public EventRecordPage query(EventRecordQuery query) {
        StringBuilder where = new StringBuilder();
        List<Object> args = new ArrayList<>();
        appendEquals(where, args, "CHANNEL_KEY_", query.channelKey());
        appendEquals(where, args, "EVENT_KEY_", query.eventKey());
        appendEquals(where, args, "TENANT_ID_", query.tenantId());
        appendEquals(where, args, "STATUS_", query.status() == null ? null : query.status().name());
        if (query.receivedAfter() != null) {
            append(where, "RECEIVED_AT_ >= ?");
            args.add(Timestamp.from(query.receivedAfter()));
        }
        if (query.receivedBefore() != null) {
            append(where, "RECEIVED_AT_ <= ?");
            args.add(Timestamp.from(query.receivedBefore()));
        }

        Long total = jdbc.queryForObject(
                "SELECT COUNT(*) FROM " + table + where, Long.class, args.toArray());

        // Newest first: an operator opening this screen is asking "what just happened".
        // ID_ breaks ties so a page boundary cannot repeat or skip a row when several
        // events share a millisecond (REQUIREMENTS.md §14.1).
        String sql = "SELECT * FROM " + table + where + " ORDER BY RECEIVED_AT_ DESC, ID_ DESC "
                + (limitOffsetDialect ? "LIMIT ? OFFSET ?" : "OFFSET ? ROWS FETCH NEXT ? ROWS ONLY");
        List<Object> paged = new ArrayList<>(args);
        if (limitOffsetDialect) {
            paged.add(query.size());
            paged.add(query.start());
        } else {
            paged.add(query.start());
            paged.add(query.size());
        }

        List<RecordedEvent> rows = jdbc.query(sql, ROW_MAPPER, paged.toArray());
        return new EventRecordPage(rows, total == null ? rows.size() : total, query.start(), query.size());
    }

    @Override
    public int purgeOlderThan(Instant before) {
        return jdbc.update("DELETE FROM " + table + " WHERE RECEIVED_AT_ < ?", Timestamp.from(before));
    }

    private static void appendEquals(StringBuilder where, List<Object> args, String column, String value) {
        if (value != null && !value.isBlank()) {
            append(where, column + " = ?");
            args.add(value);
        }
    }

    private static void append(StringBuilder where, String condition) {
        where.append(where.isEmpty() ? " WHERE " : " AND ").append(condition);
    }
}
