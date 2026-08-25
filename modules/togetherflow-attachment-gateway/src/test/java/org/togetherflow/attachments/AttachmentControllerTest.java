package org.togetherflow.attachments;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

@SpringBootTest
@AutoConfigureMockMvc
class AttachmentControllerTest {

    @TempDir
    static Path storage;

    @DynamicPropertySource
    static void configure(DynamicPropertyRegistry registry) {
        registry.add("togetherflow.attachments.provider", () -> "filesystem");
        registry.add("togetherflow.attachments.filesystem.base-path", storage::toString);
        registry.add("togetherflow.attachments.filesystem.public-base-url", () -> "http://gw.example");
        registry.add("togetherflow.attachments.max-file-size-bytes", () -> 64);
    }

    @Autowired
    private MockMvc mvc;

    private MockMultipartFile file(String name, String content) {
        return new MockMultipartFile("file", name, "text/plain", content.getBytes(StandardCharsets.UTF_8));
    }

    @Test
    void storesAFileAndReturnsTheUrlTheUiRegistersWithFlowable() throws Exception {
        MvcResult result = mvc.perform(multipart("/attachments").file(file("note.txt", "hello"))
                        .param("taskId", "task-1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fileName").value("note.txt"))
                .andExpect(jsonPath("$.sizeBytes").value(5))
                .andExpect(jsonPath("$.url").value(org.hamcrest.Matchers.startsWith(
                        "http://gw.example/attachments/")))
                .andReturn();

        String url = com.jayway.jsonpath.JsonPath.read(result.getResponse().getContentAsString(), "$.url");
        String id = url.substring(url.lastIndexOf('/') + 1);

        mvc.perform(get("/attachments/{id}", id))
                .andExpect(status().isOk())
                // Never inline: serving user-supplied bytes inline invites stored XSS.
                .andExpect(header().string("Content-Disposition", "attachment"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(content().string("hello"));
    }

    @Test
    void rejectsAnEmptyUpload() throws Exception {
        mvc.perform(multipart("/attachments").file(file("empty.txt", "")).param("taskId", "t"))
                .andExpect(status().isBadRequest());
    }

    /** Checked before any bytes are written, so an oversized upload cannot fill the disk. */
    @Test
    void rejectsAFileOverTheConfiguredLimit() throws Exception {
        mvc.perform(multipart("/attachments").file(file("big.txt", "x".repeat(100)))
                        .param("taskId", "t"))
                .andExpect(status().isPayloadTooLarge());
    }

    @Test
    void refusesAnIdItNeverIssued() throws Exception {
        mvc.perform(get("/attachments/{id}", "not-a-real-id")).andExpect(status().isBadRequest());
    }

    @Test
    void reportsAMissingFileAsNotFound() throws Exception {
        mvc.perform(get("/attachments/{id}", "0".repeat(32))).andExpect(status().isNotFound());
    }

    @Test
    void reportsWhichProviderIsActive() throws Exception {
        mvc.perform(get("/attachments/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.provider").value("filesystem"));
    }

    @Test
    void keepsTheOriginalNameAsMetadataOnly() throws Exception {
        MvcResult result = mvc.perform(multipart("/attachments")
                        .file(file("../../escape.txt", "x")).param("taskId", "t"))
                .andExpect(status().isOk())
                .andReturn();

        String url = com.jayway.jsonpath.JsonPath.read(result.getResponse().getContentAsString(), "$.url");
        assertThat(url).matches("http://gw\\.example/attachments/[0-9a-f]{32}");
    }
}
