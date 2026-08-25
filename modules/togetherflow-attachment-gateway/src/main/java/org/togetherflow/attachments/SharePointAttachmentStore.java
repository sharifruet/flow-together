package org.togetherflow.attachments;

import java.io.IOException;
import java.io.InputStream;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;

import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

/**
 * Stores files in a SharePoint document library through Microsoft Graph.
 *
 * <p><b>Verification status, stated plainly:</b> unlike every other integration in this
 * repository, this one has <i>not</i> been exercised against the real service — doing so
 * needs an Azure AD tenant, an app registration and a SharePoint site, none of which
 * exist in this environment. The request shapes follow Microsoft's documented Graph API
 * and the code is unit-tested against a stub server, but treat the first run against a
 * real tenant as the actual acceptance test.
 *
 * <p>Auth is app-only (client credentials): one service identity performs every upload.
 * That is Open Question 11's simpler branch, and it means SharePoint sees the gateway,
 * not the end user — check that against your audit requirements before enabling it.
 *
 * <p>Uploads use Graph's simple upload, which is documented as supporting files up to
 * 250 MB. {@code maxFileSizeBytes} should stay at or below that; larger files need an
 * upload session, which this does not implement.
 */
public class SharePointAttachmentStore implements AttachmentStore {

    private final AttachmentProperties.SharePoint config;
    private final RestClient http;

    /** Cached bearer token; Graph tokens last an hour, so re-fetching per upload is waste. */
    private volatile String token;
    private volatile Instant tokenExpiry = Instant.EPOCH;

    public SharePointAttachmentStore(AttachmentProperties.SharePoint config, RestClient http) {
        this.config = config;
        this.http = http;
    }

    @Override
    public AttachmentProperties.Provider provider() {
        return AttachmentProperties.Provider.SHAREPOINT;
    }

    @Override
    public StoredAttachment store(String taskId, String fileName, String contentType, InputStream content,
            long sizeBytes) throws IOException {

        byte[] bytes = content.readAllBytes();
        String path = uploadPath(taskId, fileName);

        @SuppressWarnings("unchecked")
        Map<String, Object> item = http.put()
                .uri(config.getGraphBaseUrl() + "/drives/{driveId}/root:{path}:/content",
                        config.getDriveId(), path)
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + accessToken())
                .contentType(contentType == null ? MediaType.APPLICATION_OCTET_STREAM
                        : MediaType.parseMediaType(contentType))
                .body(new ByteArrayResource(bytes))
                .retrieve()
                .body(Map.class);

        if (item == null || item.get("webUrl") == null) {
            throw new IOException("SharePoint accepted the upload but returned no webUrl.");
        }
        return new StoredAttachment(String.valueOf(item.get("webUrl")), fileName, contentType, bytes.length);
    }

    /**
     * Where the file lands inside the drive.
     *
     * <p>Grouped by task so a document library stays navigable, and every segment is
     * sanitised: a name containing {@code /} or {@code ..} must not be able to write
     * outside the configured folder.
     */
    String uploadPath(String taskId, String fileName) {
        String folder = config.getFolderPath() == null ? "" : config.getFolderPath().replaceAll("^/+|/+$", "");
        StringBuilder path = new StringBuilder("/");
        if (!folder.isEmpty()) {
            path.append(folder).append('/');
        }
        return path.append(safeSegment(taskId)).append('/').append(safeSegment(fileName)).toString();
    }

    /**
     * Makes one path segment safe.
     *
     * <p>Replaces separators, traversal and the characters SharePoint itself rejects,
     * then collapses the runs of dashes that produces — {@code ../../secret.txt} should
     * arrive as {@code secret.txt}, not {@code ----secret.txt}.
     */
    private static String safeSegment(String value) {
        String cleaned = value == null ? "" : value;
        cleaned = cleaned.replaceAll("[\\\\/:*?\"<>|]+", "-");
        cleaned = cleaned.replaceAll("\\.{2,}", "-");
        cleaned = cleaned.replaceAll("-{2,}", "-");
        cleaned = cleaned.replaceAll("^[-.\\s]+|[-\\s]+$", "");
        return cleaned.isEmpty() ? "file" : cleaned;
    }

    /** Client-credentials token, refreshed a minute before it actually expires. */
    private String accessToken() {
        if (token != null && Instant.now().isBefore(tokenExpiry)) {
            return token;
        }
        MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
        form.add("client_id", config.getClientId());
        form.add("client_secret", config.getClientSecret());
        form.add("scope", "https://graph.microsoft.com/.default");
        form.add("grant_type", "client_credentials");

        @SuppressWarnings("unchecked")
        Map<String, Object> response = http.post()
                .uri(config.getLoginBaseUrl() + "/{tenantId}/oauth2/v2.0/token", config.getTenantId())
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .body(form)
                .retrieve()
                .body(Map.class);

        if (response == null || response.get("access_token") == null) {
            throw new IllegalStateException("Azure AD returned no access token.");
        }
        token = String.valueOf(response.get("access_token"));
        long expiresIn = response.get("expires_in") instanceof Number n ? n.longValue() : 3600L;
        tokenExpiry = Instant.now().plusSeconds(expiresIn).minus(Duration.ofMinutes(1));
        return token;
    }
}
