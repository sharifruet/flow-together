# TogetherFlow Identity — static SPA served by nginx.
#
# Build from the repository's `modules/` directory so that togetherflow-common is
# visible: the app consumes it through an npm `file:` dependency.
#
#   docker build -f togetherflow-identity/docker/Dockerfile -t togetherflow/work:dev .
#
# The image carries no secrets. Runtime configuration is written at container start
# from environment variables and served at /config.js, so one image is promoted across
# environments rather than rebuilt per environment (REQUIREMENTS.md §13.3).

FROM node:22-alpine AS build
WORKDIR /build

COPY togetherflow-common/src/main/frontend ./togetherflow-common/src/main/frontend
COPY togetherflow-identity/src/main/frontend ./togetherflow-identity/src/main/frontend

# togetherflow-common is consumed as an npm `file:` dependency, which npm installs as a
# symlink to the source tree above. TypeScript resolves that symlink to its real path, so
# imports *inside* common resolve against common's own node_modules — not the app's. Its
# dev dependencies therefore have to be installed here too, or the app's `tsc --noEmit`
# fails on common's test helpers (axe-core, reached via `@togetherflow/common/testing/a11y`).
WORKDIR /build/togetherflow-common/src/main/frontend
RUN npm ci --no-audit --no-fund

WORKDIR /build/togetherflow-identity/src/main/frontend
RUN npm ci --no-audit --no-fund && npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
LABEL org.opencontainers.image.title="TogetherFlow Identity" \
      org.opencontainers.image.description="Users, groups and privileges"

COPY --from=build /build/togetherflow-identity/src/main/frontend/dist /usr/share/nginx/html
COPY togetherflow-identity/docker/identity-nginx.conf /etc/nginx/conf.d/default.conf
COPY togetherflow-identity/docker/security-headers.conf /etc/nginx/conf.d/security-headers.conf
COPY togetherflow-identity/docker/entrypoint.sh /docker-entrypoint.d/40-togetherflow-config.sh

# The docroot stays root-owned and read-only: runtime configuration is written to
# /tmp/togetherflow instead, which nginx serves at /config.js. That lets the container run
# with a read-only root filesystem in Kubernetes (see k8s/resources/togetherflow-*.yaml).
USER root
RUN mkdir -p /tmp/togetherflow \
 && chown 101:101 /tmp/togetherflow \
 && chmod +x /docker-entrypoint.d/40-togetherflow-config.sh
USER 101

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
