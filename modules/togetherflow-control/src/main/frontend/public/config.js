// Local development configuration only; the container overwrites this at startup.
window.__TOGETHERFLOW_CONFIG__ = {
  apiBase: "/process-api",
  idmBase: "/idm-api",
  dmnBase: "/dmn-api",
  cmmnBase: "/cmmn-api",
  eventBase: "/event-registry-api",
  externalJobBase: "/external-job-api",
  auth: { mode: "basic" },
};
