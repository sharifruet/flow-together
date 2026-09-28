package org.togetherflow.attachments;

import java.io.IOException;
import java.io.InputStream;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.List;

import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * The document library a person opens to see whether a task file landed in SharePoint.
 *
 * <p>In {@code local} mode this gateway is the library: every upload is listed here and
 * can be downloaded. In {@code graph} mode the bytes live in Microsoft 365, so the page
 * says which drive they were written to instead of pretending to list them.
 */
@RestController
public class SharePointLibraryController {

    private static final DateTimeFormatter MODIFIED = DateTimeFormatter.ofPattern("d MMM yyyy, HH:mm")
            .withZone(ZoneId.systemDefault());

    private final AttachmentStore store;
    private final AttachmentProperties properties;

    public SharePointLibraryController(AttachmentStore store, AttachmentProperties properties) {
        this.store = store;
        this.properties = properties;
    }

    @GetMapping(value = "/sharepoint", produces = MediaType.TEXT_HTML_VALUE)
    public String library() {
        if (store instanceof LocalSharePointAttachmentStore local) {
            try {
                return page(local.list());
            } catch (IOException cause) {
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "The SharePoint library could not be read.");
            }
        }
        AttachmentProperties.SharePoint sharepoint = properties.getSharepoint();
        String body = """
                <div class="empty">
                  <h1>Documents</h1>
                  <p>Files from Flowable tasks are uploaded to Microsoft 365.</p>
                  <p>Drive <code>{{DRIVE}}</code>, folder <code>{{FOLDER}}</code>.</p>
                  <p>Open that document library in SharePoint to confirm an upload.</p>
                </div>
                """.replace("{{DRIVE}}", esc(sharepoint.getDriveId()))
                .replace("{{FOLDER}}", esc(sharepoint.getFolderPath()));
        return shell("SharePoint", body, false);
    }

    @GetMapping("/sharepoint/items")
    public List<SharePointDocument> items() {
        LocalSharePointAttachmentStore local = localStore();
        try {
            return local.list();
        } catch (IOException cause) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "The SharePoint library could not be read.");
        }
    }

    /** Writes the task and process names onto a file that was stored before they were known. */
    @PostMapping("/sharepoint/items/{id}/label")
    public SharePointDocument label(@PathVariable String id,
            @RequestParam(value = "taskName", required = false) String taskName,
            @RequestParam(value = "processName", required = false) String processName) {
        try {
            return localStore().relabel(id, taskName, processName);
        } catch (IllegalArgumentException invalid) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Not a valid attachment id.");
        } catch (IOException missing) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No such SharePoint item.");
        }
    }

    @GetMapping(value = "/sharepoint/items/{id}", produces = MediaType.TEXT_HTML_VALUE)
    public String item(@PathVariable String id) {
        SharePointDocument document = document(id);
        String body = """
                <div class="details">
                  <a class="back" href="/sharepoint">Documents</a>
                  <div class="detail-head">
                    {{ICON}}
                    <div>
                      <h1>{{NAME}}</h1>
                      <p class="muted">Modified {{MODIFIED}}</p>
                    </div>
                  </div>
                  <dl>
                    <dt>Name</dt><dd>{{NAME}}</dd>
                    <dt>Task</dt><dd>{{TASK}}</dd>
                    <dt>Process</dt><dd>{{PROCESS}}</dd>
                    <dt>Location</dt><dd>{{LOCATION}}</dd>
                    <dt>Size</dt><dd>{{SIZE}}</dd>
                  </dl>
                  <a class="button" href="/sharepoint/items/{{ID}}/content">Download</a>
                </div>
                """.replace("{{ICON}}", icon(document.fileName()))
                .replace("{{NAME}}", esc(document.fileName()))
                .replace("{{MODIFIED}}", esc(modified(document.storedAt())))
                .replace("{{TASK}}", label(document.taskName()))
                .replace("{{PROCESS}}", label(document.processName()))
                .replace("{{LOCATION}}", locationCell(document.location()))
                .replace("{{SIZE}}", esc(size(document.sizeBytes())))
                .replace("{{ID}}", esc(document.id()));
        return shell(document.fileName(), body, false);
    }

    @GetMapping("/sharepoint/items/{id}/content")
    public ResponseEntity<InputStreamResource> content(@PathVariable String id) {
        SharePointDocument document = document(id);
        try {
            InputStream content = store.read(id);
            String filename = document.fileName().replaceAll("[\\r\\n\"]", "");
            if (filename.isBlank()) {
                filename = "download";
            }
            return ResponseEntity.ok()
                    .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                    .header("X-Content-Type-Options", "nosniff")
                    .contentType(MediaType.APPLICATION_OCTET_STREAM)
                    .body(new InputStreamResource(content));
        } catch (IllegalArgumentException invalid) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Not a valid attachment id.");
        } catch (IOException missing) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No such SharePoint item.");
        }
    }

    private SharePointDocument document(String id) {
        try {
            return localStore().require(id);
        } catch (IllegalArgumentException invalid) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Not a valid attachment id.");
        } catch (IOException missing) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No such SharePoint item.");
        }
    }

    private LocalSharePointAttachmentStore localStore() {
        if (store instanceof LocalSharePointAttachmentStore local) {
            return local;
        }
        throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                "This deployment uploads to Microsoft 365. Open the document library there.");
    }

    private static String page(List<SharePointDocument> documents) {
        StringBuilder rows = new StringBuilder();
        if (documents.isEmpty()) {
            rows.append("<tr class=\"empty-row\"><td colspan=\"5\">This library is empty. "
                    + "Upload a file on a Flowable task and it will show up here.</td></tr>");
        }
        for (SharePointDocument document : documents) {
            rows.append("<tr><td class=\"name\"><a href=\"/sharepoint/items/").append(esc(document.id())).append("\">")
                    .append(icon(document.fileName()))
                    .append("<span class=\"file\"><span class=\"filename\">").append(esc(document.fileName()))
                    .append("</span><span class=\"muted\">Modified ").append(esc(modified(document.storedAt())))
                    .append("</span></span></a></td><td>").append(label(document.taskName()))
                    .append("</td><td>").append(label(document.processName()))
                    .append("</td><td class=\"location\">").append(locationCell(document.location()))
                    .append("</td><td class=\"size\">").append(esc(size(document.sizeBytes())))
                    .append("</td></tr>");
        }
        String count = documents.size() == 1 ? "1 item" : documents.size() + " items";
        String body = """
                <div class="command">
                  <input id="library-search" type="search" placeholder="Search this library" aria-label="Search this library">
                  <span class="count">{{COUNT}}</span>
                </div>
                <div class="list">
                  <table>
                    <thead><tr><th>Name</th><th>Task</th><th>Process</th><th>Location</th><th>Size</th></tr></thead>
                    <tbody id="library-body">{{ROWS}}</tbody>
                  </table>
                </div>
                """.replace("{{COUNT}}", esc(count)).replace("{{ROWS}}", rows.toString());
        return shell("Documents", body, true);
    }

    private static String shell(String title, String body, boolean searchable) {
        String script = searchable ? """
                <script>
                document.getElementById('library-search').addEventListener('input', function (event) {
                  var query = event.target.value.toLowerCase();
                  document.querySelectorAll('#library-body tr').forEach(function (row) {
                    row.hidden = query !== '' && row.textContent.toLowerCase().indexOf(query) < 0;
                  });
                });
                </script>
                """ : "";
        return """
                <!DOCTYPE html>
                <html lang="en">
                <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>{{TITLE}} - SharePoint</title>
                <style>
                {{STYLES}}
                </style>
                </head>
                <body>
                <header class="suite">
                  <span class="waffle" aria-hidden="true"></span>
                  <span class="product">SharePoint</span>
                  <span class="divider" aria-hidden="true"></span>
                  <a class="site" href="/sharepoint">TogetherFlow</a>
                </header>
                <main>
                  <div class="site-head">
                    <span class="mark" aria-hidden="true"></span>
                    <div>
                      <p class="eyebrow">TogetherFlow</p>
                      <h1>Documents</h1>
                    </div>
                  </div>
                  {{BODY}}
                </main>
                {{SCRIPT}}
                </body>
                </html>
                """.replace("{{TITLE}}", esc(title))
                .replace("{{STYLES}}", styles())
                .replace("{{BODY}}", body)
                .replace("{{SCRIPT}}", script);
    }

    private static String styles() {
        return """
                :root {
                  color-scheme: light;
                  --teal: #038387;
                  --teal-dark: #026d70;
                  --ink: #323130;
                  --muted: #605e5c;
                  --line: #edebe9;
                  --hover: #f3f2f1;
                  --canvas: #faf9f8;
                  --header: #faf9f8;
                }
                * { box-sizing: border-box; }
                body {
                  margin: 0;
                  background: var(--canvas);
                  color: var(--ink);
                  font-family: "Segoe UI", "Segoe UI Web (West European)", Segoe UI, -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", sans-serif;
                  font-size: 14px;
                  line-height: 1.4;
                }
                a { color: inherit; text-decoration: none; }
                .suite {
                  display: flex;
                  align-items: center;
                  gap: 12px;
                  height: 48px;
                  padding: 0 16px;
                  background: var(--teal);
                  color: #fff;
                }
                .waffle {
                  width: 16px;
                  height: 16px;
                  background:
                    radial-gradient(circle, #fff 1.3px, transparent 1.4px) 0 0 / 5.5px 5.5px;
                }
                .product { font-size: 16px; font-weight: 600; }
                .divider { width: 1px; height: 18px; background: rgba(255,255,255,.45); }
                .site { color: #fff; font-size: 14px; }
                .site:hover { text-decoration: underline; }
                main { padding: 0 0 32px; }
                .site-head {
                  display: flex;
                  align-items: center;
                  gap: 16px;
                  padding: 20px 32px 12px;
                  background: #fff;
                  border-bottom: 1px solid var(--line);
                }
                .mark {
                  width: 40px;
                  height: 40px;
                  border-radius: 4px;
                  background:
                    linear-gradient(#fff, #fff) 8px 8px / 10px 10px no-repeat,
                    linear-gradient(#fff, #fff) 22px 8px / 10px 10px no-repeat,
                    linear-gradient(#fff, #fff) 8px 22px / 10px 10px no-repeat,
                    linear-gradient(#ca5010, #ca5010) 22px 22px / 10px 10px no-repeat,
                    var(--teal);
                }
                .eyebrow { margin: 0; color: var(--muted); font-size: 12px; }
                h1 { margin: 0; font-size: 28px; font-weight: 600; letter-spacing: -0.02em; }
                .command {
                  display: flex;
                  align-items: center;
                  gap: 16px;
                  padding: 12px 24px;
                }
                .command input {
                  width: min(320px, 100%);
                  height: 32px;
                  padding: 0 12px;
                  border: 1px solid #8a8886;
                  border-radius: 2px;
                  background: #fff;
                  color: var(--ink);
                  font: inherit;
                }
                .command input:focus { outline: 2px solid var(--teal); border-color: var(--teal); }
                .count { margin-left: auto; color: var(--muted); }
                .list {
                  margin: 0 24px;
                  background: #fff;
                  border: 1px solid var(--line);
                  border-radius: 2px;
                  overflow: auto;
                }
                table { width: 100%; border-collapse: collapse; min-width: 760px; }
                th, td { padding: 0 12px; text-align: left; vertical-align: middle; }
                th {
                  height: 42px;
                  background: var(--header);
                  color: var(--ink);
                  font-size: 12px;
                  font-weight: 600;
                  border-bottom: 1px solid var(--line);
                  position: sticky;
                  top: 0;
                }
                td { height: 48px; border-bottom: 1px solid var(--line); }
                tbody tr:hover { background: var(--hover); }
                tbody tr:last-child td { border-bottom: 0; }
                th:nth-child(1), td:nth-child(1) { width: 32%; padding-left: 16px; }
                th:nth-child(4), td:nth-child(4) { width: 26%; }
                th:nth-child(5), td.size { width: 88px; text-align: right; padding-right: 16px; color: var(--muted); }
                .name a { display: flex; align-items: center; gap: 12px; min-height: 48px; color: var(--ink); }
                .name a:hover .filename { color: var(--teal-dark); text-decoration: underline; }
                .file { display: flex; flex-direction: column; min-width: 0; }
                .filename { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                .muted { color: var(--muted); font-size: 12px; font-weight: 400; }
                .icon {
                  flex: none;
                  width: 32px;
                  height: 32px;
                  border-radius: 2px;
                  display: inline-flex;
                  align-items: center;
                  justify-content: center;
                  color: #fff;
                  font-size: 9px;
                  font-weight: 700;
                  letter-spacing: 0.02em;
                }
                .icon.pdf { background: #d13438; }
                .icon.word { background: #185abd; }
                .icon.excel { background: #107c10; }
                .icon.image { background: #ca5010; }
                .icon.text { background: #605e5c; }
                .icon.file { background: var(--teal); }
                .crumbs { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; color: var(--muted); }
                .sep { color: #a19f9d; }
                .empty, .details {
                  margin: 24px;
                  padding: 28px;
                  background: #fff;
                  border: 1px solid var(--line);
                }
                .empty-row td { height: 96px; color: var(--muted); text-align: center; }
                .back { color: var(--teal-dark); font-weight: 600; }
                .back:hover { text-decoration: underline; }
                .detail-head { display: flex; align-items: center; gap: 16px; margin: 16px 0 8px; }
                .detail-head .icon { width: 48px; height: 48px; font-size: 12px; }
                dl { display: grid; grid-template-columns: 120px 1fr; gap: 10px 16px; margin: 20px 0 24px; }
                dt { color: var(--muted); }
                dd { margin: 0; }
                .button {
                  display: inline-flex;
                  align-items: center;
                  height: 32px;
                  padding: 0 16px;
                  background: var(--teal);
                  color: #fff;
                  font-weight: 600;
                  border-radius: 2px;
                }
                .button:hover { background: var(--teal-dark); }
                """;
    }

    private static String icon(String fileName) {
        String ext = extension(fileName);
        String kind = switch (ext) {
            case "pdf" -> "pdf";
            case "doc", "docx" -> "word";
            case "xls", "xlsx", "csv" -> "excel";
            case "png", "jpg", "jpeg", "gif", "webp" -> "image";
            case "txt" -> "text";
            default -> "file";
        };
        String letters = ext.isEmpty() ? "FILE" : ext.toUpperCase();
        if (letters.length() > 4) {
            letters = letters.substring(0, 4);
        }
        return "<span class=\"icon " + kind + "\" aria-hidden=\"true\">" + esc(letters) + "</span>";
    }

    private static String extension(String fileName) {
        if (fileName == null) {
            return "";
        }
        int dot = fileName.lastIndexOf('.');
        if (dot < 0 || dot == fileName.length() - 1) {
            return "";
        }
        return fileName.substring(dot + 1).toLowerCase();
    }

    private static String locationCell(String location) {
        if (location == null || location.isBlank()) {
            return "<span class=\"muted\">—</span>";
        }
        String[] parts = location.split("/");
        StringBuilder cell = new StringBuilder("<span class=\"crumbs\">");
        for (int i = 0; i < parts.length; i++) {
            if (i > 0) {
                cell.append("<span class=\"sep\" aria-hidden=\"true\">›</span>");
            }
            cell.append("<span>").append(esc(parts[i])).append("</span>");
        }
        cell.append("</span>");
        return cell.toString();
    }

    private static String label(String name) {
        if (name == null || name.isBlank()) {
            return "<span class=\"muted\">—</span>";
        }
        return esc(name);
    }

    private static String size(long bytes) {
        if (bytes < 1024) {
            return bytes + " B";
        }
        if (bytes < 1024L * 1024L) {
            return String.format("%.1f KB", bytes / 1024.0);
        }
        return String.format("%.1f MB", bytes / (1024.0 * 1024.0));
    }

    private static String modified(String storedAt) {
        if (storedAt == null || storedAt.isBlank()) {
            return "";
        }
        try {
            return MODIFIED.format(Instant.parse(storedAt));
        } catch (DateTimeParseException ignored) {
            return storedAt;
        }
    }

    private static String esc(String value) {
        if (value == null) {
            return "";
        }
        return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }
}
