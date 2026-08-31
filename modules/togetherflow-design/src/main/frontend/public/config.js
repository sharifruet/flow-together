// Local development configuration only; the container overwrites this at startup.
window.__TOGETHERFLOW_CONFIG__ = {
  apiBase: "/process-api",
  /*
   * Workspaces (ADR 0017) are off by default here, matching every deployment that does
   * not run the service: one flat model library, no switcher. Uncomment to develop
   * against a local `togetherflow-workspace` on :8092 — the dev proxy already routes
   * `/workspace-api` there.
   */
  // workspaceBase: "/workspace-api",
  idmBase: "/idm-api",
  dmnBase: "/dmn-api",
  cmmnBase: "/cmmn-api",
  appBase: "/app-api",
  eventBase: "/event-registry-api",
  externalJobBase: "/external-job-api",
  // Sibling app URLs for the switcher. Unset entries are simply not offered.
  apps: {
    work: "http://localhost:5273",
    control: "http://localhost:5275",
    identity: "http://localhost:5274",
    design: "http://localhost:5276",
  },
  auth: { mode: "basic" },
};
