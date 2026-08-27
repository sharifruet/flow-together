/**
 * The row-action and toolbar menu (UI_POLISH_BACKLOG.md F2, C1).
 *
 * C1 wants a per-row overflow menu on `DataTable`, and today actions live only in the
 * detail pane — so every list is "select the row, look right, act". `ShellMenu` already
 * hand-rolled a menu for the account dropdown; this is that behaviour extracted, made
 * keyboard-complete, and given the ARIA the pattern requires.
 *
 * Closes on: Escape, a click outside, a chosen item, and — the one people forget — focus
 * leaving the menu entirely, which is how a Tab out of an open menu leaves an orphaned
 * popup floating over the page.
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

export interface MenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  /** Renders in the danger tone and is separated from the rest. */
  destructive?: boolean;
  disabled?: boolean;
  /** Why it is disabled — shown as a title, because a disabled control that says nothing is a dead end. */
  disabledReason?: string;
  onSelect: () => void;
}

export interface DropdownMenuProps {
  /** Accessible name — "Actions for Approve invoice INV-2291", not just "Actions". */
  label: string;
  items: MenuItem[];
  /** The trigger's content. Defaults to a vertical ellipsis. */
  trigger?: ReactNode;
  /** Right-aligns the panel against the trigger. Default for row menus at a table's edge. */
  align?: "start" | "end";
}

export function DropdownMenu({ label, items, trigger, align = "end" }: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const close = useCallback(
    (returnFocus: boolean) => {
      setOpen(false);
      setActiveIndex(-1);
      if (returnFocus) triggerRef.current?.focus();
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close(false);
    };
    // Focus leaving the menu closes it too — otherwise Tab strands an open popup.
    const onFocusIn = (event: FocusEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [open, close]);

  const enabled = items.filter((item) => !item.disabled);

  const step = (delta: number) => {
    if (enabled.length === 0) return;
    setActiveIndex((current) => {
      const currentEnabled = enabled.findIndex((item) => item.id === items[current]?.id);
      const next = enabled[(currentEnabled + delta + enabled.length) % enabled.length];
      return items.findIndex((item) => item.id === next.id);
    });
  };

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(items.indexOf(enabled[0]));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex(items.indexOf(enabled[enabled.length - 1]));
    }
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        close(true);
        break;
      case "ArrowDown":
        event.preventDefault();
        step(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        step(-1);
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(items.indexOf(enabled[0]));
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(items.indexOf(enabled[enabled.length - 1]));
        break;
      case "Enter":
      case " ": {
        event.preventDefault();
        const item = items[activeIndex];
        if (item && !item.disabled) {
          close(true);
          item.onSelect();
        }
        break;
      }
      default:
        break;
    }
  };

  return (
    <div className="tf-menu-root" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="tf-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={label}
        onClick={() => (open ? close(false) : setOpen(true))}
        onKeyDown={onTriggerKeyDown}
      >
        {trigger ?? <span aria-hidden="true">⋯</span>}
      </button>

      {open ? (
        <div
          id={menuId}
          className={`tf-menu-panel tf-menu-panel--${align}`}
          role="menu"
          aria-label={label}
          tabIndex={-1}
          onKeyDown={onMenuKeyDown}
          ref={(node) => node?.focus()}
        >
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className={[
                "tf-menu-panel__item",
                item.destructive ? "tf-menu-panel__item--destructive" : "",
                index === activeIndex ? "tf-menu-panel__item--active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              disabled={item.disabled}
              title={item.disabled ? item.disabledReason : undefined}
              tabIndex={-1}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => {
                close(true);
                item.onSelect();
              }}
            >
              {item.icon ? <span className="tf-menu-panel__icon">{item.icon}</span> : null}
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
