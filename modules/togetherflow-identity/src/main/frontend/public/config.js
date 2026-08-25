// Local development configuration only; the container overwrites this at startup.
window.__TOGETHERFLOW_CONFIG__ = {
  apiBase: "/process-api",
  idmBase: "/idm-api",
  auth: { mode: "basic" },
  identity: { readOnly: false },
};
