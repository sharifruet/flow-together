package org.togetherflow.attachments;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class FilesystemAttachmentStoreTest {

    @TempDir
    Path base;

    private FilesystemAttachmentStore store;

    @BeforeEach
    void setUp() {
        store = new FilesystemAttachmentStore(base, "https://files.example.com/");
    }

    private StoredAttachment store(String fileName, String content) throws IOException {
        byte[] bytes = content.getBytes(StandardCharsets.UTF_8);
        return store.store("task-1", fileName, "text/plain", new ByteArrayInputStream(bytes), bytes.length);
    }

    @Test
    void storesTheBytesAndReturnsAResolvableUrl() throws IOException {
        StoredAttachment stored = store("invoice.pdf", "hello");

        assertThat(stored.fileName()).isEqualTo("invoice.pdf");
        assertThat(stored.sizeBytes()).isEqualTo(5);
        // The trailing slash on the configured base must not double up.
        assertThat(stored.url()).startsWith("https://files.example.com/attachments/");

        String id = stored.url().substring(stored.url().lastIndexOf('/') + 1);
        assertThat(new String(store.read(id).readAllBytes(), StandardCharsets.UTF_8)).isEqualTo("hello");
    }

    @Test
    void everyUploadGetsItsOwnId() throws IOException {
        assertThat(store("a.txt", "one").url()).isNotEqualTo(store("a.txt", "two").url());
    }

    /**
     * The client's file name is never used as a path component, so a traversal attempt
     * lands inside the base directory like anything else.
     */
    @Test
    void aTraversingFileNameCannotEscapeTheBaseDirectory() throws IOException {
        StoredAttachment stored = store("../../../etc/passwd", "nope");

        String id = stored.url().substring(stored.url().lastIndexOf('/') + 1);
        assertThat(store.resolve(id)).startsWith(base);
        // The original name survives as metadata only.
        assertThat(stored.fileName()).isEqualTo("../../../etc/passwd");
        assertThat(Files.walk(base).anyMatch(p -> p.getFileName().toString().equals("passwd"))).isFalse();
    }

    @Test
    void rejectsAnIdThatIsNotOneItIssued() {
        assertThatThrownBy(() -> store.resolve("../../etc/passwd"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> store.resolve("")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> store.resolve(null)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> store.resolve("NOTHEX00000000000000000000000000"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void fansOutIntoSubdirectoriesSoOneDirectoryDoesNotGrowUnbounded() throws IOException {
        StoredAttachment stored = store("a.txt", "x");
        String id = stored.url().substring(stored.url().lastIndexOf('/') + 1);

        assertThat(store.resolve(id)).isEqualTo(base.resolve(id.substring(0, 2))
                .resolve(id.substring(2, 4)).resolve(id));
    }

    @Test
    void reportsItsProvider() {
        assertThat(store.provider()).isEqualTo(AttachmentProperties.Provider.FILESYSTEM);
    }
}
