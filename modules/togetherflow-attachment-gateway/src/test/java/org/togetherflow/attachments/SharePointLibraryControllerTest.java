package org.togetherflow.attachments;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.startsWith;

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

/**
 * An upload from a task shows up in the local SharePoint library, which is the check a
 * person does in the browser at {@code /sharepoint}.
 */
@SpringBootTest
@AutoConfigureMockMvc
class SharePointLibraryControllerTest {

    @TempDir
    static Path storage;

    @DynamicPropertySource
    static void configure(DynamicPropertyRegistry registry) {
        registry.add("togetherflow.attachments.provider", () -> "sharepoint");
        registry.add("togetherflow.attachments.sharepoint.mode", () -> "local");
        registry.add("togetherflow.attachments.sharepoint.library-path", storage::toString);
        registry.add("togetherflow.attachments.sharepoint.public-base-url", () -> "http://localhost:8091");
        registry.add("togetherflow.attachments.sharepoint.folder-path", () -> "TogetherFlow");
    }

    @Autowired
    private MockMvc mvc;

    @Test
    void anUploadIsListedInTheLibraryAndCanBeOpened() throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", "invoice.pdf", "application/pdf",
                "pdf-bytes".getBytes(StandardCharsets.UTF_8));

        String taskId = "9be873c7-bb31-11f1-9dc5-c8d9d2d2af8a";
        String processId = "9832709b-bb31-11f1-9dc5-c8d9d2d2af8a";
        MvcResult stored = mvc.perform(multipart("/attachments").file(file)
                        .param("taskId", taskId)
                        .param("processInstanceId", processId)
                        .param("taskName", "Employee (MPE)")
                        .param("processName", "Resignation Process New"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fileName").value("invoice.pdf"))
                .andExpect(jsonPath("$.url").value(startsWith("http://localhost:8091/sharepoint/items/")))
                .andReturn();

        String url = com.jayway.jsonpath.JsonPath.read(stored.getResponse().getContentAsString(), "$.url");
        String id = url.substring(url.lastIndexOf('/') + 1);

        mvc.perform(get("/sharepoint/items"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].fileName").value("invoice.pdf"))
                .andExpect(jsonPath("$[0].taskId").value(taskId))
                .andExpect(jsonPath("$[0].processInstanceId").value(processId))
                .andExpect(jsonPath("$[0].taskName").value("Employee (MPE)"))
                .andExpect(jsonPath("$[0].processName").value("Resignation Process New"))
                .andExpect(jsonPath("$[0].location").value(
                        "TogetherFlow/Resignation Process New/Employee (MPE)/invoice.pdf"));

        mvc.perform(get("/sharepoint"))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("invoice.pdf")))
                .andExpect(content().string(containsString("Employee (MPE)")))
                .andExpect(content().string(containsString("Resignation Process New")))
                .andExpect(content().string(containsString(
                        "<th>Name</th><th>Task</th><th>Process</th><th>Location</th><th>Size</th>")))
                .andExpect(content().string(not(containsString(taskId))))
                .andExpect(content().string(not(containsString(processId))));

        mvc.perform(get("/sharepoint/items/{id}", id))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("Employee (MPE)")))
                .andExpect(content().string(containsString("Resignation Process New")))
                .andExpect(content().string(not(containsString(taskId))))
                .andExpect(content().string(not(containsString(processId))));

        mvc.perform(get("/sharepoint/items/{id}/content", id))
                .andExpect(status().isOk())
                .andExpect(content().string("pdf-bytes"));

        mvc.perform(get("/attachments/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.provider").value("sharepoint"))
                .andExpect(jsonPath("$.mode").value("local"))
                .andExpect(jsonPath("$.library").value("http://localhost:8091/sharepoint"));
    }

    @Test
    void rejectsAnUploadWithNoTaskAndNoProcess() throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", "a.txt", "text/plain",
                "x".getBytes(StandardCharsets.UTF_8));
        mvc.perform(multipart("/attachments").file(file)).andExpect(status().isBadRequest());
    }

    @Test
    void keepsAHostileFileNameInsideTheLibrary() throws Exception {
        LocalSharePointAttachmentStore store = new LocalSharePointAttachmentStore(storage.resolve("nested"),
                "http://localhost:8091", "Docs");
        store.store("task-1", "proc", "../../secret.txt", "text/plain",
                new java.io.ByteArrayInputStream("x".getBytes(StandardCharsets.UTF_8)), 1);

        assertThat(store.list()).singleElement()
                .extracting(SharePointDocument::location)
                .isEqualTo("Docs/proc/task-1/secret.txt");
    }
}
