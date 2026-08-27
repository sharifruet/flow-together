/**
 * Tabs (UI_POLISH_BACKLOG.md F2; W2.2 needs them for Work's task detail).
 *
 * Implements the WAI-ARIA tabs pattern properly, which is the reason for a component
 * rather than a row of buttons: arrow keys move between tabs, Home/End jump to the ends,
 * and only the selected tab is in the tab order — so Tab moves from the tab list into the
 * panel rather than through every tab first.
 *
 * Manual activation, not automatic: arrow keys move focus, and Enter/Space selects. With
 * automatic activation each arrow press would mount a panel, which for these tabs means a
 * fetch — arrowing from the first tab to the fourth would fire three requests nobody
 * asked for.
 */

import { useCallback, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Badge } from "./Badge";

export interface TabDefinition<Id extends string> {
  id: Id;
  label: string;
  /** A count beside the label — "Subtasks 3". */
  count?: number;
  disabled?: boolean;
}

export interface TabsProps<Id extends string> {
  /** Accessible name for the tab list, e.g. "Task sections". */
  label: string;
  tabs: TabDefinition<Id>[];
  active: Id;
  onChange: (id: Id) => void;
  /** The active tab's panel. Rendered inside the `tabpanel`, so callers do not repeat it. */
  children: ReactNode;
}

export function Tabs<Id extends string>({ label, tabs, active, onChange, children }: TabsProps<Id>) {
  const baseId = useId();
  const listRef = useRef<HTMLDivElement>(null);

  const move = useCallback(
    (from: number, delta: number) => {
      const enabled = tabs.map((tab, index) => ({ tab, index })).filter(({ tab }) => !tab.disabled);
      if (enabled.length === 0) return;
      const current = enabled.findIndex(({ index }) => index === from);
      const next = enabled[(current + delta + enabled.length) % enabled.length];
      listRef.current
        ?.querySelector<HTMLButtonElement>(`#${CSS.escape(`${baseId}-tab-${next.tab.id}`)}`)
        ?.focus();
    },
    [tabs, baseId],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLElement>, index: number) => {
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        move(index, 1);
        break;
      case "ArrowLeft":
        event.preventDefault();
        move(index, -1);
        break;
      case "Home":
        event.preventDefault();
        move(-1, 1);
        break;
      case "End":
        event.preventDefault();
        move(tabs.length, -1);
        break;
      default:
        break;
    }
  };

  return (
    <div className="tf-tabs">
      <div className="tf-tabs__list" role="tablist" aria-label={label} ref={listRef}>
        {tabs.map((tab, index) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              id={`${baseId}-tab-${tab.id}`}
              role="tab"
              className={`tf-tabs__tab${selected ? " tf-tabs__tab--active" : ""}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              // Only the selected tab is a tab stop — that is what lets Tab reach the panel.
              tabIndex={selected ? 0 : -1}
              disabled={tab.disabled}
              onClick={() => onChange(tab.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              {tab.label}
              {tab.count !== undefined ? (
                <Badge tone={selected ? "info" : "neutral"} subtle>
                  {tab.count}
                </Badge>
              ) : null}
            </button>
          );
        })}
      </div>
      <div
        className="tf-tabs__panel"
        id={`${baseId}-panel-${active}`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${active}`}
        tabIndex={0}
      >
        {children}
      </div>
    </div>
  );
}
