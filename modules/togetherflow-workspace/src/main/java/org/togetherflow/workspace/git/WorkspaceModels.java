package org.togetherflow.workspace.git;

import java.util.List;

import jakarta.servlet.http.HttpServletRequest;

/**
 * The models in a workspace, as far as Git is concerned (ADR 0018).
 *
 * <p>An interface rather than a direct dependency on the Flowable client so the Git
 * machinery can be tested against a real repository without a running engine — which is
 * what makes W3.2 testable here at all.
 *
 * <p>The request is carried through because reads and writes go to Flowable as the
 * *caller*, not as a service account: the guard adds a check in front of the engine, it
 * does not become a trusted intermediary that speaks for everyone.
 */
public interface WorkspaceModels {

    List<ExportedModel> export(String workspaceId, HttpServletRequest request);

    /**
     * Applies models pulled from the repository.
     *
     * @return the keys that were created and updated, in that order
     */
    ImportSummary apply(String workspaceId, List<ExportedModel> models, HttpServletRequest request);

    record ImportSummary(List<String> created, List<String> updated, List<String> failed) {
    }
}
