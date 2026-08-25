# TogetherFlow Attachment Gateway — the optional storage proxy from REQUIREMENTS.md §7.6.
#
# Only deployed when a non-`db` attachment provider is configured. With the default,
# bytes go straight to the engine and this image is not part of the deployment at all.
#
# Built from an already-packaged jar rather than compiling inside the image: this is a
# Maven reactor module, and building it here would mean re-resolving the whole engine
# build for a single artifact. Package first, then build:
#
#   ./mvnw -Ptogetherflow -pl modules/togetherflow-attachment-gateway -am package
#   docker build -f modules/togetherflow-attachment-gateway/docker/Dockerfile \
#     -t togetherflow/attachment-gateway:dev modules/togetherflow-attachment-gateway

FROM eclipse-temurin:21-jre-alpine

LABEL org.opencontainers.image.title="TogetherFlow Attachment Gateway" \
      org.opencontainers.image.description="Filesystem and SharePoint attachment storage for TogetherFlow"

# Runs as a non-root user: this service receives uploaded bytes from the browser, which
# is exactly the surface not to hand root (§13.1).
RUN addgroup -S togetherflow && adduser -S -G togetherflow togetherflow

WORKDIR /app
COPY --chown=togetherflow:togetherflow target/togetherflow-attachment-gateway-*.jar app.jar

# The filesystem provider writes here. Left empty in the image; a real deployment mounts
# a volume, because bytes written into a container layer are lost on restart.
RUN mkdir -p /var/lib/togetherflow/attachments \
 && chown -R togetherflow:togetherflow /var/lib/togetherflow
VOLUME ["/var/lib/togetherflow/attachments"]

USER togetherflow
EXPOSE 8091

# The gateway's own health endpoint reports the active provider, which is what lets Work
# degrade gracefully when it is unavailable (§13.4).
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8091/attachments/health || exit 1

ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]
