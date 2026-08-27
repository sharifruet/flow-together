/**
 * Confirmation for consequential actions (§14.3). The message must name what is about
 * to happen — a bare "Are you sure?" is explicitly not acceptable.
 *
 * Built on `Modal` since W1.4 (F6). It used to own its own dialog markup and had none of
 * the trap/restore/scroll-lock/inert behaviour; that now lives in exactly one place and
 * this is a shape on top of it.
 */

import { useEffect, useRef } from "react";
import { useT } from "../i18n/I18nContext";
import { Button } from "./Button";
import { Modal } from "./Modal";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Should name the specific item and consequence, e.g. "Complete 'Approve invoice #42'?" */
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const t = useT();
  const confirmRef = useRef<HTMLButtonElement>(null);

  /*
   * Modal focuses itself so the title is read first; a confirmation is the one case
   * where moving on to the action is right — the user already knows what they asked for
   * and the dialog exists to let them press Enter or Escape.
   */
  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);

  return (
    <Modal
      open={open}
      title={title}
      description={description}
      role="alertdialog"
      size="sm"
      onClose={onCancel}
      actions={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel ?? t("dialog.cancel")}
          </Button>
          <Button
            ref={confirmRef}
            variant={destructive ? "danger" : "primary"}
            onClick={onConfirm}
            loading={busy}
          >
            {confirmLabel ?? t("dialog.confirm")}
          </Button>
        </>
      }
    />
  );
}
