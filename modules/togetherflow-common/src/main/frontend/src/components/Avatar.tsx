/**
 * A person, shown as a person (UI_POLISH_BACKLOG.md D1, F2).
 *
 * D1's finding: every screen renders the raw engine id — `alice` — with no display name
 * and no picture, in a product whose whole subject is who is doing what. This is the
 * primitive that fixes it; W2.2 wires the lookup behind it and replaces the ids.
 *
 * Initials are derived, never stored: the engine has `firstName`/`lastName`/`id` and no
 * avatar concept beyond the optional picture on the process API.
 */

export type AvatarSize = "sm" | "md" | "lg";

export interface AvatarProps {
  /** The engine's user id. Used for the colour and as the last-resort label. */
  userId: string;
  /** Display name where one is known — "Alice Brown". Falls back to the id. */
  name?: string;
  /** Absolute or API-relative URL of the picture, where the deployment stores one. */
  pictureUrl?: string;
  size?: AvatarSize;
}

/**
 * A stable colour per user, so the same person is the same colour on every screen and in
 * every session. Hashed from the id rather than assigned, because there is nowhere to
 * store an assignment and a per-render random would flicker.
 *
 * Six hues, all with enough contrast against white text at the tokens' text weight.
 */
const HUES = [210, 150, 275, 20, 340, 190];

function hueFor(userId: string): number {
  let hash = 0;
  for (let index = 0; index < userId.length; index++) {
    hash = (hash * 31 + userId.charCodeAt(index)) | 0;
  }
  return HUES[Math.abs(hash) % HUES.length];
}

export function initialsFor(name: string): string {
  const parts = name.trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function Avatar({ userId, name, pictureUrl, size = "md" }: AvatarProps) {
  const label = name?.trim() || userId;

  if (pictureUrl) {
    return (
      <img
        className={`tf-avatar tf-avatar--${size}`}
        src={pictureUrl}
        alt=""
        // Decorative: the name is always rendered beside it by UserChip, and an alt of
        // the name would have a screen reader read the person twice.
        aria-hidden="true"
      />
    );
  }

  return (
    <span
      className={`tf-avatar tf-avatar--${size} tf-avatar--initials`}
      style={{ backgroundColor: `hsl(${hueFor(userId)} 42% 38%)` }}
      aria-hidden="true"
    >
      {initialsFor(label)}
    </span>
  );
}

export interface UserChipProps extends AvatarProps {
  /** Renders the avatar alone, with the name only for assistive tech. */
  compact?: boolean;
  /** Shown under the name — a role, a group, "unassigned". */
  secondary?: string;
}

/**
 * Avatar plus name, which is what screens should render wherever they render a user id.
 */
export function UserChip({ userId, name, pictureUrl, size = "sm", compact = false, secondary }: UserChipProps) {
  const label = name?.trim() || userId;
  return (
    <span className="tf-user-chip" title={name ? `${name} (${userId})` : userId}>
      <Avatar userId={userId} name={name} pictureUrl={pictureUrl} size={size} />
      {compact ? (
        <span className="tf-visually-hidden">{label}</span>
      ) : (
        <span className="tf-user-chip__text">
          <span className="tf-user-chip__name">{label}</span>
          {secondary ? <span className="tf-user-chip__secondary">{secondary}</span> : null}
        </span>
      )}
    </span>
  );
}
