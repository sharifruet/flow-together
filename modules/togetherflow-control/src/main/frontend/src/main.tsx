import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppRoot, readRuntimeConfig } from "@togetherflow/common";
import "@togetherflow/common/theme.css";
import "./styles/control.css";
import { ControlApp } from "./App";
import { controlMessages } from "./i18n/messages";

const root = createRoot(document.getElementById("root")!);

try {
  const config = readRuntimeConfig();
  root.render(
    <StrictMode>
      <AppRoot app="control" config={config} messages={controlMessages}>
        <ControlApp
          apps={config.apps}
          apiBase={config.apiBase}
          dmnBase={config.dmnBase}
          cmmnBase={config.cmmnBase}
          eventBase={config.eventBase}
          externalJobBase={config.externalJobBase}
          eventRecorderBase={config.eventRecorder}
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
          {error instanceof Error ? error.message : "TogetherFlow Control could not start."}
        </p>
      </div>
    </main>,
  );
}
