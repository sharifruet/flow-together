package org.togetherflow.attachments;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * The gateway, run as its own service (REQUIREMENTS.md §7.6).
 *
 * <p>Deployed only when a non-{@code db} attachment provider is configured. With the
 * default {@code db} provider this process does not exist for that install at all.
 */
@SpringBootApplication
public class AttachmentGatewayApplication {

    public static void main(String[] args) {
        SpringApplication.run(AttachmentGatewayApplication.class, args);
    }
}
