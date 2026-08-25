/**
 * Confirmation for consequential actions (§14.3). The message must name what is about
 * to happen — a bare "Are you sure?" is explicitly not acceptable.
 */

import { useEffect, useRef } from "react";
import { Button } from "./Button";

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
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="tf-dialog-backdrop" onMouseDown={onCancel}>
      <div
        className="tf-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="tf-dialog-title"
        aria-describedby="tf-dialog-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="tf-dialog__title" id="tf-dialog-title">
          {title}
        </h2>
        <p className="tf-dialog__description" id="tf-dialog-description">
          {description}
        </p>
        <div className="tf-dialog__actions">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            variant={destructive ? "danger" : "primary"}
            onClick={onConfirm}
            loading={busy}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
