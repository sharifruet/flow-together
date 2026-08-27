/**
 * Empty-state illustrations (UI_POLISH_BACKLOG.md C4: "§14.2 also asks for empty-state
 * illustrations; there are none").
 *
 * Built from the brand glyph's own vocabulary — the rounded task rectangle, the diamond
 * gateway, the circular event — so an empty screen still reads as this product rather
 * than as stock art. Six of them, one per empty state the four apps actually reach.
 *
 * Flat SVG on a 160×120 grid using the theme tokens, so they follow dark mode without a
 * second asset. Decorative in every case: `EmptyState` renders a real heading and
 * description beside them, and an illustration that repeated it would be read twice.
 */

export type IllustrationName =
  /** Inbox with nothing in it — the good empty, not a failure. */
  | "inbox-clear"
  /** A filter matched nothing; the data exists, the query is wrong. */
  | "no-results"
  /** Nothing has been deployed to this engine yet. */
  | "nothing-deployed"
  /** The model library is empty — the first-run state of Design. */
  | "no-models"
  /** The server said no. Distinct from an error: nothing is broken. */
  | "permission-denied"
  /** Something failed. */
  | "error";

export interface EmptyIllustrationProps {
  name: IllustrationName;
  /** Width in px; height follows the 4:3 grid. */
  width?: number;
}

export function EmptyIllustration({ name, width = 160 }: EmptyIllustrationProps) {
  return (
    <svg
      className="tf-illustration"
      width={width}
      height={(width * 3) / 4}
      viewBox="0 0 160 120"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {FIGURES[name]}
    </svg>
  );
}

/* Shared parts, so the six read as one family rather than six drawings. */
const ground = (
  <ellipse cx="80" cy="103" rx="46" ry="5" className="tf-illustration__ground" />
);

const FIGURES: Record<IllustrationName, JSX.Element> = {
  "inbox-clear": (
    <>
      {ground}
      <path
        d="M38 56h18l6 9h16l6-9h18v34a6 6 0 0 1-6 6H44a6 6 0 0 1-6-6V56Z"
        className="tf-illustration__surface"
      />
      <path d="M38 56 48 32h64l10 24" className="tf-illustration__line" />
      {/* A tick where the pile of work would be. */}
      <path d="M68 74l8 8 16-17" className="tf-illustration__accent" />
    </>
  ),

  "no-results": (
    <>
      {ground}
      <circle cx="72" cy="52" r="24" className="tf-illustration__surface" />
      <circle cx="72" cy="52" r="24" className="tf-illustration__line" />
      <path d="M90 70l18 18" className="tf-illustration__line" />
      {/* Rows behind the lens, one of them struck through. */}
      <path d="M60 46h24M60 54h24M60 62h14" className="tf-illustration__muted" />
      <path d="M56 66l32-28" className="tf-illustration__accent" />
    </>
  ),

  "nothing-deployed": (
    <>
      {ground}
      <path d="M80 24 116 44v40L80 104 44 84V44l36-20Z" className="tf-illustration__surface" />
      <path d="M80 24 116 44v40L80 104 44 84V44l36-20ZM44 44l36 20 36-20M80 64v40" className="tf-illustration__line" />
      <path d="M80 46v14M80 68v2" className="tf-illustration__muted" />
    </>
  ),

  "no-models": (
    <>
      {ground}
      {/* start · task · end — the glyph's own grammar, drawn as an unfilled outline. */}
      <circle cx="36" cy="60" r="11" className="tf-illustration__line" />
      <rect x="62" y="46" width="40" height="28" rx="6" className="tf-illustration__surface" />
      <rect x="62" y="46" width="40" height="28" rx="6" className="tf-illustration__line" />
      <circle cx="128" cy="60" r="11" className="tf-illustration__line" />
      <path d="M47 60h15M102 60h15" className="tf-illustration__muted" />
      <path d="M82 54v12M76 60h12" className="tf-illustration__accent" />
    </>
  ),

  "permission-denied": (
    <>
      {ground}
      <path d="M80 22 50 34v24c0 18 12.5 34.5 30 40 17.5-5.5 30-22 30-40V34L80 22Z" className="tf-illustration__surface" />
      <path d="M80 22 50 34v24c0 18 12.5 34.5 30 40 17.5-5.5 30-22 30-40V34L80 22Z" className="tf-illustration__line" />
      <rect x="68" y="56" width="24" height="18" rx="3" className="tf-illustration__line" />
      <path d="M73 56v-6a7 7 0 0 1 14 0v6" className="tf-illustration__line" />
    </>
  ),

  error: (
    <>
      {ground}
      <path d="M80 26 118 92H42L80 26Z" className="tf-illustration__surface" />
      <path d="M80 26 118 92H42L80 26Z" className="tf-illustration__danger" />
      <path d="M80 52v20M80 80v1" className="tf-illustration__danger" />
    </>
  ),
};
