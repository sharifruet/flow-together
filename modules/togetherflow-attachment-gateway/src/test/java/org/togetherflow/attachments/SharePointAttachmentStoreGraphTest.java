package org.togetherflow.attachments;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/**
 * Contract-level coverage of the SharePoint provider against a stubbed Microsoft Graph.
 *
 * <p><b>What this does and does not prove.</b> It pins the request shapes — token grant,
 * upload URL, headers, body — and the behaviour around them: token caching, the retry on a
 * rejected token, and what happens when Graph answers oddly. It does <i>not</i> prove that
 * real Graph accepts these requests, because nothing here has ever talked to it (see the
 * note on {@link SharePointAttachmentStore}). What it does buy is that a refactor cannot
 * silently change the wire format of the one integration nobody can run.
 *
 * <p>The stub is Spring's own {@code MockRestServiceServer} rather than a hand-rolled
 * server, so an unexpected or missing request fails the test rather than passing quietly.
 */
class SharePointAttachmentStoreGraphTest {

    private static final String TOKEN_URL =
            "https://login.example.test/tenant-1/oauth2/v2.0/token";
    private static final String UPLOAD_URL =
            "https://graph.example.test/v1.0/drives/drive-1/root:/Docs/task-1/invoice.pdf:/content";

    private AttachmentProperties.SharePoint config;
    private RestClient.Builder builder;
    private MockRestServiceServer graph;
    private SharePointAttachmentStore store;

    @BeforeEach
    void setUp() {
        config = new AttachmentProperties.SharePoint();
        config.setTenantId("tenant-1");
        config.setClientId("client-1");
        config.setClientSecret("s3cret");
        config.setDriveId("drive-1");
        config.setFolderPath("Docs");
        config.setGraphBaseUrl("https://graph.example.test/v1.0");
        config.setLoginBaseUrl("https://login.example.test");

        builder = RestClient.builder();
        graph = MockRestServiceServer.bindTo(builder).build();
        store = new SharePointAttachmentStore(config, builder.build());
    }

    private StoredAttachment upload() throws IOException {
        byte[] bytes = "invoice bytes".getBytes(StandardCharsets.UTF_8);
        return store.store("task-1", "invoice.pdf", "application/pdf",
                new ByteArrayInputStream(bytes), bytes.length);
    }

    private void expectTokenRequest(String accessToken, long expiresIn) {
        graph.expect(once(), requestTo(TOKEN_URL))
                .andExpect(method(HttpMethod.POST))
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_FORM_URLENCODED))
                // App-only: the client-credentials grant with the whole-app .default scope.
                // A change here is a change to the auth model, not a refactor.
                .andExpect(content().formData(formData("client_credentials", ".default")))
                .andRespond(withSuccess("""
                        {"access_token":"%s","expires_in":%d,"token_type":"Bearer"}
                        """.formatted(accessToken, expiresIn), MediaType.APPLICATION_JSON));
    }

    private org.springframework.util.MultiValueMap<String, String> formData(String grantType, String scopeSuffix) {
        org.springframework.util.MultiValueMap<String, String> expected =
                new org.springframework.util.LinkedMultiValueMap<>();
        expected.add("client_id", "client-1");
        expected.add("client_secret", "s3cret");
        expected.add("scope", "https://graph.microsoft.com/" + scopeSuffix);
        expected.add("grant_type", grantType);
        return expected;
    }

    private void expectUpload(String bearer, String webUrl) {
        graph.expect(once(), requestTo(UPLOAD_URL))
                .andExpect(method(HttpMethod.PUT))
                .andExpect(header("Authorization", "Bearer " + bearer))
                .andExpect(content().contentType(MediaType.APPLICATION_PDF))
                .andExpect(content().string("invoice bytes"))
                .andRespond(withSuccess("{\"webUrl\":\"%s\"}".formatted(webUrl), MediaType.APPLICATION_JSON));
    }

    @Test
    void fetchesATokenThenPutsTheFileAndReturnsItsWebUrl() throws Exception {
        expectTokenRequest("token-a", 3600);
        expectUpload("token-a", "https://contoso.sharepoint.com/Docs/task-1/invoice.pdf");

        StoredAttachment stored = upload();

        assertThat(stored.url()).isEqualTo("https://contoso.sharepoint.com/Docs/task-1/invoice.pdf");
        assertThat(stored.fileName()).isEqualTo("invoice.pdf");
        assertThat(stored.contentType()).isEqualTo("application/pdf");
        assertThat(stored.sizeBytes()).isEqualTo("invoice bytes".length());
        graph.verify();
    }

    /** Graph tokens last an hour; a token request per upload would be pure waste. */
    @Test
    void reusesTheTokenAcrossUploads() throws Exception {
        expectTokenRequest("token-a", 3600);
        expectUpload("token-a", "https://contoso.sharepoint.com/one");
        expectUpload("token-a", "https://contoso.sharepoint.com/two");

        upload();
        upload();

        // `once()` on the token expectation is the assertion: a second grant would fail.
        graph.verify();
    }

    /**
     * A token can be revoked, or a clock the other side disagrees with can make one look
     * valid here and expired there. Without the retry, either turns every subsequent
     * upload into a permanent failure until the pod restarts.
     */
    @Test
    void retriesOnceWithAFreshTokenWhenGraphRejectsTheCachedOne() throws Exception {
        expectTokenRequest("stale", 3600);
        graph.expect(once(), requestTo(UPLOAD_URL))
                .andExpect(header("Authorization", "Bearer stale"))
                .andRespond(withStatus(HttpStatus.UNAUTHORIZED));
        expectTokenRequest("fresh", 3600);
        expectUpload("fresh", "https://contoso.sharepoint.com/retried");

        assertThat(upload().url()).isEqualTo("https://contoso.sharepoint.com/retried");
        graph.verify();
    }

    /** A second 401 is a configuration problem, not a stale token — it must surface. */
    @Test
    void doesNotRetryForever() {
        expectTokenRequest("stale", 3600);
        graph.expect(once(), requestTo(UPLOAD_URL)).andRespond(withStatus(HttpStatus.UNAUTHORIZED));
        expectTokenRequest("fresh", 3600);
        graph.expect(once(), requestTo(UPLOAD_URL)).andRespond(withStatus(HttpStatus.UNAUTHORIZED));

        assertThatThrownBy(this::upload)
                .isInstanceOf(org.springframework.web.client.HttpClientErrorException.Unauthorized.class);
        graph.verify();
    }

    /** A near-instant expiry must not be cached, or every upload after it fails. */
    @Test
    void refetchesTheTokenOnceItHasExpired() throws Exception {
        // 30s minus the one-minute safety margin is already in the past, so the second
        // upload has to ask again.
        expectTokenRequest("token-a", 30);
        expectUpload("token-a", "https://contoso.sharepoint.com/one");
        expectTokenRequest("token-b", 3600);
        expectUpload("token-b", "https://contoso.sharepoint.com/two");

        upload();
        upload();

        graph.verify();
    }

    @Test
    void failsClearlyWhenAzureReturnsNoToken() {
        graph.expect(once(), requestTo(TOKEN_URL))
                .andRespond(withSuccess("{\"error\":\"invalid_client\"}", MediaType.APPLICATION_JSON));

        assertThatThrownBy(this::upload)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("no access token");
    }

    /**
     * Graph answering 200 with no webUrl would otherwise be recorded as an attachment
     * whose URL is the literal string "null".
     */
    @Test
    void failsWhenGraphAcceptsTheUploadButReturnsNoWebUrl() {
        expectTokenRequest("token-a", 3600);
        graph.expect(once(), requestTo(UPLOAD_URL))
                .andRespond(withSuccess("{\"id\":\"item-1\"}", MediaType.APPLICATION_JSON));

        assertThatThrownBy(this::upload)
                .isInstanceOf(IOException.class)
                .hasMessageContaining("no webUrl");
    }

    /** Unknown content type must still upload, as bytes. */
    @Test
    void fallsBackToOctetStreamWhenTheContentTypeIsUnknown() throws Exception {
        expectTokenRequest("token-a", 3600);
        graph.expect(once(), requestTo(UPLOAD_URL))
                .andExpect(content().contentType(MediaType.APPLICATION_OCTET_STREAM))
                .andRespond(withSuccess("{\"webUrl\":\"https://contoso.sharepoint.com/x\"}",
                        MediaType.APPLICATION_JSON));

        byte[] bytes = "invoice bytes".getBytes(StandardCharsets.UTF_8);
        StoredAttachment stored = store.store("task-1", "invoice.pdf", null,
                new ByteArrayInputStream(bytes), bytes.length);

        assertThat(stored.url()).isEqualTo("https://contoso.sharepoint.com/x");
        graph.verify();
    }

    /** The sanitised path is what reaches the wire, not just what {@code uploadPath} returns. */
    @Test
    void sendsTheSanitisedPathToGraph() throws Exception {
        expectTokenRequest("token-a", 3600);
        graph.expect(once(), requestTo(
                        "https://graph.example.test/v1.0/drives/drive-1/root:/Docs/task-1/secret.txt:/content"))
                .andRespond(withSuccess("{\"webUrl\":\"https://contoso.sharepoint.com/s\"}",
                        MediaType.APPLICATION_JSON));

        byte[] bytes = "x".getBytes(StandardCharsets.UTF_8);
        store.store("task-1", "../../secret.txt", "text/plain", new ByteArrayInputStream(bytes), bytes.length);

        graph.verify();
    }
}
