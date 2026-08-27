/**
 * The one modal (UI_POLISH_BACKLOG.md F6).
 *
 * `ConfirmDialog` focused its confirm button and closed on Escape, and stopped there:
 * Tab walked straight out into the page behind it, focus was not restored on close, the
 * body still scrolled, and the background stayed fully exposed to assistive tech. Other
 * dialogs — Work's delegate dialog, Control's migration form — hand-rolled `.tf-dialog`
 * markup instead of reusing it, so each had its own subset of that behaviour.
 *
 * This owns all four, once:
 *
 *   trap        Tab and Shift+Tab cycle inside the dialog
 *   restore     focus returns to whatever opened it
 *   scroll lock the page behind cannot scroll
 *   inert       the page behind is hidden from assistive tech and pointer alike
 *
 * `inert` is used where the browser has it (Safari 15.5+, Chrome 102+, Firefox 112+) and
 * `aria-hidden` is the fallback. They are not equivalent — `aria-hidden` hides from
 * assistive tech but leaves the background clickable and focusable, which is exactly the
 * gap the trap then has to cover — so both are applied rather than either alone.
 *
 * Rendered through a portal to `<body>`, which is what makes that work at all. Rendered
 * in place, the dialog sits *inside* the React root, so "everything except the dialog"
 * is the root itself — and marking the root inert would mark the dialog inert with it.
 * The portal is a correctness requirement here, not a styling convenience.
 */

import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useT } from "../i18n/I18nContext";

export type ModalSize = "sm" | "md" | "lg";

export interface ModalProps {
  open: boolean;
  /** Accessible name. Rendered as the dialog's heading unless `hideTitle`. */
  title: string;
  /** Renders the title for assistive tech only — for a dialog whose body carries its own. */
  hideTitle?: boolean;
  description?: string;
  size?: ModalSize;
  /**
   * `alertdialog` for a dialog interrupting the user with something they must resolve;
   * `dialog` for one they opened. Screen readers treat the two differently, so it is not
   * cosmetic.
   */
  role?: "dialog" | "alertdialog";
  /** Off for a dialog with unsaved input, where a stray backdrop click would discard it. */
  dismissOnBackdrop?: boolean;
  onClose: () => void;
  /** Rendered in the footer, right-aligned. Usually `<Button>`s. */
  actions?: ReactNode;
  children?: ReactNode;
}

/** Everything that can hold focus, minus what is currently disabled or hidden. */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function Modal({
  open,
  title,
  hideTitle = false,
  description,
  size = "md",
  role = "dialog",
  dismissOnBackdrop = true,
  onClose,
  actions,
  children,
}: ModalProps) {
  const t = useT();
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  const focusable = useCallback(
    () =>
      Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter(
        (element) => element.offsetParent !== null || element === document.activeElement,
      ),
    [],
  );

  /* Focus in on open, and back where it came from on close. */
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    // The dialog itself, not its first control: reading starts at the title rather than
    // halfway down at whatever happens to be focusable first.
    dialogRef.current?.focus();
    return () => opener?.focus?.();
  }, [open]);

  /* Everything outside the dialog is inert while it is open. */
  useEffect(() => {
    if (!open) return;
    const dialogRoot = dialogRef.current?.closest(".tf-modal-backdrop");
    const siblings = Array.from(document.body.children).filter(
      (child) => child !== dialogRoot,
    );
    const restore = siblings.map((element) => ({
      element,
      inert: element.hasAttribute("inert"),
      hidden: element.getAttribute("aria-hidden"),
    }));
    for (const element of siblings) {
      element.setAttribute("inert", "");
      element.setAttribute("aria-hidden", "true");
    }

    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      for (const entry of restore) {
        if (!entry.inert) entry.element.removeAttribute("inert");
        if (entry.hidden === null) entry.element.removeAttribute("aria-hidden");
        else entry.element.setAttribute("aria-hidden", entry.hidden);
      }
      document.body.style.overflow = overflow;
    };
  }, [open]);

  /* Escape closes; Tab cycles rather than escaping. */
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const elements = focusable();
      if (elements.length === 0) {
        // Nothing to move to; keep focus on the dialog rather than letting it leave.
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && (active === first || active === dialogRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, onClose, focusable]);

  if (!open) return null;

  return createPortal(
    <div
      className="tf-modal-backdrop"
      onMouseDown={dismissOnBackdrop ? onClose : undefined}
    >
      <div
        ref={dialogRef}
        className={`tf-modal tf-modal--${size}`}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="tf-modal__header">
          <h2 className={hideTitle ? "tf-visually-hidden" : "tf-modal__title"} id={titleId}>
            {title}
          </h2>
          <button
            type="button"
            className="tf-modal__close"
            onClick={onClose}
            aria-label={t("dialog.close")}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        {description ? (
          <p className="tf-modal__description" id={descriptionId}>
            {description}
          </p>
        ) : null}

        {children ? <div className="tf-modal__body">{children}</div> : null}
        {actions ? <div className="tf-modal__actions">{actions}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
