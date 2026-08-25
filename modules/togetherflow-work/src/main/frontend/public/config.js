// Local development configuration only. The container image overwrites this file at
// startup from environment variables; production always runs with auth.mode "oidc".
window.__TOGETHERFLOW_CONFIG__ = {
  apiBase: "/process-api",
  cmmnBase: "/cmmn-api",
  auth: { mode: "basic" },
};
