package org.togetherflow.attachments;

/**
 * What a provider returns after storing a file.
 *
 * <p>The URL is the whole point: the UI hands it to Flowable as an attachment's
 * {@code externalUrl}, so no bytes ever pass through the engine for a non-{@code db}
 * provider.
 */
public record StoredAttachment(String url, String fileName, String contentType, long sizeBytes) {
}
