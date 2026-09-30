package org.togetherflow.attachments;

import java.io.IOException;
import java.io.InputStream;
import java.io.Reader;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Properties;
import java.util.UUID;
import java.util.stream.Stream;

/**
 * A SharePoint document library that lives on disk and is served by this gateway.
 *
 * <p>It exists so an upload from any task can be opened and checked without an Azure AD
 * tenant. The layout matches the Graph provider: {@code folder / process / task / file}.
 * Point {@code togetherflow.attachments.sharepoint.mode} at {@code graph} and the same
 * upload API writes to Microsoft 365 instead.
 */
public class LocalSharePointAttachmentStore implements AttachmentStore {

    private final Path filesDir;
    private final String publicBaseUrl;
    private final String folderPath;

    public LocalSharePointAttachmentStore(Path libraryPath, String publicBaseUrl, String folderPath) {
        Path root = libraryPath.toAbsolutePath().normalize();
        this.filesDir = root.resolve("files").normalize();
        if (!filesDir.startsWith(root)) {
            throw new IllegalArgumentException("SharePoint library path is not a directory.");
        }
        this.publicBaseUrl = publicBaseUrl == null ? "" : publicBaseUrl.replaceAll("/+$", "");
        this.folderPath = folderPath == null ? "" : folderPath.replaceAll("^/+|/+$", "");
    }

    @Override
    public AttachmentProperties.Provider provider() {
        return AttachmentProperties.Provider.SHAREPOINT;
    }

    /** Browser URL of the library home page. */
    public String libraryHome() {
        return publicBaseUrl + "/sharepoint";
    }

    @Override
    public StoredAttachment store(String taskId, String fileName, String contentType, InputStream content,
            long sizeBytes) throws IOException {
        return store(taskId, null, fileName, contentType, content, sizeBytes);
    }

    @Override
    public StoredAttachment store(String taskId, String processInstanceId, String fileName, String contentType,
            InputStream content, long sizeBytes) throws IOException {
        return store(taskId, processInstanceId, null, null, null, null, fileName, contentType, content, sizeBytes);
    }

    /**
     * Stores a file and the human names of the task and process it came from.
     *
     * <p>The library shows those names. The ids stay in the metadata so a file can still
     * be traced, but they are not what a person reads in the Task and Process columns.
     * {@code caseNumber} is the business case, such as {@code RES-010203-07102026}.
     * {@code userName} is the sign-in id of the person who uploaded the file, or of the
     * user whose task produced it.
     */
    public synchronized StoredAttachment store(String taskId, String processInstanceId, String taskName,
            String processName, String caseNumber, String userName, String fileName, String contentType,
            InputStream content, long sizeBytes) throws IOException {

        String id = UUID.randomUUID().toString().replace("-", "");
        Path target = binary(id);
        Files.createDirectories(target.getParent());
        Files.copy(content, target);

        String url = publicBaseUrl + "/sharepoint/items/" + id;
        SharePointDocument document = new SharePointDocument(id, text(taskId), text(processInstanceId),
                text(taskName), text(processName), text(caseNumber), text(userName), text(fileName), text(contentType),
                Files.size(target), Instant.now().toString(), url,
                location(processName, taskName, processInstanceId, taskId, fileName));
        write(document);
        return new StoredAttachment(url, fileName, contentType, document.sizeBytes());
    }

    /** Fills in names for a file that was stored before they were known. A null leaves that field as it is. */
    public synchronized SharePointDocument relabel(String id, String taskName, String processName, String caseNumber,
            String userName) throws IOException {
        SharePointDocument current = require(id);
        String nextTask = taskName == null ? current.taskName() : taskName;
        String nextProcess = processName == null ? current.processName() : processName;
        String nextCase = caseNumber == null ? current.caseNumber() : caseNumber;
        String nextUser = userName == null ? current.userName() : userName;
        SharePointDocument updated = new SharePointDocument(current.id(), current.taskId(), current.processInstanceId(),
                text(nextTask), text(nextProcess), text(nextCase), text(nextUser), current.fileName(),
                current.contentType(), current.sizeBytes(), current.storedAt(), current.webUrl(),
                location(nextProcess, nextTask, current.processInstanceId(), current.taskId(), current.fileName()));
        write(updated);
        return updated;
    }

    /**
     * Writes the case number onto every file of a process. The number is often assigned
     * after the first upload, when the employee submits.
     */
    public synchronized int applyCaseNumber(String processInstanceId, String caseNumber) throws IOException {
        if (processInstanceId == null || processInstanceId.isBlank() || caseNumber == null || caseNumber.isBlank()) {
            return 0;
        }
        int updated = 0;
        for (SharePointDocument document : list()) {
            if (!processInstanceId.equals(document.processInstanceId())) {
                continue;
            }
            if (caseNumber.equals(document.caseNumber())) {
                continue;
            }
            relabel(document.id(), null, null, caseNumber, null);
            updated++;
        }
        return updated;
    }

    @Override
    public InputStream read(String id) throws IOException {
        return Files.newInputStream(binary(id));
    }

    public synchronized List<SharePointDocument> list() throws IOException {
        if (!Files.isDirectory(filesDir)) {
            return List.of();
        }
        List<SharePointDocument> documents = new ArrayList<>();
        try (Stream<Path> paths = Files.list(filesDir)) {
            for (Path meta : paths.filter(path -> path.getFileName().toString().endsWith(".meta")).toList()) {
                documents.add(read(meta));
            }
        }
        documents.sort(Comparator.comparing(SharePointDocument::storedAt).reversed());
        return List.copyOf(documents);
    }

    public synchronized SharePointDocument require(String id) throws IOException {
        Path meta = filesDir.resolve(validId(id) + ".meta").normalize();
        if (!meta.startsWith(filesDir) || !Files.isRegularFile(meta)) {
            throw new IOException("No such SharePoint item.");
        }
        return read(meta);
    }

    private void write(SharePointDocument document) throws IOException {
        Properties properties = new Properties();
        properties.setProperty("id", document.id());
        properties.setProperty("taskId", document.taskId());
        properties.setProperty("processInstanceId", document.processInstanceId());
        properties.setProperty("taskName", document.taskName());
        properties.setProperty("processName", document.processName());
        properties.setProperty("caseNumber", document.caseNumber());
        properties.setProperty("userName", document.userName());
        properties.setProperty("fileName", document.fileName());
        properties.setProperty("contentType", document.contentType());
        properties.setProperty("sizeBytes", Long.toString(document.sizeBytes()));
        properties.setProperty("storedAt", document.storedAt());
        properties.setProperty("webUrl", document.webUrl());
        properties.setProperty("location", document.location());
        Path meta = filesDir.resolve(document.id() + ".meta");
        try (Writer writer = Files.newBufferedWriter(meta, StandardCharsets.UTF_8)) {
            // Unicode escapes round-trip every file name, including ones Properties would
            // otherwise treat as syntax.
            properties.store(writer, "sharepoint-item");
        }
    }

    private static SharePointDocument read(Path meta) throws IOException {
        Properties properties = new Properties();
        try (Reader reader = Files.newBufferedReader(meta, StandardCharsets.UTF_8)) {
            properties.load(reader);
        }
        return new SharePointDocument(
                properties.getProperty("id", ""),
                properties.getProperty("taskId", ""),
                properties.getProperty("processInstanceId", ""),
                properties.getProperty("taskName", ""),
                properties.getProperty("processName", ""),
                properties.getProperty("caseNumber", ""),
                properties.getProperty("userName", ""),
                properties.getProperty("fileName", ""),
                properties.getProperty("contentType", ""),
                Long.parseLong(properties.getProperty("sizeBytes", "0")),
                properties.getProperty("storedAt", ""),
                properties.getProperty("webUrl", ""),
                properties.getProperty("location", ""));
    }

    /**
     * Folder path a person can read. Names win over ids, so the Location column does not
     * show a UUID when the task and process have names.
     */
    private String location(String processName, String taskName, String processInstanceId, String taskId,
            String fileName) {
        StringBuilder location = new StringBuilder();
        append(location, folderPath);
        append(location, namedSegment(prefer(processName, processInstanceId)));
        append(location, namedSegment(prefer(taskName, taskId)));
        append(location, safeSegment(fileName));
        return location.toString();
    }

    private static String namedSegment(String value) {
        if (value == null || value.isBlank()) {
            return "";
        }
        return safeSegment(value);
    }

    private static String prefer(String name, String id) {
        if (name != null && !name.isBlank()) {
            return name;
        }
        return id;
    }

    private static void append(StringBuilder location, String segment) {
        if (segment == null || segment.isBlank()) {
            return;
        }
        if (!location.isEmpty()) {
            location.append('/');
        }
        location.append(segment);
    }

    /**
     * Same segment rules as the Graph provider: separators and traversal stay inside
     * the configured folder.
     */
    static String safeSegment(String value) {
        String cleaned = value == null ? "" : value;
        cleaned = cleaned.replaceAll("[\\\\/:*?\"<>|]+", "-");
        cleaned = cleaned.replaceAll("\\.{2,}", "-");
        cleaned = cleaned.replaceAll("-{2,}", "-");
        cleaned = cleaned.replaceAll("^[-.\\s]+|[-\\s]+$", "");
        return cleaned.isEmpty() ? "file" : cleaned;
    }

    private Path binary(String id) {
        Path target = filesDir.resolve(validId(id) + ".bin").normalize();
        if (!target.startsWith(filesDir)) {
            throw new IllegalArgumentException("Attachment path escapes the SharePoint library.");
        }
        return target;
    }

    private static String validId(String id) {
        if (id == null || !id.matches("[0-9a-f]{32}")) {
            throw new IllegalArgumentException("Not a valid attachment id.");
        }
        return id;
    }

    private static String text(String value) {
        return value == null ? "" : value;
    }
}
