# TogetherFlow Workspace — optional workspaces and design-time permissions (ADR 0017).
#
# Only deployed where Design should have workspaces. Without it Design shows one flat
# model library and no switcher, which is what every deployment had before it existed.
#
# Built from an already-packaged jar rather than compiling inside the image: this is a
# Maven reactor module, and building it here would mean re-resolving the whole engine
# build for a single artifact. Package first, then build:
#
#   ./mvnw -Ptogetherflow -pl modules/togetherflow-workspace -am package
#   docker build -f modules/togetherflow-workspace/docker/Dockerfile \
#     -t togetherflow/workspace:dev modules/togetherflow-workspace

FROM eclipse-temurin:21-jre-alpine

LABEL org.opencontainers.image.title="TogetherFlow Workspace" \
      org.opencontainers.image.description="Workspaces and design-time permissions for TogetherFlow Design"

# Non-root: this service sits in front of the model repository and decides who may write
# to it, which is not a job to hand root (§13.1).
RUN addgroup -S togetherflow && adduser -S -G togetherflow togetherflow

WORKDIR /app
COPY --chown=togetherflow:togetherflow target/togetherflow-workspace-*.jar app.jar

# Git working copies (ADR 0018), when Git connectivity is enabled. Empty in the image; a
# real deployment mounts a volume, because a checkout written into a container layer is
# re-cloned on every restart.
RUN mkdir -p /var/lib/togetherflow/git \
 && chown -R togetherflow:togetherflow /var/lib/togetherflow
VOLUME ["/var/lib/togetherflow/git"]

USER togetherflow
EXPOSE 8092

# Health only. The readiness of the *engine* behind it is deliberately not probed here:
# this service is still correct when Flowable is briefly unavailable, and tying its
# liveness to another service's would restart it for someone else's outage.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8092/actuator/health || exit 1

ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]
