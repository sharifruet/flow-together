package org.togetherflow.attachments;

/**
 * One file in the document library, whether that library is the local test site or the
 * metadata we keep for a file that was just stored.
 */
public record SharePointDocument(
        String id,
        String taskId,
        String processInstanceId,
        String taskName,
        String processName,
        String fileName,
        String contentType,
        long sizeBytes,
        String storedAt,
        String webUrl,
        String location) {
}
