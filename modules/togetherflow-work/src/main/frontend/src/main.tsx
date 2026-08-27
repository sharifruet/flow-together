import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppRoot, readRuntimeConfig } from "@togetherflow/common";
import "@togetherflow/common/theme.css";
import "./styles/work.css";
import { WorkApp } from "./App";
import { workMessages } from "./i18n/messages";

const root = createRoot(document.getElementById("root")!);

try {
  const config = readRuntimeConfig();
  root.render(
    <StrictMode>
      <AppRoot app="work" config={config} messages={workMessages}>
        <WorkApp
          apps={config.apps}
          baseUrl={config.apiBase}
          cmmnBase={config.cmmnBase}
          idmBase={config.idmBase}
          attachmentGateway={config.attachmentGateway}
        />
      </AppRoot>
    </StrictMode>,
  );
} catch (error) {
  /*
   * A misconfigured deployment must say so plainly rather than render a blank page.
   * This copy is deliberately not translated: the failure here is that configuration
   * could not be read at all, so there is no locale to trust yet.
   */
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
