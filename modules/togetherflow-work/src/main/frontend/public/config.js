// Local development configuration only. The container image overwrites this file at
// startup from environment variables; production always runs with auth.mode "oidc".
window.__TOGETHERFLOW_CONFIG__ = {
  apiBase: "/process-api",
  cmmnBase: "/cmmn-api",
  // Sibling app URLs for the switcher. Unset entries are simply not offered.
  apps: {
    work: "http://localhost:5273",
    control: "http://localhost:5275",
    identity: "http://localhost:5274",
    design: "http://localhost:5276",
  },
  // Empty = the default `db` provider: bytes go straight to Flowable (§7.6).
  attachmentGateway: "",
  auth: { mode: "basic" },
};
