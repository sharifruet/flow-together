/**
 * Status as a badge rather than prose (UI_POLISH_BACKLOG.md C3).
 *
 * Before this, priority rendered as the bare words "High"/"Normal", and job state,
 * instance state, deployment state, definition suspended-state and validation severity
 * were each bare text or a one-off colour class. Nothing scanned.
 *
 * **Never colour alone** (WCAG 1.4.1). The word always stays; the tone is redundant
 * encoding, not the message. `tone` maps to the semantic scale already in the tokens, so
 * a badge and the icon beside it agree.
 */

import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

export interface BadgeProps {
  tone?: BadgeTone;
  /** Hollow rather than filled — for a dense table where filled badges would stripe the page. */
  subtle?: boolean;
  /** A leading dot, for a state that reads as live/stopped rather than as a label. */
  dot?: boolean;
  /**
   * Read out instead of the visible text where the word alone is ambiguous out of
   * context — "3" in a nav counter is meaningless without "3 dead-letter jobs".
   */
  srLabel?: string;
  children: ReactNode;
}

export function Badge({ tone = "neutral", subtle = false, dot = false, srLabel, children }: BadgeProps) {
  return (
    <span
      className={["tf-badge", `tf-badge--${tone}`, subtle ? "tf-badge--subtle" : ""]
        .filter(Boolean)
        .join(" ")}
    >
      {dot ? <span className="tf-badge__dot" aria-hidden="true" /> : null}
      {srLabel ? (
        <>
          <span className="tf-visually-hidden">{srLabel}</span>
          {/* Hidden, or the reader says "3 dead-letter jobs 3". */}
          <span aria-hidden="true">{children}</span>
        </>
      ) : (
        // No wrapper without srLabel: the badge element is the text's own container,
        // and an extra span only makes the markup harder to assert against.
        children
      )}
    </span>
  );
}

/**
 * Engine state → tone, in one place (C3 asks for "a documented mapping from engine state
 * → tone").
 *
 * Kept as data rather than a switch in each screen so Control and Work cannot disagree
 * about what colour a suspended definition is. Unknown states fall to neutral rather than
 * throwing: the engines gain states faster than this table does, and a grey badge is a
 * better failure than a crash.
 */
const STATE_TONES: Record<string, BadgeTone> = {
  // Runtime
  active: "success",
  running: "success",
  available: "info",
  enabled: "info",
  suspended: "warning",
  terminated: "danger",
  failed: "danger",
  completed: "neutral",
  closed: "neutral",
  disabled: "neutral",
  // Jobs
  timer: "info",
  deadletter: "danger",
  "dead-letter": "danger",
  suspendedjob: "warning",
  // Validation severity
  error: "danger",
  warning: "warning",
  info: "info",
};

export function toneForState(state: string | undefined | null): BadgeTone {
  if (!state) return "neutral";
  return STATE_TONES[state.toLowerCase().replace(/[\s_]+/g, "")] ?? STATE_TONES[state.toLowerCase()] ?? "neutral";
}

/**
 * Flowable priority is an unbounded int; the convention the engine's own tooling uses is
 * 0–100 with 50 as normal. Bands rather than the raw number, because "80" tells a user
 * nothing without the scale.
 */
export function toneForPriority(priority: number | undefined): BadgeTone {
  if (priority === undefined) return "neutral";
  if (priority >= 70) return "danger";
  if (priority >= 50) return "warning";
  return "neutral";
}
