import { useState, type FormEvent } from "react";
import { ApiError, Brand, Button, TextInput, useAuth } from "@togetherflow/common";

export function LoginScreen() {
  const { signIn, isSigningIn, mode } = useAuth();
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    setError(undefined);
    if (mode === "basic" && (!userId.trim() || !password)) {
      setError("Enter both your username and password.");
      return;
    }
    try {
      await signIn(userId.trim(), password);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not sign in. Please try again.");
    }
  }

  return (
    <main className="tf-login">
      <form className="tf-login__card" onSubmit={submit} noValidate>
        <div className="tf-login__brand">
          <Brand size={40} />
        </div>
        <h1 className="tf-login__title">Sign in</h1>
        <p className="tf-login__subtitle">Access your tasks, cases and work items.</p>

        {error ? (
          <div className="tf-login__error" role="alert">
            {error}
          </div>
        ) : null}

        {mode === "oidc" ? (
          <>
            <p className="tf-login__sso">
              You'll be redirected to your organisation's sign-in page.
            </p>
            <Button type="submit" loading={isSigningIn} className="tf-login__submit">
              {isSigningIn ? "Redirecting…" : "Continue to sign in"}
            </Button>
          </>
        ) : (
          <>
            <TextInput
              label="Username"
              value={userId}
              autoComplete="username"
              autoFocus
              required
              onChange={(event) => setUserId(event.target.value)}
            />
            <TextInput
              label="Password"
              type="password"
              value={password}
              autoComplete="current-password"
              required
              onChange={(event) => setPassword(event.target.value)}
            />
            <Button type="submit" loading={isSigningIn} className="tf-login__submit">
              {isSigningIn ? "Signing in…" : "Sign in"}
            </Button>
            <p className="tf-login__mode-note">
              Development sign-in. Production deployments use single sign-on.
            </p>
          </>
        )}
      </form>
    </main>
  );
}
