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
import { Modal } from "./Modal";
import { TextInput } from "./Field";
import { useToast } from "./Toast";
import { ApiError } from "../api/client";
import { useTheme, type ThemePreference } from "../theme/useTheme";
import { useI18n } from "../i18n/I18nContext";
import type { AppLinks } from "../config";

const THEME_OPTIONS: ThemePreference[] = ["system", "light", "dark"];

const APP_KEYS: (keyof AppLinks)[] = ["work", "control", "identity", "design"];

/**
 * A language's own name, not its name in the current UI language: someone who has landed
 * in a language they don't read needs to recognise their own in the list.
 */
function nativeLanguageName(locale: string): string {
  try {
    return (
      new Intl.DisplayNames([locale], { type: "language" }).of(locale) ?? locale
    );
  } catch {
    return locale;
  }
}

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
  const { t, locale, setLocale, locales } = useI18n();

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

  const others = APP_KEYS.filter((key) => key !== currentApp)
    .map((key) => ({ key, label: t(`shell.app.${key}`), href: apps?.[key] }))
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
        <span className="tf-visually-hidden">{t("shell.menu.accountFor", { userId })}</span>
      </button>

      {open ? (
        <div className="tf-menu" role="menu">
          <p className="tf-menu__user">
            {t("shell.menu.signedInAs")} <strong>{userId}</strong>
            {tenantId ? (
              <span className="tf-menu__tenant">{t("shell.menu.tenant", { tenantId })}</span>
            ) : null}
          </p>

          {/*
            Only rendered when the deployment says where the other apps live. They are
            separately deployed origins, so there is nothing sensible to guess — and an
            always-disabled "coming soon" list would be untrue now that they all exist.
          */}
          {others.length > 0 ? (
            <div className="tf-menu__section">
              <p className="tf-menu__label">{t("shell.menu.otherApps")}</p>
              {others.map((app) => (
                <a key={app.key} className="tf-menu__item" role="menuitem" href={app.href}>
                  {t("shell.menu.appName", { app: app.label })}
                </a>
              ))}
            </div>
          ) : null}

          <div className="tf-menu__section">
            <p className="tf-menu__label" id="tf-theme-label">
              {t("shell.menu.appearance")}
            </p>
            <div className="tf-theme-choice" role="radiogroup" aria-labelledby="tf-theme-label">
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={theme === option}
                  className={["tf-theme-choice__item", theme === option ? "is-selected" : ""]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setTheme(option)}
                >
                  {t(`shell.menu.theme.${option}`)}
                </button>
              ))}
            </div>
          </div>

          {/*
            Only offered where the deployment actually ships more than one catalogue —
            a picker with a single entry is noise.
          */}
          {locales.length > 1 ? (
            <div className="tf-menu__section">
              <p className="tf-menu__label" id="tf-locale-label">
                {t("shell.menu.language")}
              </p>
              <select
                className="tf-input tf-select"
                aria-labelledby="tf-locale-label"
                value={locale}
                onChange={(event) => setLocale(event.target.value)}
              >
                {locales.map((option) => (
                  <option key={option} value={option}>
                    {nativeLanguageName(option)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

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
              {t("shell.menu.changePassword")}
            </button>
          ) : null}

          <button type="button" className="tf-menu__item" role="menuitem" onClick={onSignOut}>
            {t("shell.menu.signOut")}
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
  const { t } = useI18n();
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
      push({ tone: "success", message: t("password.changed") });
      onClose();
    } catch (cause) {
      const apiError = cause instanceof ApiError ? cause : undefined;
      push({
        tone: "error",
        message: apiError?.message ?? t("password.failed"),
        reference: apiError?.correlationId,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      size="sm"
      title={t("password.title")}
      description={t("password.description", { userId })}
      // Typed-in credentials: a stray backdrop click must not discard them.
      dismissOnBackdrop={false}
      onClose={onClose}
      actions={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            {t("dialog.cancel")}
          </Button>
          <Button loading={busy} disabled={!canSubmit} onClick={() => void submit()}>
            {t("password.title")}
          </Button>
        </>
      }
    >
        <TextInput
          label={t("password.new")}
          type="password"
          autoComplete="new-password"
          value={password}
          disabled={busy}
          error={tooShort ? t("password.tooShort", { min: MIN_PASSWORD_LENGTH }) : undefined}
          onChange={(event) => setPassword(event.target.value)}
        />
        <TextInput
          label={t("password.confirm")}
          type="password"
          autoComplete="new-password"
          value={confirmation}
          disabled={busy}
          error={mismatch ? t("password.mismatch") : undefined}
          onChange={(event) => setConfirmation(event.target.value)}
        />

    </Modal>
  );
}
