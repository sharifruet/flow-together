import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider, TenantProvider, readRuntimeConfig } from "@togetherflow/common";
import "@togetherflow/common/theme.css";
import "./styles/work.css";
import { WorkApp } from "./App";

const root = createRoot(document.getElementById("root")!);

try {
  const config = readRuntimeConfig();
  root.render(
    <StrictMode>
      <AuthProvider
        baseUrl={config.apiBase}
        mode={config.auth.mode}
        oidc={config.auth.oidc}
      >
        <TenantProvider>
          <WorkApp baseUrl={config.apiBase} />
        </TenantProvider>
      </AuthProvider>
    </StrictMode>,
  );
} catch (error) {
  // A misconfigured deployment must say so plainly rather than render a blank page.
  console.error(error);
  root.render(
    <main className="tf-login">
      <div className="tf-login__card" role="alert">
        <h1 className="tf-login__title">Configuration error</h1>
        <p className="tf-login__subtitle">
          {error instanceof Error ? error.message : "TogetherFlow could not start."}
        </p>
      </div>
    </main>,
  );
}
