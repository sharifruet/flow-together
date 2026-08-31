package org.togetherflow.workspace.git;

import java.sql.Timestamp;
import java.util.Optional;

import javax.sql.DataSource;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

/** Persists which repository a workspace is connected to (ADR 0018). */
public class GitConnectionStore {

    private static final Logger LOGGER = LoggerFactory.getLogger(GitConnectionStore.class);

    private final JdbcTemplate jdbc;
    private final String table;

    public GitConnectionStore(DataSource dataSource, String tablePrefix) {
        this.jdbc = new JdbcTemplate(dataSource);
        this.table = tablePrefix + "WORKSPACE_GIT";
        createTableIfAbsent();
    }

    private void createTableIfAbsent() {
        try {
            jdbc.execute("SELECT 1 FROM " + table + " WHERE 1 = 0");
            return;
        } catch (Exception notThere) {
            LOGGER.info("Creating Git connection table {}", table);
        }
        jdbc.execute("CREATE TABLE " + table + " ("
                + "WORKSPACE_ID_ VARCHAR(64) NOT NULL, "
                + "REMOTE_URL_ VARCHAR(1000) NOT NULL, "
                + "BRANCH_ VARCHAR(255) NOT NULL, "
                + "SUB_PATH_ VARCHAR(500), "
                + "CONNECTED_AT_ TIMESTAMP NOT NULL, "
                + "CONNECTED_BY_ VARCHAR(255), "
                + "PRIMARY KEY (WORKSPACE_ID_))");
    }

    private static final RowMapper<GitConnection> MAPPER = (rs, row) -> new GitConnection(
            rs.getString("WORKSPACE_ID_"),
            rs.getString("REMOTE_URL_"),
            rs.getString("BRANCH_"),
            rs.getString("SUB_PATH_"),
            rs.getTimestamp("CONNECTED_AT_").toInstant(),
            rs.getString("CONNECTED_BY_"));

    public Optional<GitConnection> find(String workspaceId) {
        return jdbc.query("SELECT * FROM " + table + " WHERE WORKSPACE_ID_ = ?", MAPPER, workspaceId)
                .stream().findFirst();
    }

    public void save(GitConnection connection) {
        int updated = jdbc.update("UPDATE " + table
                + " SET REMOTE_URL_ = ?, BRANCH_ = ?, SUB_PATH_ = ? WHERE WORKSPACE_ID_ = ?",
                connection.remoteUrl(), connection.branch(), connection.subPathOrEmpty(),
                connection.workspaceId());
        if (updated == 0) {
            jdbc.update("INSERT INTO " + table
                    + " (WORKSPACE_ID_, REMOTE_URL_, BRANCH_, SUB_PATH_, CONNECTED_AT_, CONNECTED_BY_)"
                    + " VALUES (?, ?, ?, ?, ?, ?)",
                    connection.workspaceId(), connection.remoteUrl(), connection.branch(),
                    connection.subPathOrEmpty(), Timestamp.from(connection.connectedAt()),
                    connection.connectedBy());
        }
    }

    public void delete(String workspaceId) {
        jdbc.update("DELETE FROM " + table + " WHERE WORKSPACE_ID_ = ?", workspaceId);
    }
}
