#!/bin/sh
# Writes runtime configuration read by the SPA at startup. Runs via nginx's
# docker-entrypoint.d hook before the server starts.
set -eu

: "${TF_API_BASE:=/process-api}"
: "${TF_IDM_BASE:=/idm-api}"
: "${TF_DMN_BASE:=/dmn-api}"
# Case instances and the event registry each sit on their own servlet.
: "${TF_CMMN_BASE:=/cmmn-api}"
: "${TF_EVENT_BASE:=/event-registry-api}"
: "${TF_EXTERNAL_JOB_BASE:=/external-job-api}"
: "${TF_IDENTITY_READ_ONLY:=false}"
: "${TF_AUTH_MODE:=oidc}"
: "${TF_OIDC_AUTHORITY:=}"
: "${TF_OIDC_CLIENT_ID:=}"
: "${TF_OIDC_SCOPE:=openid profile email}"

if [ "$TF_AUTH_MODE" = "oidc" ] && { [ -z "$TF_OIDC_AUTHORITY" ] || [ -z "$TF_OIDC_CLIENT_ID" ]; }; then
  echo "FATAL: TF_AUTH_MODE=oidc requires TF_OIDC_AUTHORITY and TF_OIDC_CLIENT_ID." >&2
  echo "Set them, or set TF_AUTH_MODE=basic for local development only." >&2
  exit 1
fi

cat > /usr/share/nginx/html/config.js <<JS
window.__TOGETHERFLOW_CONFIG__ = {
  apiBase: "${TF_API_BASE}",
  idmBase: "${TF_IDM_BASE}",
  dmnBase: "${TF_DMN_BASE}",
  cmmnBase: "${TF_CMMN_BASE}",
  eventBase: "${TF_EVENT_BASE}",
  externalJobBase: "${TF_EXTERNAL_JOB_BASE}",
  identity: { readOnly: ${TF_IDENTITY_READ_ONLY} },
  auth: {
    mode: "${TF_AUTH_MODE}",
    authority: "${TF_OIDC_AUTHORITY}",
    clientId: "${TF_OIDC_CLIENT_ID}",
    scope: "${TF_OIDC_SCOPE}"
  }
};
JS

echo "TogetherFlow Control: apiBase=${TF_API_BASE} dmnBase=${TF_DMN_BASE} externalJobBase=${TF_EXTERNAL_JOB_BASE} authMode=${TF_AUTH_MODE}"
