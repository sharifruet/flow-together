# TogetherFlow Work — static SPA served by nginx.
#
# Build from the repository's `modules/` directory so that togetherflow-common is
# visible: the app consumes it through an npm `file:` dependency.
#
#   docker build -f togetherflow-work/docker/Dockerfile -t togetherflow/work:dev .
#
# The image carries no secrets. Runtime configuration is written to /config.js at
# container start from environment variables, so one image is promoted across
# environments rather than rebuilt per environment (REQUIREMENTS.md §13.3).

FROM node:22-alpine AS build
WORKDIR /build

COPY togetherflow-common/src/main/frontend ./togetherflow-common/src/main/frontend
COPY togetherflow-work/src/main/frontend ./togetherflow-work/src/main/frontend

WORKDIR /build/togetherflow-work/src/main/frontend
RUN npm ci --no-audit --no-fund && npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
LABEL org.opencontainers.image.title="TogetherFlow Work" \
      org.opencontainers.image.description="Task and case inbox for business users"

COPY --from=build /build/togetherflow-work/src/main/frontend/dist /usr/share/nginx/html
COPY togetherflow-work/docker/work-nginx.conf /etc/nginx/conf.d/default.conf
COPY togetherflow-work/docker/security-headers.conf /etc/nginx/conf.d/security-headers.conf
COPY togetherflow-work/docker/entrypoint.sh /docker-entrypoint.d/40-togetherflow-config.sh

# The base image runs as uid 101; the entrypoint writes config.js into the docroot
# at startup, so that one directory must be writable by that user. Everything else
# stays root-owned and read-only.
# -R, not just the directory: dist/ ships a placeholder config.js, and overwriting
# an existing root-owned file needs write permission on the file itself.
USER root
RUN chown -R 101:101 /usr/share/nginx/html \
 && chmod 755 /usr/share/nginx/html \
 && chmod +x /docker-entrypoint.d/40-togetherflow-config.sh
USER 101

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
