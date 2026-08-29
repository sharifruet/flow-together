package org.togetherflow.workspace.git;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Git connectivity configuration (ADR 0018). */
@ConfigurationProperties(prefix = "togetherflow.workspace.git")
public class GitProperties {

    /** Off unless a deployment asks for it; the panel is then absent rather than empty. */
    private boolean enabled = false;

    /** Where working copies live. One directory per workspace beneath it. */
    private String workDir = System.getProperty("java.io.tmpdir") + "/togetherflow-git";

    /**
     * Credentials for every remote, from configuration rather than per workspace.
     *
     * <p>Per-workspace credentials would mean this service storing other people's tokens,
     * which is a materially larger thing to get wrong than a config value (ADR 0018). A
     * deployment needing several identities runs several instances.
     */
    private String username = "";

    private String token = "";

    /** Authorship on commits this service makes. */
    private String authorName = "TogetherFlow";

    private String authorEmail = "togetherflow@localhost";

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getWorkDir() {
        return workDir;
    }

    public void setWorkDir(String workDir) {
        this.workDir = workDir;
    }

    public String getUsername() {
        return username;
    }

    public void setUsername(String username) {
        this.username = username;
    }

    public String getToken() {
        return token;
    }

    public void setToken(String token) {
        this.token = token;
    }

    public String getAuthorName() {
        return authorName;
    }

    public void setAuthorName(String authorName) {
        this.authorName = authorName;
    }

    public String getAuthorEmail() {
        return authorEmail;
    }

    public void setAuthorEmail(String authorEmail) {
        this.authorEmail = authorEmail;
    }
}
