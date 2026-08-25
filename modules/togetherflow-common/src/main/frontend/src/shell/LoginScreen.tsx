/**
 * The sign-in screen, shared by all four apps (REQUIREMENTS.md §7.5).
 *
 * It lived as a byte-identical copy in each app before this, which is precisely what
 * §14.2 rules out ("not just a grab-bag of one-off components copied between apps") and
 * §7.5 forbids for branding specifically ("apply this once, so no individual app can
 * drift from it"). Only the subtitle differs per app, and that is a message key.
 */

import { useState, type FormEvent } from "react";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Brand } from "../components/Brand";
import { Button } from "../components/Button";
import { TextInput } from "../components/Field";
import { useT } from "../i18n/I18nContext";
import type { AppLinks } from "../config";

export interface LoginScreenProps {
  /** Which app this is — decides the subtitle only. */
  app: keyof AppLinks;
}

export function LoginScreen({ app }: LoginScreenProps) {
  const t = useT();
  const { signIn, isSigningIn, mode } = useAuth();
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    setError(undefined);
    if (mode === "basic" && (!userId.trim() || !password)) {
      setError(t("login.missingCredentials"));
      return;
    }
    try {
      await signIn(userId.trim(), password);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : t("login.failed"));
    }
  }

  return (
    <main className="tf-login">
      <form className="tf-login__card" onSubmit={submit} noValidate>
        <div className="tf-login__brand">
          <Brand size={40} />
        </div>
        <h1 className="tf-login__title">{t("login.title")}</h1>
        <p className="tf-login__subtitle">{t(`login.subtitle.${app}`)}</p>

        {error ? (
          <div className="tf-login__error" role="alert">
            {error}
          </div>
        ) : null}

        {mode === "oidc" ? (
          <>
            <p className="tf-login__sso">{t("login.sso.note")}</p>
            <Button type="submit" loading={isSigningIn} className="tf-login__submit">
              {isSigningIn ? t("login.sso.redirecting") : t("login.sso.submit")}
            </Button>
          </>
        ) : (
          <>
            <TextInput
              label={t("login.username")}
              value={userId}
              autoComplete="username"
              autoFocus
              required
              onChange={(event) => setUserId(event.target.value)}
            />
            <TextInput
              label={t("login.password")}
              type="password"
              value={password}
              autoComplete="current-password"
              required
              onChange={(event) => setPassword(event.target.value)}
            />
            <Button type="submit" loading={isSigningIn} className="tf-login__submit">
              {isSigningIn ? t("login.signingIn") : t("login.submit")}
            </Button>
            <p className="tf-login__mode-note">{t("login.devNote")}</p>
          </>
        )}
      </form>
    </main>
  );
}
