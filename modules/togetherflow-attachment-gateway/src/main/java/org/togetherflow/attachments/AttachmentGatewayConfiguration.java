package org.togetherflow.attachments;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

/**
 * Wires the configured provider.
 *
 * <p>Configuration is validated at startup rather than on the first upload: a gateway
 * that starts happily and fails only when someone attaches a file has moved the failure
 * to the worst possible moment.
 */
@Configuration
@EnableConfigurationProperties(AttachmentProperties.class)
public class AttachmentGatewayConfiguration {

    /**
     * The HTTP client is taken as an {@link ObjectProvider} and only realised for the
     * SharePoint provider: a filesystem gateway talks to nothing over the network, and
     * should not fail to start because no {@code RestClient.Builder} happens to be
     * auto-configured.
     */
    @Bean
    public AttachmentStore attachmentStore(AttachmentProperties properties,
            ObjectProvider<RestClient.Builder> http) {
        return switch (properties.getProvider()) {
            case FILESYSTEM -> {
                if (properties.getFilesystem().getBasePath() == null) {
                    throw new IllegalStateException(
                            "togetherflow.attachments.provider=filesystem requires "
                                    + "togetherflow.attachments.filesystem.base-path");
                }
                yield new FilesystemAttachmentStore(properties.getFilesystem().getBasePath(),
                        properties.getFilesystem().getPublicBaseUrl());
            }
            case SHAREPOINT -> {
                AttachmentProperties.SharePoint sp = properties.getSharepoint();
                require(sp.getTenantId(), "sharepoint.tenant-id");
                require(sp.getClientId(), "sharepoint.client-id");
                require(sp.getClientSecret(), "sharepoint.client-secret");
                require(sp.getDriveId(), "sharepoint.drive-id");
                yield new SharePointAttachmentStore(sp,
                        http.getIfAvailable(RestClient::builder).build());
            }
            case DB -> throw new IllegalStateException(
                    "togetherflow.attachments.provider=db needs no gateway: the Work app posts "
                            + "straight to Flowable's own task-attachment endpoint. Don't deploy "
                            + "this module for a db install.");
        };
    }

    private static void require(String value, String name) {
        if (value == null || value.isBlank()) {
            throw new IllegalStateException(
                    "togetherflow.attachments.provider=sharepoint requires togetherflow.attachments." + name);
        }
    }
}
