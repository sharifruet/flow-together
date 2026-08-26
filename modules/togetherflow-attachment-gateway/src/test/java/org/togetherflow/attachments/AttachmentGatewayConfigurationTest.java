package org.togetherflow.attachments;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.web.client.RestClient;

/**
 * Startup validation.
 *
 * <p>The point of every case here is the same: a gateway that starts happily and fails only
 * when someone attaches a file has moved the failure to the worst possible moment — after
 * the user has already picked a file and waited for it to upload.
 */
class AttachmentGatewayConfigurationTest {

    private final AttachmentGatewayConfiguration configuration = new AttachmentGatewayConfiguration();

    /** The gateway never builds a RestClient for a provider that talks to nothing. */
    private static final ObjectProvider<RestClient.Builder> NO_HTTP = new ObjectProvider<>() {
        @Override
        public RestClient.Builder getObject() {
            return RestClient.builder();
        }

        @Override
        public RestClient.Builder getObject(Object... args) {
            return RestClient.builder();
        }

        @Override
        public RestClient.Builder getIfAvailable() {
            return null;
        }

        @Override
        public RestClient.Builder getIfUnique() {
            return null;
        }
    };

    private AttachmentProperties sharePointProperties() {
        AttachmentProperties properties = new AttachmentProperties();
        properties.setProvider(AttachmentProperties.Provider.SHAREPOINT);
        AttachmentProperties.SharePoint sp = properties.getSharepoint();
        sp.setTenantId("tenant-1");
        sp.setClientId("client-1");
        sp.setClientSecret("s3cret");
        sp.setDriveId("drive-1");
        return properties;
    }

    @Test
    void buildsTheSharePointStoreWhenFullyConfigured() {
        AttachmentStore store = configuration.attachmentStore(sharePointProperties(), NO_HTTP);

        assertThat(store).isInstanceOf(SharePointAttachmentStore.class);
        assertThat(store.provider()).isEqualTo(AttachmentProperties.Provider.SHAREPOINT);
    }

    @Test
    void namesTheMissingSharePointSetting() {
        AttachmentProperties properties = sharePointProperties();
        properties.getSharepoint().setDriveId("");

        assertThatThrownBy(() -> configuration.attachmentStore(properties, NO_HTTP))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("togetherflow.attachments.sharepoint.drive-id");
    }

    /**
     * Graph's simple upload stops at 250 MB. Accepting a larger limit means the rejection
     * arrives only after the whole file has been transferred.
     */
    @Test
    void refusesAFileSizeLimitAboveWhatGraphAccepts() {
        AttachmentProperties properties = sharePointProperties();
        properties.setMaxFileSizeBytes(SharePointAttachmentStore.MAX_SIMPLE_UPLOAD_BYTES + 1);

        assertThatThrownBy(() -> configuration.attachmentStore(properties, NO_HTTP))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("max-file-size-bytes")
                .hasMessageContaining("upload session");
    }

    @Test
    void acceptsAFileSizeLimitExactlyAtTheGraphCeiling() {
        AttachmentProperties properties = sharePointProperties();
        properties.setMaxFileSizeBytes(SharePointAttachmentStore.MAX_SIMPLE_UPLOAD_BYTES);

        assertThat(configuration.attachmentStore(properties, NO_HTTP))
                .isInstanceOf(SharePointAttachmentStore.class);
    }

    /** The size ceiling is SharePoint's, so it must not constrain the filesystem provider. */
    @Test
    void doesNotApplyTheGraphCeilingToTheFilesystemProvider() {
        AttachmentProperties properties = new AttachmentProperties();
        properties.setProvider(AttachmentProperties.Provider.FILESYSTEM);
        properties.getFilesystem().setBasePath(Path.of("/var/lib/togetherflow/attachments"));
        properties.setMaxFileSizeBytes(SharePointAttachmentStore.MAX_SIMPLE_UPLOAD_BYTES * 4);

        assertThat(configuration.attachmentStore(properties, NO_HTTP))
                .isInstanceOf(FilesystemAttachmentStore.class);
    }

    @Test
    void refusesToStartForTheDbProviderRatherThanRunningPointlessly() {
        AttachmentProperties properties = new AttachmentProperties();
        properties.setProvider(AttachmentProperties.Provider.DB);

        assertThatThrownBy(() -> configuration.attachmentStore(properties, NO_HTTP))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("needs no gateway");
    }
}
