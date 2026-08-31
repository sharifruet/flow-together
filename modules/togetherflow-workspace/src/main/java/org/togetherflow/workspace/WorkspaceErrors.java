package org.togetherflow.workspace;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * Failures as statuses the UI already knows how to render (REQUIREMENTS §14.1: specific
 * and actionable, never a bare failure).
 */
@RestControllerAdvice
public class WorkspaceErrors {

    @ExceptionHandler(WorkspaceService.AccessDenied.class)
    public ResponseEntity<Map<String, String>> denied(WorkspaceService.AccessDenied denied) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(message(denied.getMessage()));
    }

    @ExceptionHandler(WorkspaceService.NotFound.class)
    public ResponseEntity<Map<String, String>> missing(WorkspaceService.NotFound notFound) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(message(notFound.getMessage()));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> invalid(IllegalArgumentException invalid) {
        return ResponseEntity.badRequest().body(message(invalid.getMessage()));
    }

    @ExceptionHandler(org.togetherflow.workspace.git.WorkspaceGitService.GitUnavailable.class)
    public ResponseEntity<Map<String, String>> git(
            org.togetherflow.workspace.git.WorkspaceGitService.GitUnavailable unavailable) {
        // 502: the request was well-formed and allowed, and something downstream — the
        // remote, the working copy — could not do it. Distinct from a 400 the caller can fix.
        return ResponseEntity.status(HttpStatus.BAD_GATEWAY).body(message(unavailable.getMessage()));
    }

    @ExceptionHandler(FlowableClient.UpstreamUnavailable.class)
    public ResponseEntity<Map<String, String>> upstream(FlowableClient.UpstreamUnavailable unavailable) {
        // Distinct from Flowable refusing: "we could not ask" and "the answer was no"
        // need different words, and only one of them is worth retrying.
        return ResponseEntity.status(unavailable.status()).body(message(unavailable.getMessage()));
    }

    private static Map<String, String> message(String message) {
        return Map.of("message", message == null ? "That request could not be completed." : message);
    }
}
