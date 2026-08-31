package org.togetherflow.workspace.git;

import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import org.togetherflow.workspace.CallerResolver;

/** The Git panel's API (ADR 0018). */
@RestController
@RequestMapping("/workspaces/{workspaceId}/git")
public class GitController {

    private final WorkspaceGitService git;
    private final CallerResolver callers;

    public GitController(WorkspaceGitService git, CallerResolver callers) {
        this.git = git;
        this.callers = callers;
    }

    @GetMapping
    public GitStatus status(@PathVariable String workspaceId, HttpServletRequest request) {
        return git.status(workspaceId, callers.resolve(request), request);
    }

    /** Connects and imports what the repository holds, so the two agree immediately. */
    @PostMapping
    public WorkspaceModels.ImportSummary connect(@PathVariable String workspaceId,
            @RequestBody Map<String, String> body, HttpServletRequest request) {
        return git.connectAndImport(workspaceId, callers.resolve(request), body.get("remoteUrl"),
                body.get("branch"), body.get("subPath"), request);
    }

    @DeleteMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void disconnect(@PathVariable String workspaceId, HttpServletRequest request) {
        git.disconnect(workspaceId, callers.resolve(request));
    }

    @PostMapping("/commit")
    public Map<String, String> commit(@PathVariable String workspaceId,
            @RequestBody Map<String, String> body, HttpServletRequest request) {
        return Map.of("commitId",
                git.commit(workspaceId, callers.resolve(request), body.get("message"), request));
    }

    @PostMapping("/push")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void push(@PathVariable String workspaceId, HttpServletRequest request) {
        git.push(workspaceId, callers.resolve(request));
    }

    @PostMapping("/pull")
    public WorkspaceModels.ImportSummary pull(@PathVariable String workspaceId,
            HttpServletRequest request) {
        return git.pull(workspaceId, callers.resolve(request), request);
    }

    @PostMapping("/revert")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void revert(@PathVariable String workspaceId, HttpServletRequest request) {
        git.revert(workspaceId, callers.resolve(request));
    }

    @PostMapping("/branches")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void createBranch(@PathVariable String workspaceId, @RequestBody Map<String, String> body,
            HttpServletRequest request) {
        git.createBranch(workspaceId, callers.resolve(request), body.get("name"));
    }

    @PostMapping("/branches/switch")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void switchBranch(@PathVariable String workspaceId, @RequestBody Map<String, String> body,
            HttpServletRequest request) {
        git.switchBranch(workspaceId, callers.resolve(request), body.get("name"));
    }

    /** Plain text: it is a unified diff, and JSON-wrapping it only makes it harder to read. */
    @GetMapping(value = "/diff", produces = MediaType.TEXT_PLAIN_VALUE)
    public String diff(@PathVariable String workspaceId,
            @RequestParam(required = false) String modelKey, HttpServletRequest request) {
        return git.diff(workspaceId, callers.resolve(request), modelKey, request);
    }
}
