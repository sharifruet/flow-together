package org.togetherflow.workspace;

import javax.sql.DataSource;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

/** Wires the service together. */
@Configuration
@EnableConfigurationProperties(org.togetherflow.workspace.git.GitProperties.class)
public class WorkspaceConfiguration {

    @Bean
    public WorkspaceStore workspaceStore(DataSource dataSource, WorkspaceProperties properties) {
        return new JdbcWorkspaceStore(dataSource, properties.getTablePrefix());
    }

    @Bean
    public WorkspaceService workspaceService(WorkspaceStore store, WorkspaceProperties properties) {
        return new WorkspaceService(store, properties);
    }

    @Bean
    public CallerResolver callerResolver(WorkspaceProperties properties) {
        return new CallerResolver(properties);
    }

    /**
     * Builds its own {@link RestClient.Builder} rather than injecting one.
     *
     * <p>Spring Boot does not always auto-configure that bean — it depends on which web
     * starters are present, and this service found out the hard way that it is absent
     * here. Constructing it directly also means the client this service uses to call
     * Flowable is not silently reshaped by an application-wide customizer.
     */
    @Bean
    public FlowableClient flowableClient(WorkspaceProperties properties) {
        return new FlowableClient(RestClient.builder(), properties);
    }

    /* ── Git connectivity (ADR 0018) ──────────────────────────────────────── */

    @Bean
    public org.togetherflow.workspace.git.GitConnectionStore gitConnectionStore(
            DataSource dataSource, WorkspaceProperties properties) {
        return new org.togetherflow.workspace.git.GitConnectionStore(dataSource,
                properties.getTablePrefix());
    }

    @Bean
    public org.togetherflow.workspace.git.WorkspaceModels workspaceModels(WorkspaceStore store,
            FlowableClient flowable) {
        return new org.togetherflow.workspace.git.FlowableWorkspaceModels(store, flowable);
    }

    @Bean
    public org.togetherflow.workspace.git.WorkspaceGitService workspaceGitService(
            WorkspaceService service,
            org.togetherflow.workspace.git.GitConnectionStore connections,
            org.togetherflow.workspace.git.WorkspaceModels models,
            org.togetherflow.workspace.git.GitProperties properties) {
        return new org.togetherflow.workspace.git.WorkspaceGitService(service, connections, models,
                properties);
    }
}
