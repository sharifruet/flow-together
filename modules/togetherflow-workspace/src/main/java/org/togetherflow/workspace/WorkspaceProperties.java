package org.togetherflow.workspace;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Configuration for the workspace service (ADR 0017). */
@ConfigurationProperties(prefix = "togetherflow.workspace")
public class WorkspaceProperties {

    /** Table name prefix, matching the engine's own convention for readability. */
    private String tablePrefix = "TF_";

    /**
     * Base URL of the Flowable REST API this service guards, e.g.
     * {@code http://flowable-rest:8080/flowable-rest/service}.
     *
     * <p>For the guard to mean anything this address should be reachable from the service
     * and <em>not</em> from the browser — see the README. A deployment that publishes both
     * gets a UI that hides actions the server still allows, which REQUIREMENTS §13.1 is
     * explicit is not a security boundary.
     */
    private String flowableBaseUrl = "http://localhost:8080/flowable-rest/service";

    /**
     * A model with no workspace assignment: readable by anyone, or by nobody.
     *
     * <p>Defaults to readable. Every model that exists before this module is first
     * deployed is unassigned, so failing closed would make an entire existing library
     * vanish on upgrade — an outage dressed as a security improvement. Deployments that
     * want strictness turn it on once their models are assigned.
     */
    private boolean unassignedModelsVisible = true;

    /** Claim carrying the caller's groups in an OIDC token. */
    private String groupsClaim = "groups";

    public String getTablePrefix() {
        return tablePrefix;
    }

    public void setTablePrefix(String tablePrefix) {
        this.tablePrefix = tablePrefix;
    }

    public String getFlowableBaseUrl() {
        return flowableBaseUrl;
    }

    public void setFlowableBaseUrl(String flowableBaseUrl) {
        this.flowableBaseUrl = flowableBaseUrl;
    }

    public boolean isUnassignedModelsVisible() {
        return unassignedModelsVisible;
    }

    public void setUnassignedModelsVisible(boolean unassignedModelsVisible) {
        this.unassignedModelsVisible = unassignedModelsVisible;
    }

    public String getGroupsClaim() {
        return groupsClaim;
    }

    public void setGroupsClaim(String groupsClaim) {
        this.groupsClaim = groupsClaim;
    }
}
