/**
 * The shell's account menu (REQUIREMENTS.md §7.5): who you are, where else you can go,
 * how the app looks, and how to sign out.
 *
 * Shared by all four apps so the switcher, the theme control and password change cannot
 * drift apart between them — §7.5 requires exactly that ("apply this once, so no
 * individual app can drift from it").
 */

import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { TextInput } from "./Field";
import { useToast } from "./Toast";
import { ApiError } from "../api/client";
import { useTheme, type ThemePreference } from "../theme/useTheme";
import type { AppLinks } from "../config";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "Match system" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const APP_LABELS: Record<keyof AppLinks, string> = {
  work: "Work",
  control: "Control",
  identity: "Identity",
  design: "Design",
};

export interface ShellMenuProps {
  userId: string;
  /** Which app this is, so it isn't offered as somewhere else to go. */
  currentApp: keyof AppLinks;
  /** URLs of the other apps, from runtime configuration. */
  apps?: AppLinks;
  tenantId?: string;
  onSignOut: () => void;
  /**
   * Changes the signed-in user's password. Omitted where the deployment's identities
   * are read-only (a directory-backed IDM), in which case no control is shown.
   */
  onChangePassword?: (newPassword: string) => Promise<void>;
}

export function ShellMenu({
  userId,
  currentApp,
  apps,
  tenantId,
  onSignOut,
  onChangePassword,
}: ShellMenuProps) {
  const [open, setOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const others = (Object.keys(APP_LABELS) as (keyof AppLinks)[])
    .filter((key) => key !== currentApp)
    .map((key) => ({ key, label: APP_LABELS[key], href: apps?.[key] }))
    .filter((entry): entry is { key: keyof AppLinks; label: string; href: string } =>
      Boolean(entry.href),
    );

  return (
    <div className="tf-shell__menu" ref={menuRef}>
      <button
        type="button"
        className="tf-shell__avatar"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">{(userId || "?").slice(0, 2).toUpperCase()}</span>
        <span className="tf-visually-hidden">Account menu for {userId}</span>
      </button>

      {open ? (
        <div className="tf-menu" role="menu">
          <p className="tf-menu__user">
            Signed in as <strong>{userId}</strong>
            {tenantId ? <span className="tf-menu__tenant">Tenant: {tenantId}</span> : null}
          </p>

          {/*
            Only rendered when the deployment says where the other apps live. They are
            separately deployed origins, so there is nothing sensible to guess — and an
            always-disabled "coming soon" list would be untrue now that they all exist.
          */}
          {others.length > 0 ? (
            <div className="tf-menu__section">
              <p className="tf-menu__label">Other apps</p>
              {others.map((app) => (
                <a key={app.key} className="tf-menu__item" role="menuitem" href={app.href}>
                  TogetherFlow {app.label}
                </a>
              ))}
            </div>
          ) : null}

          <div className="tf-menu__section">
            <p className="tf-menu__label" id="tf-theme-label">
              Appearance
            </p>
            <div className="tf-theme-choice" role="radiogroup" aria-labelledby="tf-theme-label">
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={theme === option.value}
                  className={[
                    "tf-theme-choice__item",
                    theme === option.value ? "is-selected" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setTheme(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {onChangePassword ? (
            <button
              type="button"
              className="tf-menu__item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setChanging(true);
              }}
            >
              Change password
            </button>
          ) : null}

          <button type="button" className="tf-menu__item" role="menuitem" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      ) : null}

      {changing && onChangePassword ? (
        <ChangePasswordDialog
          userId={userId}
          onChangePassword={onChangePassword}
          onClose={() => setChanging(false)}
        />
      ) : null}
    </div>
  );
}

/** Minimum length matched to what an operator would expect of a self-service change. */
const MIN_PASSWORD_LENGTH = 8;

function ChangePasswordDialog({
  userId,
  onChangePassword,
  onClose,
}: {
  userId: string;
  onChangePassword: (newPassword: string) => Promise<void>;
  onClose: () => void;
}) {
  const { push } = useToast();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const mismatch = confirmation.length > 0 && confirmation !== password;
  const canSubmit = password.length >= MIN_PASSWORD_LENGTH && confirmation === password && !busy;

  const submit = async () => {
    setBusy(true);
    try {
      await onChangePassword(password);
      push({ tone: "success", message: "Password changed." });
      onClose();
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : undefined;
      push({
        tone: "error",
        message: apiError?.message ?? "Could not change your password.",
        reference: apiError?.correlationId,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tf-dialog-backdrop" onMouseDown={onClose}>
      <div
        className="tf-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Change password"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 className="tf-dialog__title">Change password</h2>
        <p className="tf-dialog__description">
          Sets a new password for <strong>{userId}</strong>. You'll use it the next time you
          sign in — this session stays signed in.
        </p>

        <TextInput
          label="New password"
          type="password"
          autoComplete="new-password"
          value={password}
          disabled={busy}
          error={tooShort ? `Use at least ${MIN_PASSWORD_LENGTH} characters.` : undefined}
          onChange={(event) => setPassword(event.target.value)}
        />
        <TextInput
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          value={confirmation}
          disabled={busy}
          error={mismatch ? "The two passwords don't match." : undefined}
          onChange={(event) => setConfirmation(event.target.value)}
        />

        <div className="tf-dialog__actions">
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} disabled={!canSubmit} onClick={() => void submit()}>
            Change password
          </Button>
        </div>
      </div>
    </div>
  );
}
