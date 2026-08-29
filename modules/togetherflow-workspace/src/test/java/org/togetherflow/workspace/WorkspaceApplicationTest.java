package org.togetherflow.workspace;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

/**
 * The service starts.
 *
 * <p>Worth a test of its own: every other test here calls the classes directly, so a
 * broken bean definition — a missing datasource, a security chain that does not
 * assemble, a property class not bound — would not fail anything until deployment. The
 * tables are created on first use, so this also proves the DDL runs.
 */
@SpringBootTest
@TestPropertySource(properties = {
        "spring.datasource.url=jdbc:h2:mem:workspace-context;DB_CLOSE_DELAY=-1",
        "spring.datasource.driver-class-name=org.h2.Driver",
        "togetherflow.workspace.flowable-base-url=http://localhost:9999/service",
})
class WorkspaceApplicationTest {

    @Autowired
    private WorkspaceStore store;

    @Autowired
    private WorkspaceService service;

    @Autowired
    private WorkspaceProperties properties;

    @Test
    void the_context_starts_and_the_tables_exist() {
        // Reading through the store proves the CREATE TABLE ran, not merely that a bean
        // was constructed.
        assertThat(store.listWorkspaces(null)).isEmpty();
        assertThat(service).isNotNull();
        assertThat(properties.getTablePrefix()).isEqualTo("TF_");
    }
}
