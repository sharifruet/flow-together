package org.togetherflow.workspace.git;

/** One model, as it goes into or comes out of the repository. */
public record ExportedModel(String id, String key, String name, String category, String source) {
}
