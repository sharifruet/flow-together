package org.togetherflow.workspace;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

import javax.sql.DataSource;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

/**
 * Workspace storage in the host's own datasource, in tables this module owns.
 *
 * <p>Deliberately <em>not</em> part of any engine's schema (ADR 0017). Adding a table to
 * {@code flowable-engine} would mean a create script and an upgrade step for six
 * dialects, a {@code FlowableVersions} entry gated by {@code SqlUpgradeValidationTest},
 * and a persistent-schema divergence from upstream that every future merge would have to
 * carry — for a concept upstream does not have. Same reasoning, same mechanism, as
 * {@code TF_EVENT_RECORD} in ADR 0015.
 */
public class JdbcWorkspaceStore implements WorkspaceStore {

    private static final Logger LOGGER = LoggerFactory.getLogger(JdbcWorkspaceStore.class);

    private final JdbcTemplate jdbc;
    private final String workspaces;
    private final String members;
    private final String models;

    public JdbcWorkspaceStore(DataSource dataSource, String tablePrefix) {
        this.jdbc = new JdbcTemplate(dataSource);
        this.workspaces = tablePrefix + "WORKSPACE";
        this.members = tablePrefix + "WORKSPACE_MEMBER";
        this.models = tablePrefix + "WORKSPACE_MODEL";
        createTablesIfAbsent();
    }

    /**
     * Probes rather than issuing {@code CREATE TABLE IF NOT EXISTS}, which Oracle and DB2
     * do not accept. A failing select is the one existence check every dialect agrees on.
     */
    private void createTablesIfAbsent() {
        if (!absent(workspaces)) {
            return;
        }
        LOGGER.info("Creating workspace tables {}, {}, {}", workspaces, members, models);
        jdbc.execute("CREATE TABLE " + workspaces + " ("
                + "ID_ VARCHAR(64) NOT NULL, "
                + "KEY_ VARCHAR(255) NOT NULL, "
                + "NAME_ VARCHAR(255) NOT NULL, "
                + "DESCRIPTION_ VARCHAR(1000), "
                + "TENANT_ID_ VARCHAR(255), "
                + "VISIBILITY_ VARCHAR(16) NOT NULL, "
                + "SHARED_ID_ VARCHAR(64), "
                + "CREATED_BY_ VARCHAR(255), "
                + "CREATED_AT_ TIMESTAMP NOT NULL, "
                + "PRIMARY KEY (ID_))");
        jdbc.execute("CREATE TABLE " + members + " ("
                + "WORKSPACE_ID_ VARCHAR(64) NOT NULL, "
                + "PRINCIPAL_TYPE_ VARCHAR(8) NOT NULL, "
                + "PRINCIPAL_ID_ VARCHAR(255) NOT NULL, "
                + "ROLE_ VARCHAR(16) NOT NULL, "
                + "PRIMARY KEY (WORKSPACE_ID_, PRINCIPAL_TYPE_, PRINCIPAL_ID_))");
        /*
         * A model belongs to at most one workspace, so the model id is the key. That is
         * the constraint rather than a convention: two rows for one model would make
         * "which role governs this model" ambiguous, and the ambiguity would resolve
         * differently depending on row order.
         */
        jdbc.execute("CREATE TABLE " + models + " ("
                + "MODEL_ID_ VARCHAR(64) NOT NULL, "
                + "WORKSPACE_ID_ VARCHAR(64) NOT NULL, "
                + "PRIMARY KEY (MODEL_ID_))");
        jdbc.execute("CREATE INDEX " + models + "_WS ON " + models + " (WORKSPACE_ID_)");
    }

    private boolean absent(String table) {
        try {
            jdbc.execute("SELECT 1 FROM " + table + " WHERE 1 = 0");
            return false;
        } catch (Exception notThere) {
            return true;
        }
    }

    private static final RowMapper<Workspace> WORKSPACE_MAPPER = (ResultSet rs, int row) -> new Workspace(
            rs.getString("ID_"),
            rs.getString("KEY_"),
            rs.getString("NAME_"),
            rs.getString("DESCRIPTION_"),
            rs.getString("TENANT_ID_"),
            WorkspaceVisibility.parse(rs.getString("VISIBILITY_")),
            rs.getString("SHARED_ID_"),
            rs.getString("CREATED_BY_"),
            timestamp(rs));

    private static java.time.Instant timestamp(ResultSet rs) throws SQLException {
        Timestamp value = rs.getTimestamp("CREATED_AT_");
        return value == null ? null : value.toInstant();
    }

    private static final RowMapper<WorkspaceMember> MEMBER_MAPPER = (ResultSet rs, int row) -> new WorkspaceMember(
            rs.getString("WORKSPACE_ID_"),
            WorkspaceMember.PrincipalType.parse(rs.getString("PRINCIPAL_TYPE_")),
            rs.getString("PRINCIPAL_ID_"),
            WorkspaceRole.parse(rs.getString("ROLE_")));

    @Override
    public List<Workspace> listWorkspaces(String tenantId) {
        // Null and empty are the same tenant, so the predicate has to accept both rather
        // than relying on `= ?` which never matches NULL.
        return jdbc.query("SELECT * FROM " + workspaces
                + " WHERE (TENANT_ID_ = ? OR (TENANT_ID_ IS NULL AND ? IS NULL)) ORDER BY NAME_",
                WORKSPACE_MAPPER, blankToNull(tenantId), blankToNull(tenantId));
    }

    @Override
    public Optional<Workspace> findWorkspace(String workspaceId) {
        return jdbc.query("SELECT * FROM " + workspaces + " WHERE ID_ = ?", WORKSPACE_MAPPER, workspaceId)
                .stream().findFirst();
    }

    @Override
    public Optional<Workspace> findWorkspaceByKey(String key, String tenantId) {
        return jdbc.query("SELECT * FROM " + workspaces
                + " WHERE KEY_ = ? AND (TENANT_ID_ = ? OR (TENANT_ID_ IS NULL AND ? IS NULL))",
                WORKSPACE_MAPPER, key, blankToNull(tenantId), blankToNull(tenantId))
                .stream().findFirst();
    }

    @Override
    public void saveWorkspace(Workspace workspace) {
        int updated = jdbc.update("UPDATE " + workspaces
                + " SET KEY_ = ?, NAME_ = ?, DESCRIPTION_ = ?, VISIBILITY_ = ?, SHARED_ID_ = ? WHERE ID_ = ?",
                workspace.key(), workspace.name(), workspace.description(),
                workspace.visibility().name(), workspace.sharedWorkspaceId(), workspace.id());
        if (updated == 0) {
            jdbc.update("INSERT INTO " + workspaces
                    + " (ID_, KEY_, NAME_, DESCRIPTION_, TENANT_ID_, VISIBILITY_, SHARED_ID_, CREATED_BY_, CREATED_AT_)"
                    + " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    workspace.id(), workspace.key(), workspace.name(), workspace.description(),
                    blankToNull(workspace.tenantId()), workspace.visibility().name(),
                    workspace.sharedWorkspaceId(), workspace.createdBy(),
                    Timestamp.from(workspace.createdAt()));
        }
    }

    @Override
    public void deleteWorkspace(String workspaceId) {
        // Assignments and members first: leaving either behind would let a recreated
        // workspace inherit the old one's membership by id collision.
        jdbc.update("DELETE FROM " + models + " WHERE WORKSPACE_ID_ = ?", workspaceId);
        jdbc.update("DELETE FROM " + members + " WHERE WORKSPACE_ID_ = ?", workspaceId);
        jdbc.update("DELETE FROM " + workspaces + " WHERE ID_ = ?", workspaceId);
    }

    @Override
    public List<WorkspaceMember> membersOf(Collection<String> workspaceIds) {
        if (workspaceIds.isEmpty()) {
            return List.of();
        }
        String placeholders = String.join(", ", java.util.Collections.nCopies(workspaceIds.size(), "?"));
        return jdbc.query("SELECT * FROM " + members + " WHERE WORKSPACE_ID_ IN (" + placeholders + ")",
                MEMBER_MAPPER, workspaceIds.toArray());
    }

    @Override
    public void saveMember(WorkspaceMember member) {
        int updated = jdbc.update("UPDATE " + members + " SET ROLE_ = ?"
                + " WHERE WORKSPACE_ID_ = ? AND PRINCIPAL_TYPE_ = ? AND PRINCIPAL_ID_ = ?",
                member.role().name(), member.workspaceId(), member.principalType().name(),
                member.principalId());
        if (updated == 0) {
            jdbc.update("INSERT INTO " + members
                    + " (WORKSPACE_ID_, PRINCIPAL_TYPE_, PRINCIPAL_ID_, ROLE_) VALUES (?, ?, ?, ?)",
                    member.workspaceId(), member.principalType().name(), member.principalId(),
                    member.role().name());
        }
    }

    @Override
    public void removeMember(String workspaceId, WorkspaceMember.PrincipalType type, String principalId) {
        jdbc.update("DELETE FROM " + members
                + " WHERE WORKSPACE_ID_ = ? AND PRINCIPAL_TYPE_ = ? AND PRINCIPAL_ID_ = ?",
                workspaceId, type.name(), principalId);
    }

    @Override
    public Optional<String> workspaceIdForModel(String modelId) {
        return jdbc.query("SELECT WORKSPACE_ID_ FROM " + models + " WHERE MODEL_ID_ = ?",
                (rs, row) -> rs.getString(1), modelId).stream().findFirst();
    }

    @Override
    public void assignModel(String modelId, String workspaceId) {
        int updated = jdbc.update("UPDATE " + models + " SET WORKSPACE_ID_ = ? WHERE MODEL_ID_ = ?",
                workspaceId, modelId);
        if (updated == 0) {
            jdbc.update("INSERT INTO " + models + " (MODEL_ID_, WORKSPACE_ID_) VALUES (?, ?)",
                    modelId, workspaceId);
        }
    }

    @Override
    public void unassignModel(String modelId) {
        jdbc.update("DELETE FROM " + models + " WHERE MODEL_ID_ = ?", modelId);
    }

    @Override
    public List<String> modelIdsIn(String workspaceId) {
        List<String> ids = new ArrayList<>(
                jdbc.query("SELECT MODEL_ID_ FROM " + models + " WHERE WORKSPACE_ID_ = ?",
                        (rs, row) -> rs.getString(1), workspaceId));
        return List.copyOf(ids);
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}
