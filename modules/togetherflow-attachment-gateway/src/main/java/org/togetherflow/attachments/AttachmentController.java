package org.togetherflow.attachments;

import java.io.IOException;
import java.io.InputStream;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

/**
 * The gateway's own API (REQUIREMENTS.md §7.6).
 *
 * <p>Two endpoints and no more: take a file and give back a URL, and — for providers
 * whose URLs point here — serve that file back. Registering the attachment against the
 * task stays with the UI, which already talks to Flowable and holds the user's
 * credentials; doing it here would mean the gateway impersonating users.
 */
@RestController
public class AttachmentController {

    private static final Logger LOGGER = LoggerFactory.getLogger(AttachmentController.class);

    private final AttachmentStore store;
    private final AttachmentProperties properties;

    public AttachmentController(AttachmentStore store, AttachmentProperties properties) {
        this.store = store;
        this.properties = properties;
    }

    @PostMapping(value = "/attachments", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public StoredAttachment upload(@RequestParam("taskId") String taskId,
            @RequestParam("file") MultipartFile file) {

        if (file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The uploaded file is empty.");
        }
        if (file.getSize() > properties.getMaxFileSizeBytes()) {
            // Checked before a single byte is written, so an oversized upload cannot
            // fill the disk on its way to being rejected.
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE,
                    "That file is larger than this deployment allows.");
        }

        try (InputStream content = file.getInputStream()) {
            StoredAttachment stored = store.store(taskId, file.getOriginalFilename(),
                    file.getContentType(), content, file.getSize());
            LOGGER.info("Stored attachment for task {} via {} ({} bytes)", taskId, store.provider(),
                    stored.sizeBytes());
            return stored;
        } catch (IOException | RuntimeException cause) {
            // The provider's own message may name internal paths or hosts, so it is
            // logged rather than returned.
            LOGGER.error("Storing an attachment for task {} failed", taskId, cause);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "Attachment storage is unavailable. Try again, or attach a link instead.");
        }
    }

    @GetMapping("/attachments/{id}")
    public ResponseEntity<InputStreamResource> download(@PathVariable String id) {
        try {
            InputStream content = store.read(id);
            return ResponseEntity.ok()
                    // Always as an attachment: serving user-supplied bytes inline invites
                    // stored XSS on this origin.
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment")
                    .header("X-Content-Type-Options", "nosniff")
                    .contentType(MediaType.APPLICATION_OCTET_STREAM)
                    .body(new InputStreamResource(content));
        } catch (IllegalArgumentException invalid) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Not a valid attachment id.");
        } catch (UnsupportedOperationException unsupported) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                    "This provider serves files directly, not through the gateway.");
        } catch (IOException missing) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No such attachment.");
        }
    }

    /** Lets the Work app degrade gracefully when the gateway is down (§13.4). */
    @GetMapping("/attachments/health")
    public Map<String, String> health() {
        return Map.of("provider", store.provider().name().toLowerCase());
    }
}
