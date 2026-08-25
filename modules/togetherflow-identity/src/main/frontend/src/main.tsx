import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider, TenantProvider, readRuntimeConfig } from "@togetherflow/common";
import "@togetherflow/common/theme.css";
import "./styles/identity.css";
import { IdentityApp } from "./App";

const root = createRoot(document.getElementById("root")!);

try {
  const config = readRuntimeConfig();
  root.render(
    <StrictMode>
      {/* Sign-in verification still goes through the process API, which is where
          the credential check lives; IDM is only used for identity data. */}
      <AuthProvider baseUrl={config.apiBase} mode={config.auth.mode} oidc={config.auth.oidc}>
        <TenantProvider>
          <IdentityApp idmBase={config.idmBase} readOnly={config.identity.readOnly} />
        </TenantProvider>
      </AuthProvider>
    </StrictMode>,
  );
} catch (error) {
  console.error(error);
  root.render(
    <main className="tf-login">
      <div className="tf-login__card" role="alert">
        <h1 className="tf-login__title">Configuration error</h1>
        <p className="tf-login__subtitle">
          {error instanceof Error ? error.message : "TogetherFlow Identity could not start."}
        </p>
      </div>
    </main>,
  );
}
