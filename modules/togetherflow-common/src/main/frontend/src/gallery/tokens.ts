/**
 * The design tokens the gallery documents (REQUIREMENTS.md §14.2: "Design tokens
 * (spacing scale, typography scale, color system, elevation) defined once and consumed
 * everywhere").
 *
 * Names only — the values are read from the live stylesheet at render time rather than
 * duplicated here. A token list that carries its own copy of the values drifts from the
 * CSS the moment either changes, and then documents something the product no longer does.
 */

export interface TokenGroup {
  title: string;
  description: string;
  /** How a value should be shown: as a colour chip, a length, or plain text. */
  render: "color" | "length" | "text";
  names: string[];
}

export const TOKEN_GROUPS: TokenGroup[] = [
  {
    title: "Brand",
    description:
      "Seeded from the logo, not invented independently of it (§14.2) — the wordmark's navy and teal, and the blue of the workflow glyph's task nodes.",
    render: "color",
    names: ["--tf-navy", "--tf-teal", "--tf-blue"],
  },
  {
    title: "Semantic",
    description:
      "The logo's own iconography already maps green=start, gold=decision, red=end; the UI reuses that mapping rather than picking an unrelated status set.",
    render: "color",
    names: [
      "--tf-success",
      "--tf-success-bg",
      "--tf-warning",
      "--tf-warning-bg",
      "--tf-danger",
      "--tf-danger-bg",
      "--tf-accent",
    ],
  },
  {
    title: "Surfaces and text",
    description:
      "Redefined under the dark palette rather than swapped per component. Use the theme control above to check both.",
    render: "color",
    names: [
      "--tf-bg",
      "--tf-bg-subtle",
      "--tf-bg-raised",
      "--tf-text",
      "--tf-text-muted",
      "--tf-border",
      "--tf-border-strong",
    ],
  },
  {
    title: "Spacing",
    description: "One scale, used for every gap and inset.",
    render: "length",
    names: ["--tf-space-1", "--tf-space-2", "--tf-space-3", "--tf-space-4", "--tf-space-5"],
  },
  {
    title: "Radius and elevation",
    description: "Corner radii and the two shadows the product uses.",
    render: "text",
    names: [
      "--tf-radius-sm",
      "--tf-radius",
      "--tf-radius-lg",
      "--tf-shadow",
      "--tf-shadow-lg",
      "--tf-focus-ring",
    ],
  },
  {
    title: "Typography",
    description: "The two families. Sizes are set per component from a small scale.",
    render: "text",
    names: ["--tf-font", "--tf-font-mono"],
  },
];

/** Reads a token's computed value from the document, or "" when it is not defined. */
export function readToken(name: string): string {
  if (typeof getComputedStyle === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
