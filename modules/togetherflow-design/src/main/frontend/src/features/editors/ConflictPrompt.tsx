/**
 * Reload-or-overwrite, when someone else saved the model you are editing
 * (ENTERPRISE_PARITY_PLAN.md W1.1, UI_POLISH_BACKLOG.md I1).
 *
 * `ModelApi.saveSource` refuses a write whose baseline has moved and throws
 * `ConcurrentEditError`. That is the correctness half — the other editor's work survives.
 * This is the half the user sees, and it lives in one place because six editors autosave:
 * BPMN, CMMN, DMN, Form, Event and App.
 *
 * Autosave is silent by design, so the first thing a conflict does is **stop autosaving**.
 * A dialog that appeared and was dismissed while the editor kept retrying every four
 * seconds would just reappear — and would keep asking a question the user has not been
 * given the information to answer.
 *
 * The three outcomes each discard something, and say so:
 *
 *   Reload        discard my unsaved changes, take theirs
 *   Overwrite     discard their save, keep mine
 *   Keep editing  neither — stay put, autosave off, decide later
 */

import { useCallback, useState, type ReactNode } from "react";
import { Button, ConcurrentEditError, Modal, useT, useToast } from "@togetherflow/common";

export interface ConflictGuard {
  /**
   * Runs a save, catching a refusal. `overwrite` is threaded through so the retry after
   * "Overwrite" is the same call with the guard off, rather than a second code path.
   */
  guard: <T>(save: (overwrite: boolean) => Promise<T>) => Promise<T | undefined>;
  /** True while a conflict is unresolved. Editors stop autosaving on this. */
  blocked: boolean;
  /** Render inside the editor. Null when there is no conflict. */
  prompt: ReactNode;
}

export interface UseConflictPromptOptions {
  /** Re-import the stored source into the editor, discarding local changes. */
  onReload: (storedSource: string | null) => void;
}

export function useConflictPrompt({ onReload }: UseConflictPromptOptions): ConflictGuard {
  const t = useT();
  const { push } = useToast();
  const [conflict, setConflict] = useState<{ storedSource: string | null } | null>(null);
  const [retry, setRetry] = useState<{ run: (overwrite: boolean) => Promise<unknown> } | null>(null);

  const guard = useCallback(async <T,>(save: (overwrite: boolean) => Promise<T>) => {
    try {
      return await save(false);
    } catch (error) {
      if (!(error instanceof ConcurrentEditError)) throw error;
      setConflict({ storedSource: error.storedSource });
      // Held so "Overwrite" replays exactly the save that was refused, carrying the
      // content the user still has on screen.
      setRetry({ run: save as (overwrite: boolean) => Promise<unknown> });
      return undefined;
    }
  }, []);

  const close = () => {
    setConflict(null);
    setRetry(null);
  };

  return {
    guard,
    blocked: conflict !== null,
    prompt: conflict ? (
      <Modal
        open
        role="alertdialog"
        size="sm"
        title={t("editor.conflict.title")}
        description={t("editor.conflict.description")}
        // A stray backdrop click must not dismiss a question about losing work.
        dismissOnBackdrop={false}
        onClose={close}
        actions={
          <>
            <Button variant="secondary" onClick={close}>
              {t("editor.conflict.keepEditing")}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                onReload(conflict.storedSource);
                close();
                push({ tone: "info", message: t("editor.conflict.reloaded") });
              }}
            >
              {t("editor.conflict.reload")}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const run = retry?.run;
                close();
                void run?.(true);
              }}
            >
              {t("editor.conflict.overwrite")}
            </Button>
          </>
        }
      >
        <p className="tf-muted">{t("editor.conflict.note")}</p>
      </Modal>
    ) : null,
  };
}
