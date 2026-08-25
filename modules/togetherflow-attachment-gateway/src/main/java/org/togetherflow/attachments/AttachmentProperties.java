package org.togetherflow.attachments;

import java.nio.file.Path;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Attachment storage configuration (REQUIREMENTS.md §7.6).
 *
 * <p>One switch selects the provider, with provider-specific settings nested under it.
 * Changing provider is a property change, not a rebuild — that is what "configurable
 * easily" was asked to mean. Existing attachments keep resolving through whichever path
 * created them, because Flowable stores either a {@code url} or a {@code contentId} per
 * row and the two coexist.
 */
@ConfigurationProperties(prefix = "togetherflow.attachments")
public class AttachmentProperties {

    public enum Provider {
        /**
         * The engine's own byte-array storage. The default, and the reason this whole
         * module is optional: with {@code db} the Work app posts straight to Flowable
         * and the gateway is not deployed at all.
         */
        DB,
        FILESYSTEM,
        SHAREPOINT
    }

    private Provider provider = Provider.DB;

    private final Filesystem filesystem = new Filesystem();
    private final SharePoint sharepoint = new SharePoint();

    /** Rejected above this size before any bytes are written. */
    private long maxFileSizeBytes = 25L * 1024 * 1024;

    public Provider getProvider() {
        return provider;
    }

    public void setProvider(Provider provider) {
        this.provider = provider;
    }

    public Filesystem getFilesystem() {
        return filesystem;
    }

    public SharePoint getSharepoint() {
        return sharepoint;
    }

    public long getMaxFileSizeBytes() {
        return maxFileSizeBytes;
    }

    public void setMaxFileSizeBytes(long maxFileSizeBytes) {
        this.maxFileSizeBytes = maxFileSizeBytes;
    }

    public static class Filesystem {

        /** Root directory files are written under. Required for the filesystem provider. */
        private Path basePath;

        /**
         * Public base URL of this gateway, used to build the download URL handed back to
         * Flowable. Without it the stored URL would only work from the gateway's own host.
         */
        private String publicBaseUrl = "";

        public Path getBasePath() {
            return basePath;
        }

        public void setBasePath(Path basePath) {
            this.basePath = basePath;
        }

        public String getPublicBaseUrl() {
            return publicBaseUrl;
        }

        public void setPublicBaseUrl(String publicBaseUrl) {
            this.publicBaseUrl = publicBaseUrl;
        }
    }

    public static class SharePoint {

        /** Azure AD tenant id. */
        private String tenantId = "";

        /** App registration (client) id. */
        private String clientId = "";

        /**
         * Client secret for the client-credentials grant.
         *
         * <p>App-only auth is assumed (Open Question 11): one service identity performs
         * every upload, rather than each user's own Microsoft 365 login. Delegated auth
         * would require the shell to broker a second identity provider.
         */
        private String clientSecret = "";

        /** Graph site id the files are written to. */
        private String siteId = "";

        /** Drive (document library) id within that site. */
        private String driveId = "";

        /** Folder path within the drive; empty means the drive root. */
        private String folderPath = "";

        /** Graph endpoint, overridable for sovereign clouds. */
        private String graphBaseUrl = "https://graph.microsoft.com/v1.0";

        private String loginBaseUrl = "https://login.microsoftonline.com";

        public String getTenantId() {
            return tenantId;
        }

        public void setTenantId(String tenantId) {
            this.tenantId = tenantId;
        }

        public String getClientId() {
            return clientId;
        }

        public void setClientId(String clientId) {
            this.clientId = clientId;
        }

        public String getClientSecret() {
            return clientSecret;
        }

        public void setClientSecret(String clientSecret) {
            this.clientSecret = clientSecret;
        }

        public String getSiteId() {
            return siteId;
        }

        public void setSiteId(String siteId) {
            this.siteId = siteId;
        }

        public String getDriveId() {
            return driveId;
        }

        public void setDriveId(String driveId) {
            this.driveId = driveId;
        }

        public String getFolderPath() {
            return folderPath;
        }

        public void setFolderPath(String folderPath) {
            this.folderPath = folderPath;
        }

        public String getGraphBaseUrl() {
            return graphBaseUrl;
        }

        public void setGraphBaseUrl(String graphBaseUrl) {
            this.graphBaseUrl = graphBaseUrl;
        }

        public String getLoginBaseUrl() {
            return loginBaseUrl;
        }

        public void setLoginBaseUrl(String loginBaseUrl) {
            this.loginBaseUrl = loginBaseUrl;
        }
    }
}
