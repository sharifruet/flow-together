package org.togetherflow.workspace;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

/**
 * The workspace service (ADR 0017).
 *
 * <p>Optional. A deployment that does not run it has one flat model library and no
 * workspaces, exactly as before — Design detects its absence and says so rather than
 * showing an empty switcher.
 */
@SpringBootApplication
@EnableConfigurationProperties(WorkspaceProperties.class)
public class WorkspaceApplication {

    public static void main(String[] args) {
        SpringApplication.run(WorkspaceApplication.class, args);
    }
}
