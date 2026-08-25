/**
 * TogetherFlow brand mark (REQUIREMENTS.md §7.5).
 *
 * Drawn as inline SVG rather than referencing logo.png so it stays crisp at every size
 * and inherits theme colors — §7.5 flags getting a proper vector source from the brand
 * owner; this is a faithful reconstruction of the logo's icon (a workflow glyph inside a
 * cloud, over three people) built from the palette extracted in §14.2 until that lands.
 */

export interface BrandProps {
  /** "full" shows the wordmark; "mark" is icon-only for tight spaces like a favicon slot. */
  variant?: "full" | "mark";
  size?: number;
  className?: string;
}

export function Brand({ variant = "full", size = 28, className }: BrandProps) {
  return (
    <span
      className={["tf-brand", className].filter(Boolean).join(" ")}
      data-testid="togetherflow-brand"
    >
      <BrandMark size={size} />
      {variant === "full" ? (
        <span className="tf-brand__wordmark">
          <span className="tf-brand__together">Together</span>
          <span className="tf-brand__flow">Flow</span>
        </span>
      ) : null}
      <span className="tf-visually-hidden">TogetherFlow</span>
    </span>
  );
}

function BrandMark({ size }: { size: number }) {
  return (
    <svg
      className="tf-brand__mark"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M16 42c-6 0-10-4.2-10-9.6 0-4.9 3.4-8.9 8-9.5C15.2 16.3 21 11 28 11c6.5 0 12 4.5 13.6 10.6.9-.3 1.9-.5 2.9-.5 5.2 0 9.5 4.3 9.5 9.6S49.7 42 44.5 42"
        fill="none"
        stroke="var(--tf-teal)"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <circle cx="19" cy="30" r="3" fill="var(--tf-success)" />
      <rect x="26" y="26" width="9" height="8" rx="1.6" fill="var(--tf-blue)" />
      <path d="M39.5 30l3.2-3.2 3.2 3.2-3.2 3.2z" fill="var(--tf-warning)" />
      <g fill="var(--tf-brand-figure)">
        <circle cx="22" cy="48" r="3.4" />
        <path d="M16.4 58c0-3.1 2.5-5.6 5.6-5.6s5.6 2.5 5.6 5.6z" />
        <circle cx="32" cy="46.5" r="3.8" />
        <path d="M25.8 58c0-3.4 2.8-6.2 6.2-6.2s6.2 2.8 6.2 6.2z" />
        <circle cx="42" cy="48" r="3.4" />
        <path d="M36.4 58c0-3.1 2.5-5.6 5.6-5.6s5.6 2.5 5.6 5.6z" />
      </g>
    </svg>
  );
}
