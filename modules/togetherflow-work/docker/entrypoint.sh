#!/bin/sh
# Writes runtime configuration read by the SPA at startup. Runs via nginx's
# docker-entrypoint.d hook before the server starts.
set -eu

: "${TF_API_BASE:=/process-api}"
# CMMN runs on its own servlet; case work is unreachable without it.
: "${TF_CMMN_BASE:=/cmmn-api}"
# Empty unless a non-`db` attachment provider is deployed (REQUIREMENTS.md §7.6).
: "${TF_ATTACHMENT_GATEWAY:=}"
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
  cmmnBase: "${TF_CMMN_BASE}",
  attachmentGateway: "${TF_ATTACHMENT_GATEWAY}",
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

echo "TogetherFlow: apiBase=${TF_API_BASE} cmmnBase=${TF_CMMN_BASE} authMode=${TF_AUTH_MODE}"
