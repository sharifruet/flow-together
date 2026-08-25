# TogetherFlow Design — static SPA served by nginx.
#
# Build from the repository's `modules/` directory so that togetherflow-common is
# visible: the app consumes it through an npm `file:` dependency.
#
#   docker build -f togetherflow-design/docker/Dockerfile -t togetherflow/work:dev .
#
# The image carries no secrets. Runtime configuration is written at container start
# from environment variables and served at /config.js, so one image is promoted across
# environments rather than rebuilt per environment (REQUIREMENTS.md §13.3).

FROM node:22-alpine AS build
WORKDIR /build

COPY togetherflow-common/src/main/frontend ./togetherflow-common/src/main/frontend
COPY togetherflow-design/src/main/frontend ./togetherflow-design/src/main/frontend

WORKDIR /build/togetherflow-design/src/main/frontend
RUN npm ci --no-audit --no-fund && npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
LABEL org.opencontainers.image.title="TogetherFlow Design" \
      org.opencontainers.image.description="BPMN and DMN model authoring"

COPY --from=build /build/togetherflow-design/src/main/frontend/dist /usr/share/nginx/html
COPY togetherflow-design/docker/design-nginx.conf /etc/nginx/conf.d/default.conf
COPY togetherflow-design/docker/security-headers.conf /etc/nginx/conf.d/security-headers.conf
COPY togetherflow-design/docker/entrypoint.sh /docker-entrypoint.d/40-togetherflow-config.sh

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
