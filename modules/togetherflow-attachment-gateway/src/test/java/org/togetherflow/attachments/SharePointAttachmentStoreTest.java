package org.togetherflow.attachments;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/**
 * Path construction for the SharePoint provider.
 *
 * <p>This is what can honestly be tested without an Azure tenant: the upload path is
 * pure string handling, and getting it wrong is how a file ends up outside the folder
 * an operator configured. The Graph calls themselves are unverified against the real
 * service — see the note on {@link SharePointAttachmentStore}.
 */
class SharePointAttachmentStoreTest {

    private SharePointAttachmentStore storeWith(String folder) {
        AttachmentProperties.SharePoint config = new AttachmentProperties.SharePoint();
        config.setFolderPath(folder);
        config.setDriveId("drive-1");
        return new SharePointAttachmentStore(config, null);
    }

    @Test
    void groupsFilesByTaskUnderTheConfiguredFolder() {
        assertThat(storeWith("TogetherFlow").uploadPath("task-1", "invoice.pdf"))
                .isEqualTo("/TogetherFlow/task-1/invoice.pdf");
    }

    @Test
    void toleratesSlashesAroundTheConfiguredFolder() {
        assertThat(storeWith("/Shared/Docs/").uploadPath("t", "a.pdf"))
                .isEqualTo("/Shared/Docs/t/a.pdf");
    }

    @Test
    void writesToTheDriveRootWhenNoFolderIsConfigured() {
        assertThat(storeWith("").uploadPath("t", "a.pdf")).isEqualTo("/t/a.pdf");
    }

    /** A name with separators must not be able to write outside the folder. */
    @Test
    void neutralisesSeparatorsAndTraversalInTheFileName() {
        assertThat(storeWith("Docs").uploadPath("t", "../../secret.txt"))
                .isEqualTo("/Docs/t/secret.txt");
        assertThat(storeWith("Docs").uploadPath("t", "/etc/passwd")).isEqualTo("/Docs/t/etc-passwd");
    }

    @Test
    void neutralisesCharactersSharePointRejects() {
        assertThat(storeWith("Docs").uploadPath("t", "a:b*c?d\"e<f>g|h.pdf"))
                .isEqualTo("/Docs/t/a-b-c-d-e-f-g-h.pdf");
    }

    @Test
    void fallsBackWhenAFileNameIsBlank() {
        assertThat(storeWith("Docs").uploadPath("t", "   ")).isEqualTo("/Docs/t/file");
        assertThat(storeWith("Docs").uploadPath("t", null)).isEqualTo("/Docs/t/file");
    }

    @Test
    void sanitisesTheTaskIdToo() {
        assertThat(storeWith("Docs").uploadPath("../evil", "a.pdf")).isEqualTo("/Docs/evil/a.pdf");
    }

    /**
     * Graph's {@code root:<path>:} addressing needs the separators literal. Encoding the
     * whole path as one URI variable turns them into {@code %2F}, which is a different
     * address — the reason {@code uploadUri} builds the URI itself.
     */
    @Test
    void keepsPathSeparatorsLiteralInTheGraphUri() {
        assertThat(storeWith("Docs").uploadUri("/Docs/task-1/invoice.pdf"))
                .hasToString("https://graph.microsoft.com/v1.0"
                        + "/drives/drive-1/root:/Docs/task-1/invoice.pdf:/content");
    }

    /** A space in a file name is legal in SharePoint and illegal in a URI. */
    @Test
    void percentEncodesWithinASegment() {
        assertThat(storeWith("Docs").uploadUri("/Docs/t/quarterly report.pdf"))
                .hasToString("https://graph.microsoft.com/v1.0"
                        + "/drives/drive-1/root:/Docs/t/quarterly%20report.pdf:/content");
        // Not "+", which in a path is a literal plus rather than a space.
        assertThat(storeWith("Docs").uploadUri("/Docs/t/a b.pdf").toString()).doesNotContain("+");
    }

    @Test
    void encodesNonAsciiFileNames() {
        assertThat(storeWith("Docs").uploadUri("/Docs/t/facturé.pdf"))
                .hasToString("https://graph.microsoft.com/v1.0"
                        + "/drives/drive-1/root:/Docs/t/factur%C3%A9.pdf:/content");
    }
}
