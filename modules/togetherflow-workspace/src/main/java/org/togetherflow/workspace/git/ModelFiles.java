package org.togetherflow.workspace.git;

import java.util.Locale;

/**
 * How a model is named on disk (ADR 0018).
 *
 * <p>By key, never by id: a repository full of UUIDs cannot be reviewed, and review is
 * most of the point of putting models in Git. The extension is the one the engine's own
 * deployment code recognises, so a file lifted out of the repository and deployed by hand
 * behaves the same way.
 */
public final class ModelFiles {

    /** Sits beside the models and says which model each file is. */
    public static final String MANIFEST = "togetherflow-manifest.json";

    private ModelFiles() {
    }

    public static String extensionFor(String category) {
        String kind = kindOf(category);
        return switch (kind) {
            case "bpmn" -> ".bpmn20.xml";
            case "cmmn" -> ".cmmn";
            case "dmn" -> ".dmn";
            case "form" -> ".form";
            case "event" -> ".event";
            case "channel" -> ".channel";
            case "app" -> ".app.json";
            // Unknown kinds still round-trip; naming them .xml would claim a format.
            default -> ".model";
        };
    }

    /** `togetherflow:bpmn` -> `bpmn`. A bare category is used as-is. */
    public static String kindOf(String category) {
        if (category == null || category.isBlank()) {
            return "";
        }
        int colon = category.lastIndexOf(':');
        return (colon >= 0 ? category.substring(colon + 1) : category).toLowerCase(Locale.ROOT);
    }

    public static String fileNameFor(String key, String category) {
        return sanitise(key) + extensionFor(category);
    }

    /** The model key a file name belongs to — the inverse of {@link #fileNameFor}. */
    public static String keyOf(String fileName) {
        for (String extension : new String[] {
                ".bpmn20.xml", ".cmmn", ".dmn", ".form", ".event", ".channel", ".app.json", ".model" }) {
            if (fileName.endsWith(extension)) {
                return fileName.substring(0, fileName.length() - extension.length());
            }
        }
        return fileName;
    }

    /**
     * Keeps a key usable as a path segment.
     *
     * <p>A model key is free text in the engine, so it can hold a slash — which would
     * silently write outside the workspace's directory, or outside the repository
     * entirely. Anything not plainly safe becomes an underscore.
     */
    public static String sanitise(String key) {
        if (key == null || key.isBlank()) {
            return "unnamed";
        }
        String cleaned = key.trim().replaceAll("[^A-Za-z0-9._-]", "_");
        // A name of dots would resolve to a directory rather than a file.
        return cleaned.replaceAll("^\\.+$", "unnamed");
    }
}
