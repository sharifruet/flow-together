/**
 * The icon set (UI_POLISH_BACKLOG.md C4).
 *
 * C4's finding: two `<svg>` elements existed in the entire frontend — `Brand.tsx` and
 * `CmmnCanvas.tsx` — and `EmptyState`'s `icon` prop had no caller anywhere.
 *
 * Drawn in-house rather than adopting a set, for the reason C4 itself flags: "watch the
 * bundle budget — the axe-core incident is the precedent". An icon library is a
 * dependency whose weight is decided by its tree-shaking rather than by us, and licence
 * review is a real cost for something this small. These are ~40 paths on one 24×24 grid
 * with one stroke width, which is also what makes them look like a set.
 *
 * Every icon is presentational. An icon that carries meaning on its own — a button with
 * no visible label — takes a `label`, which renders as `role="img"` with a name; without
 * one it is `aria-hidden` and the surrounding text is the accessible name. Getting this
 * backwards is how a screen reader ends up reading "trash trash Delete".
 */

import type { SVGProps } from "react";

export type IconName =
  // Navigation
  | "inbox"
  | "cases"
  | "play"
  | "history"
  | "instances"
  | "definitions"
  | "jobs"
  | "deployments"
  | "events"
  | "system"
  | "users"
  | "groups"
  | "privileges"
  | "models"
  // Model kinds
  | "bpmn"
  | "dmn"
  | "cmmn"
  | "form"
  | "app"
  | "event"
  // Actions
  | "search"
  | "filter"
  | "add"
  | "edit"
  | "trash"
  | "download"
  | "upload"
  | "refresh"
  | "copy"
  | "more"
  | "close"
  | "check"
  | "save"
  | "settings"
  | "external"
  // State and direction
  | "chevron-down"
  | "chevron-right"
  | "chevron-left"
  | "chevron-up"
  | "sort-asc"
  | "sort-desc"
  | "sort"
  | "warning"
  | "error"
  | "info"
  | "success"
  | "clock"
  | "user"
  | "attachment"
  | "comment"
  | "menu";

/**
 * One 24×24 grid, `currentColor`, 1.75 stroke, round caps and joins. Kept as `d` strings
 * rather than components so the set is a single object the bundler can see through, and
 * so adding one is one line rather than a new file.
 */
const PATHS: Record<IconName, string> = {
  inbox: "M3 13h4l2 3h6l2-3h4M3 13l2.5-7.5A2 2 0 0 1 7.4 4h9.2a2 2 0 0 1 1.9 1.5L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Z",
  cases: "M4 7h16v13H4zM9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M4 12h16",
  play: "M8 5.5v13l10-6.5-10-6.5Z",
  history: "M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 4.5V10h5.5M12 8v4.5l3 2",
  instances: "M4 6h6v5H4zM14 6h6v5h-6zM9 17h6v4H9zM7 11v3h10v-3M12 14v3",
  definitions: "M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6",
  jobs: "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3",
  deployments: "M12 3 3 7.5v9L12 21l9-4.5v-9L12 3ZM3 7.5 12 12l9-4.5M12 12v9",
  events: "M13 2.5 4 13.5h6l-1 8 9-11h-6l1-8Z",
  system: "M4 5h16v11H4zM9 20h6M12 16v4",
  users: "M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20M9.5 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM21 20v-1.5a4 4 0 0 0-3-3.87M15.5 3.63a4 4 0 0 1 0 7.75",
  groups: "M7 20v-1.5a3.5 3.5 0 0 1 3.5-3.5h3a3.5 3.5 0 0 1 3.5 3.5V20M12 12.5a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5ZM3 19v-1a3 3 0 0 1 2.5-2.96M21 19v-1a3 3 0 0 0-2.5-2.96",
  privileges: "M12 3 5 6v5.5c0 4.2 2.9 8.1 7 9.5 4.1-1.4 7-5.3 7-9.5V6l-7-3ZM9.5 12l1.9 1.9 3.6-3.9",
  models: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  bpmn: "M3 9.5h4.5v5H3zM16.5 9.5H21v5h-4.5zM10.5 12l1.5-2.5 1.5 2.5-1.5 2.5-1.5-2.5ZM7.5 12h3M13.5 12h3",
  dmn: "M4 5h16v14H4zM4 10h16M10 10v9M4 14.5h6",
  cmmn: "M4.5 6.5h15v11h-15zM4.5 6.5 12 3l7.5 3.5M9 12h6",
  form: "M5 3.5h14v17H5zM8.5 8h7M8.5 12h7M8.5 16h4",
  app: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM16.5 13.5v6M13.5 16.5h6",
  event: "M12 3.5a4 4 0 0 1 4 4v4l1.5 3h-11L8 11.5v-4a4 4 0 0 1 4-4ZM10 18.5a2 2 0 0 0 4 0",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM16 16l4.5 4.5",
  filter: "M3.5 5.5h17l-6.5 7.5v6l-4 2v-8L3.5 5.5Z",
  add: "M12 5v14M5 12h14",
  edit: "M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3ZM15 6l3 3",
  trash: "M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5 7.5 20h9l1-13.5M10 10v6.5M14 10v6.5",
  download: "M12 3.5v11M7.5 10.5 12 15l4.5-4.5M4.5 18.5v2h15v-2",
  upload: "M12 15.5v-11M7.5 8.5 12 4l4.5 4.5M4.5 18.5v2h15v-2",
  refresh: "M20 12a8 8 0 1 1-2.4-5.7M20 4v4.5h-4.5",
  copy: "M8.5 8.5h11v11h-11zM5.5 15.5h-1v-11h11v1",
  more: "M12 6.5v.01M12 12v.01M12 17.5v.01",
  close: "M6 6l12 12M18 6 6 18",
  check: "M5 12.5 9.5 17 19 7",
  save: "M5 4.5h11L19.5 8v11.5h-15zM8.5 4.5v5h7v-5M8 19.5v-6h8v6",
  settings: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.5 14h-.3a2 2 0 1 1 0-4h.2A1.6 1.6 0 0 0 4.5 7.2l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 3.5v-.3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.3 1Z",
  external: "M14 4.5h5.5V10M19.5 4.5 11 13M18 14v5.5h-13v-13H10",
  "chevron-down": "m6 9.5 6 6 6-6",
  "chevron-right": "m9.5 6 6 6-6 6",
  "chevron-left": "m14.5 6-6 6 6 6",
  "chevron-up": "m6 14.5 6-6 6 6",
  "sort-asc": "M8 19V5M8 5 4 9M8 5l4 4M13.5 7.5h7M13.5 12h5M13.5 16.5h3",
  "sort-desc": "M8 5v14M8 19l-4-4M8 19l4-4M13.5 7.5h3M13.5 12h5M13.5 16.5h7",
  sort: "M8 4.5v15M8 4.5 4.5 8M8 4.5 11.5 8M16 19.5v-15M16 19.5 12.5 16M16 19.5l3.5-3.5",
  warning: "M12 3.5 21 19H3l9-15.5ZM12 9.5v4.5M12 16.5v.01",
  error: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17ZM12 7.5V13M12 16v.01",
  info: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17ZM12 11v5.5M12 7.5v.01",
  success: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17ZM8 12.2l2.8 2.8L16 9.5",
  clock: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17ZM12 7v5.3l3.3 2",
  user: "M19 20v-1.5a4.5 4.5 0 0 0-4.5-4.5h-5A4.5 4.5 0 0 0 5 18.5V20M12 11a3.75 3.75 0 1 0 0-7.5A3.75 3.75 0 0 0 12 11Z",
  attachment: "M20 11.5 12.4 19a4.6 4.6 0 0 1-6.5-6.5l7.6-7.6a3 3 0 1 1 4.3 4.3l-7.6 7.6a1.5 1.5 0 0 1-2.1-2.1l7-7",
  comment: "M20.5 12.5a7.5 7.5 0 0 1-10.8 6.7L4 20.5l1.3-5.4A7.5 7.5 0 1 1 20.5 12.5Z",
  menu: "M4 7h16M4 12h16M4 17h16",
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  /** Pixel size; 20 suits body text, 16 a dense table cell, 24 a nav rail. */
  size?: number;
  /**
   * Set ONLY where the icon is the whole meaning — an icon-only button. When there is
   * visible text beside it, leave this off so it stays decorative.
   */
  label?: string;
}

export function Icon({ name, size = 20, label, className, ...rest }: IconProps) {
  return (
    <svg
      className={["tf-icon", className].filter(Boolean).join(" ")}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Names, for the gallery and for the coverage test that keeps the two in step. */
export const ICON_NAMES = Object.keys(PATHS) as IconName[];
