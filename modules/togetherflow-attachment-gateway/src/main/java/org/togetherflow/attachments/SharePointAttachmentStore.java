package org.togetherflow.attachments;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;

import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.HttpClientErrorException;
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
 * That is Open Question 11's <b>ratified</b> answer, and it means SharePoint sees the
 * gateway, not the end user. Every file therefore carries the service identity as its
 * author, and SharePoint's own audit log attributes every upload to it — if your audit
 * requirement is "SharePoint must record which person uploaded this", app-only does not
 * meet it and delegated auth is the alternative. TogetherFlow's own audit trail is
 * unaffected: the attachment is recorded against the task by the engine, with the real
 * user on it.
 *
 * <p>Uploads use Graph's simple upload, which is documented as supporting files up to
 * 250 MB — {@link #MAX_SIMPLE_UPLOAD_BYTES}. A larger {@code maxFileSizeBytes} is
 * rejected at startup rather than failing mid-upload; larger files need an upload
 * session, which this does not implement.
 */
public class SharePointAttachmentStore implements AttachmentStore {

    /**
     * Graph's documented ceiling for a simple (single-request) upload. Configuration above
     * this is refused at startup — see {@code AttachmentGatewayConfiguration}.
     */
    public static final long MAX_SIMPLE_UPLOAD_BYTES = 250L * 1024 * 1024;

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

        Map<String, Object> item;
        try {
            item = upload(path, contentType, bytes, accessToken());
        } catch (HttpClientErrorException.Unauthorized rejected) {
            /*
             * The cached token was refused. Tokens can be revoked, and a clock the other
             * side disagrees with can make one look valid here and expired there — without
             * this, either turns every upload into a permanent failure until the pod is
             * restarted. The bytes are already in memory, so the retry costs one request.
             * A second 401 is a real configuration problem and is allowed to propagate.
             */
            invalidateToken();
            item = upload(path, contentType, bytes, accessToken());
        }

        if (item == null || item.get("webUrl") == null) {
            throw new IOException("SharePoint accepted the upload but returned no webUrl.");
        }
        return new StoredAttachment(String.valueOf(item.get("webUrl")), fileName, contentType, bytes.length);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> upload(String path, String contentType, byte[] bytes, String bearer) {
        return http.put()
                .uri(uploadUri(path))
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + bearer)
                .contentType(contentType == null ? MediaType.APPLICATION_OCTET_STREAM
                        : MediaType.parseMediaType(contentType))
                .body(new ByteArrayResource(bytes))
                .retrieve()
                .body(Map.class);
    }

    /**
     * Builds the Graph upload URI.
     *
     * <p>Assembled as a {@link URI} rather than left to {@code RestClient}'s URI-variable
     * expansion, which encodes a variable as a single path <i>segment</i> and so turns the
     * separators in {@code /Docs/task-1/invoice.pdf} into {@code %2F}. Graph's
     * {@code root:<path>:} addressing needs those separators literal — every Microsoft
     * example writes them that way — so the segments are encoded individually here and
     * joined with real slashes.
     */
    URI uploadUri(String path) {
        StringBuilder encoded = new StringBuilder();
        for (String segment : path.split("/")) {
            if (segment.isEmpty()) {
                continue;
            }
            encoded.append('/').append(encodeSegment(segment));
        }
        return URI.create(config.getGraphBaseUrl()
                + "/drives/" + encodeSegment(config.getDriveId())
                + "/root:" + encoded + ":/content");
    }

    /**
     * Percent-encodes one path segment.
     *
     * <p>{@code URLEncoder} targets form encoding, where a space is {@code +}; in a path a
     * {@code +} is a literal plus, so it is corrected here. The separators themselves never
     * reach this method — {@link #safeSegment} has already removed them.
     */
    private static String encodeSegment(String segment) {
        return URLEncoder.encode(segment, StandardCharsets.UTF_8).replace("+", "%20");
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

    /** Forces the next call to fetch a fresh token. */
    private void invalidateToken() {
        token = null;
        tokenExpiry = Instant.EPOCH;
    }
}
