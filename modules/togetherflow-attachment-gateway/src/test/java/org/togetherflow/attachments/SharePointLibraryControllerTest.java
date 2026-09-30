package org.togetherflow.attachments;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
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
                        .param("processName", "Resignation Process New")
                        .param("caseNumber", "RES-010203-07102026")
                        .param("userName", "rakib.hasan"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fileName").value("invoice.pdf"))
                .andExpect(jsonPath("$.url").value(startsWith("http://localhost:8091/sharepoint/items/")))
                .andReturn();

        String url = com.jayway.jsonpath.JsonPath.read(stored.getResponse().getContentAsString(), "$.url");
        String id = url.substring(url.lastIndexOf('/') + 1);

        mvc.perform(get("/sharepoint/items"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.fileName == 'invoice.pdf')].taskId", hasItem(taskId)))
                .andExpect(jsonPath("$[?(@.fileName == 'invoice.pdf')].processInstanceId", hasItem(processId)))
                .andExpect(jsonPath("$[?(@.fileName == 'invoice.pdf')].taskName", hasItem("Employee (MPE)")))
                .andExpect(jsonPath("$[?(@.fileName == 'invoice.pdf')].processName", hasItem("Resignation Process New")))
                .andExpect(jsonPath("$[?(@.fileName == 'invoice.pdf')].caseNumber", hasItem("RES-010203-07102026")))
                .andExpect(jsonPath("$[?(@.fileName == 'invoice.pdf')].userName", hasItem("rakib.hasan")))
                .andExpect(jsonPath("$[?(@.fileName == 'invoice.pdf')].location",
                        hasItem("TogetherFlow/Resignation Process New/Employee (MPE)/invoice.pdf")));

        mvc.perform(get("/sharepoint"))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("invoice.pdf")))
                .andExpect(content().string(containsString("Employee (MPE)")))
                .andExpect(content().string(containsString("Resignation Process New")))
                .andExpect(content().string(containsString("RES-010203-07102026")))
                .andExpect(content().string(containsString("rakib.hasan")))
                .andExpect(content().string(containsString(
                        "<th>Name</th><th>Case Number</th><th>User</th><th>Task</th><th>Process</th><th>Location</th><th>Size</th>")))
                .andExpect(content().string(not(containsString(taskId))))
                .andExpect(content().string(not(containsString(processId))));

        mvc.perform(get("/sharepoint/items/{id}", id))
                .andExpect(status().isOk())
                .andExpect(content().string(not(containsString("<img class=\"preview\""))))
                .andExpect(content().string(containsString("Employee (MPE)")))
                .andExpect(content().string(containsString("Resignation Process New")))
                .andExpect(content().string(containsString("RES-010203-07102026")))
                .andExpect(content().string(containsString("rakib.hasan")))
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
    void anImageCanBeViewedInsteadOfOnlyDownloaded() throws Exception {
        byte[] pixels = new byte[] { (byte) 0x89, 0x50, 0x4e, 0x47 };
        MockMultipartFile file = new MockMultipartFile("file", "clearance.png", "image/png", pixels);
        MvcResult stored = mvc.perform(multipart("/attachments").file(file).param("taskId", "gad-task"))
                .andExpect(status().isOk())
                .andReturn();
        String url = com.jayway.jsonpath.JsonPath.read(stored.getResponse().getContentAsString(), "$.url");
        String id = url.substring(url.lastIndexOf('/') + 1);

        mvc.perform(get("/sharepoint"))
                .andExpect(status().isOk())
                .andExpect(content().string(not(containsString(">View</a>"))));

        mvc.perform(get("/sharepoint/items/{id}", id))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("<img class=\"preview\"")))
                .andExpect(content().string(containsString(">Download</a>")))
                .andExpect(content().string(not(containsString(">View</a>"))));

        mvc.perform(get("/sharepoint/items/{id}/content", id).param("inline", "true"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", containsString("image/png")))
                .andExpect(header().string("Content-Disposition", containsString("inline")))
                .andExpect(content().bytes(pixels));

        MockMultipartFile photo = new MockMultipartFile("file", "bike.jpg", "application/octet-stream",
                new byte[] { (byte) 0xff, (byte) 0xd8 });
        MvcResult photoStored = mvc.perform(multipart("/attachments").file(photo).param("taskId", "gad-task"))
                .andExpect(status().isOk())
                .andReturn();
        String photoUrl = com.jayway.jsonpath.JsonPath.read(photoStored.getResponse().getContentAsString(), "$.url");
        String photoId = photoUrl.substring(photoUrl.lastIndexOf('/') + 1);
        mvc.perform(get("/sharepoint/items/{id}", photoId))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("<img class=\"preview\"")))
                .andExpect(content().string(not(containsString(">View</a>"))));
    }

    @Test
    void stampsTheCaseNumberOntoFilesUploadedBeforeItExisted() throws Exception {
        MockMultipartFile file = new MockMultipartFile("file", "letter.pdf", "application/pdf",
                "pdf".getBytes(StandardCharsets.UTF_8));
        String processId = "aa32709b-bb31-11f1-9dc5-c8d9d2d2af8a";
        mvc.perform(multipart("/attachments").file(file)
                        .param("taskId", "task-early")
                        .param("processInstanceId", processId)
                        .param("taskName", "Employee (MPE)")
                        .param("processName", "Resignation Process New")
                        .param("userName", "rakib.hasan"))
                .andExpect(status().isOk());

        mvc.perform(post("/sharepoint/processes/{processInstanceId}/case", processId)
                        .param("caseNumber", "RES-010203-07102026"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.updated").value(1));

        mvc.perform(get("/sharepoint"))
                .andExpect(status().isOk())
                .andExpect(content().string(containsString("RES-010203-07102026")))
                .andExpect(content().string(containsString("rakib.hasan")));
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
