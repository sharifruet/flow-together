#!/bin/sh
# Writes runtime configuration read by the SPA at startup. Runs via nginx's
# docker-entrypoint.d hook before the server starts.
set -eu

: "${TF_API_BASE:=/process-api}"
: "${TF_IDM_BASE:=/idm-api}"
: "${TF_DMN_BASE:=/dmn-api}"
# Design deploys case models, publishes apps and deploys events, each on its own servlet.
: "${TF_CMMN_BASE:=/cmmn-api}"
: "${TF_APP_BASE:=/app-api}"
: "${TF_EVENT_BASE:=/event-registry-api}"
: "${TF_EXTERNAL_JOB_BASE:=/external-job-api}"
: "${TF_IDENTITY_READ_ONLY:=false}"
: "${TF_AUTH_MODE:=oidc}"
: "${TF_OIDC_AUTHORITY:=}"
: "${TF_OIDC_CLIENT_ID:=}"
: "${TF_OIDC_SCOPE:=openid profile email}"
# Sibling app URLs for the shell switcher (§7.5). Unset apps are not offered.
: "${TF_APP_WORK:=}"
: "${TF_APP_CONTROL:=}"
: "${TF_APP_IDENTITY:=}"
: "${TF_APP_DESIGN:=}"

# Frontend error tracking (§13.2). Unset means console-only — a fresh install needs
# no error-tracking infrastructure to work.
: "${TF_ERROR_ENDPOINT:=}"
: "${TF_RELEASE:=}"
# Forces a UI language for the whole deployment (§8). Unset lets the browser, and the
# user's own choice in the shell menu, decide.
: "${TF_LOCALE:=}"

# Base URL of togetherflow-workspace (ADR 0017). Empty — the default — means the service
# is not deployed: Design shows one flat model library and no workspace switcher, which
# is what every deployment had before it existed. An absent service and an empty
# workspace list are different states, so this is not inferred from a failed call.
: "${TF_WORKSPACE_BASE:=}"

if [ "$TF_AUTH_MODE" = "oidc" ] && { [ -z "$TF_OIDC_AUTHORITY" ] || [ -z "$TF_OIDC_CLIENT_ID" ]; }; then
  echo "FATAL: TF_AUTH_MODE=oidc requires TF_OIDC_AUTHORITY and TF_OIDC_CLIENT_ID." >&2
  echo "Set them, or set TF_AUTH_MODE=basic for local development only." >&2
  exit 1
fi

# Written outside the docroot so the container can run with a read-only root
# filesystem; nginx serves it at /config.js via an alias.
mkdir -p /tmp/togetherflow
cat > /tmp/togetherflow/config.js <<JS
window.__TOGETHERFLOW_CONFIG__ = {
  apiBase: "${TF_API_BASE}",
  idmBase: "${TF_IDM_BASE}",
  dmnBase: "${TF_DMN_BASE}",
  cmmnBase: "${TF_CMMN_BASE}",
  appBase: "${TF_APP_BASE}",
  eventBase: "${TF_EVENT_BASE}",
  externalJobBase: "${TF_EXTERNAL_JOB_BASE}",
  workspaceBase: "${TF_WORKSPACE_BASE}",
  identity: { readOnly: ${TF_IDENTITY_READ_ONLY} },
  apps: {
    work: "${TF_APP_WORK}",
    control: "${TF_APP_CONTROL}",
    identity: "${TF_APP_IDENTITY}",
    design: "${TF_APP_DESIGN}",
  },
  observability: {
    errorEndpoint: "${TF_ERROR_ENDPOINT}",
    release: "${TF_RELEASE}"
  },
  locale: "${TF_LOCALE}",
  auth: {
    mode: "${TF_AUTH_MODE}",
    authority: "${TF_OIDC_AUTHORITY}",
    clientId: "${TF_OIDC_CLIENT_ID}",
    scope: "${TF_OIDC_SCOPE}"
  }
};
JS

echo "TogetherFlow Design: apiBase=${TF_API_BASE} dmnBase=${TF_DMN_BASE} externalJobBase=${TF_EXTERNAL_JOB_BASE} workspaceBase=${TF_WORKSPACE_BASE:-<none>} authMode=${TF_AUTH_MODE}"
