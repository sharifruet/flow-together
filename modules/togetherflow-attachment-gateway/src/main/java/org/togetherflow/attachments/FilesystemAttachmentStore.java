package org.togetherflow.attachments;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.UUID;

/**
 * Stores files in a directory tree, and serves them back through this gateway.
 *
 * <p><b>Path traversal is the risk that matters here</b>, and it is closed by never
 * using the client's file name as a path component: the stored name is a generated
 * identifier, and the original name travels only in the returned metadata. A file called
 * {@code ../../etc/passwd} therefore lands as a UUID inside the base directory like any
 * other, rather than anywhere the attacker chose.
 */
public class FilesystemAttachmentStore implements AttachmentStore {

    private final Path basePath;
    private final String publicBaseUrl;

    public FilesystemAttachmentStore(Path basePath, String publicBaseUrl) {
        this.basePath = basePath.toAbsolutePath().normalize();
        this.publicBaseUrl = publicBaseUrl == null ? "" : publicBaseUrl.replaceAll("/+$", "");
    }

    @Override
    public AttachmentProperties.Provider provider() {
        return AttachmentProperties.Provider.FILESYSTEM;
    }

    @Override
    public StoredAttachment store(String taskId, String fileName, String contentType, InputStream content,
            long sizeBytes) throws IOException {

        String id = UUID.randomUUID().toString().replace("-", "");
        Path target = resolve(id);
        Files.createDirectories(target.getParent());
        Files.copy(content, target, StandardCopyOption.REPLACE_EXISTING);

        return new StoredAttachment(publicBaseUrl + "/attachments/" + id, fileName, contentType,
                Files.size(target));
    }

    @Override
    public InputStream read(String id) throws IOException {
        return Files.newInputStream(resolve(id));
    }

    /**
     * Maps an id to its path, refusing anything that escapes the base directory.
     *
     * <p>Ids are generated here, so a value that fails this check came from outside and
     * is an attack, not a bug.
     */
    Path resolve(String id) {
        if (id == null || !id.matches("[0-9a-f]{32}")) {
            throw new IllegalArgumentException("Not a valid attachment id.");
        }
        // Two levels of fan-out keeps directory sizes sane on large installs.
        Path target = basePath.resolve(id.substring(0, 2)).resolve(id.substring(2, 4)).resolve(id)
                .normalize();
        if (!target.startsWith(basePath)) {
            throw new IllegalArgumentException("Attachment path escapes the base directory.");
        }
        return target;
    }
}
