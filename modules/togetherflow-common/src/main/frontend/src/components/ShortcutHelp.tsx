/**
 * The shortcut list, rendered from the same bindings that drive the handler
 * (REQUIREMENTS.md §14.4) — so it cannot describe a shortcut that no longer exists.
 */

import { useEffect, useRef } from "react";
import { useT } from "../i18n/I18nContext";
import { Button } from "./Button";
import { Modal } from "./Modal";
import type { Shortcut } from "../shortcuts/useShortcuts";

export interface ShortcutHelpProps {
  shortcuts: Shortcut[];
  open: boolean;
  onClose: () => void;
}

/** Renders a key the way a keyboard shows it, rather than the DOM's name for it. */
function keyLabel(key: string): string {
  if (key === "Escape") return "Esc";
  if (key === " ") return "Space";
  if (key === "ArrowDown") return "↓";
  if (key === "ArrowUp") return "↑";
  return key;
}

export function ShortcutHelp({ shortcuts, open, onClose }: ShortcutHelpProps) {
  const t = useT();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  // A binding with no description is deliberately private — Escape, for instance, needs
  // no explaining and would only pad the list.
  const listed = shortcuts.filter((shortcut) => shortcut.description);

  return (
    <Modal
      open={open}
      title={t("shortcuts.title")}
      size="sm"
      onClose={onClose}
      actions={
        <Button ref={closeRef} onClick={onClose}>
          {t("action.close")}
        </Button>
      }
    >
      <dl className="tf-shortcuts">
        {listed.map((shortcut) => (
          <div className="tf-shortcuts__row" key={shortcut.key}>
            <dt>
              <kbd className="tf-kbd">{keyLabel(shortcut.key)}</kbd>
            </dt>
            <dd>{shortcut.description}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
