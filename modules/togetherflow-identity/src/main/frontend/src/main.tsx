import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppRoot, readRuntimeConfig } from "@togetherflow/common";
import "@togetherflow/common/theme.css";
import "./styles/identity.css";
import { IdentityApp } from "./App";
import { identityMessages } from "./i18n/messages";

const root = createRoot(document.getElementById("root")!);

try {
  const config = readRuntimeConfig();
  root.render(
    <StrictMode>
      {/* Sign-in verification still goes through the process API, which is where
          the credential check lives; IDM is only used for identity data. */}
      <AppRoot app="identity" config={config} messages={identityMessages}>
        <IdentityApp
          apps={config.apps}
          apiBase={config.apiBase}
          idmBase={config.idmBase}
          readOnly={config.identity.readOnly}
        />
      </AppRoot>
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
