// Local development configuration only; the container overwrites this at startup.
window.__TOGETHERFLOW_CONFIG__ = {
  apiBase: "/process-api",
  idmBase: "/idm-api",
  dmnBase: "/dmn-api",
  cmmnBase: "/cmmn-api",
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
