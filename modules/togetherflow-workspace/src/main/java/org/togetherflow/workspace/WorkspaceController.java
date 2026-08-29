package org.togetherflow.workspace;

import java.util.List;
import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Workspace and membership administration (ADR 0017). */
@RestController
@RequestMapping("/workspaces")
public class WorkspaceController {

    private final WorkspaceService service;
    private final CallerResolver callers;

    public WorkspaceController(WorkspaceService service, CallerResolver callers) {
        this.service = service;
        this.callers = callers;
    }

    /** Every workspace the caller can see, each carrying the role they hold in it. */
    @GetMapping
    public List<Map<String, Object>> list(HttpServletRequest request) {
        return service.visibleTo(callers.resolve(request)).stream().map(WorkspaceController::asMap).toList();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> create(@RequestBody Map<String, String> body, HttpServletRequest request) {
        return asMap(service.create(callers.resolve(request), body.get("key"), body.get("name"),
                body.get("description"), WorkspaceVisibility.parse(body.get("visibility"))));
    }

    @PutMapping("/{workspaceId}")
    public Workspace update(@PathVariable String workspaceId, @RequestBody Map<String, String> body,
            HttpServletRequest request) {
        return service.update(workspaceId, callers.resolve(request), body.get("name"),
                body.get("description"),
                body.containsKey("visibility") ? WorkspaceVisibility.parse(body.get("visibility")) : null);
    }

    /** Links or clears the shared workspace. A null or blank id clears it. */
    @PutMapping("/{workspaceId}/shared")
    public Workspace share(@PathVariable String workspaceId, @RequestBody Map<String, String> body,
            HttpServletRequest request) {
        return service.share(workspaceId, callers.resolve(request), body.get("sharedWorkspaceId"));
    }

    @DeleteMapping("/{workspaceId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String workspaceId, HttpServletRequest request) {
        service.delete(workspaceId, callers.resolve(request));
    }

    @GetMapping("/{workspaceId}/members")
    public List<WorkspaceMember> members(@PathVariable String workspaceId, HttpServletRequest request) {
        return service.members(workspaceId, callers.resolve(request));
    }

    @PutMapping("/{workspaceId}/members")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void addMember(@PathVariable String workspaceId, @RequestBody Map<String, String> body,
            HttpServletRequest request) {
        service.addMember(workspaceId, callers.resolve(request), new WorkspaceMember(workspaceId,
                WorkspaceMember.PrincipalType.parse(body.get("principalType")),
                body.get("principalId"), WorkspaceRole.parse(body.get("role"))));
    }

    @DeleteMapping("/{workspaceId}/members")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void removeMember(@PathVariable String workspaceId,
            @RequestParam(defaultValue = "USER") String principalType,
            @RequestParam String principalId, HttpServletRequest request) {
        service.removeMember(workspaceId, callers.resolve(request),
                WorkspaceMember.PrincipalType.parse(principalType), principalId);
    }

    /** Puts a model in a workspace, or moves it between two the caller can edit. */
    @PutMapping("/{workspaceId}/models/{modelId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void assignModel(@PathVariable String workspaceId, @PathVariable String modelId,
            HttpServletRequest request) {
        service.assignModel(modelId, workspaceId, callers.resolve(request));
    }

    private static Map<String, Object> asMap(WorkspaceService.WorkspaceView view) {
        Workspace workspace = view.workspace();
        return Map.of(
                "id", workspace.id(),
                "key", workspace.key(),
                "name", workspace.name(),
                "description", workspace.description() == null ? "" : workspace.description(),
                "visibility", workspace.visibility().name(),
                "sharedWorkspaceId", workspace.sharedWorkspaceId() == null ? "" : workspace.sharedWorkspaceId(),
                "role", view.role().name(),
                // The UI hides what the caller cannot do; sending the capabilities rather
                // than the role name means it never has to re-implement the role table.
                "capabilities", view.role().capabilities().stream().map(Enum::name).sorted().toList());
    }
}
