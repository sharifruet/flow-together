package org.togetherflow.attachments;

import java.io.IOException;
import java.io.InputStream;

/**
 * A place to put a file.
 *
 * <p>Deliberately narrow: store, and (where the gateway itself serves downloads) read
 * back. Deleting is not exposed — Flowable owns the attachment row's lifecycle, and a
 * gateway that could delete arbitrary stored files would be a much larger blast radius
 * than this module needs.
 */
public interface AttachmentStore {

    /** Which provider this is, for logging and the health endpoint. */
    AttachmentProperties.Provider provider();

    StoredAttachment store(String taskId, String fileName, String contentType, InputStream content, long sizeBytes)
            throws IOException;

    /**
     * Reads a stored file back, for providers whose URLs point at this gateway.
     *
     * <p>SharePoint returns a URL the viewer opens directly against Microsoft 365, so it
     * never implements this — hence the default of "not supported" rather than forcing
     * every provider to pretend.
     */
    default InputStream read(String id) throws IOException {
        throw new UnsupportedOperationException("This provider serves files directly, not through the gateway.");
    }
}
