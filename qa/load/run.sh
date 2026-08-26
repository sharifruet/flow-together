#!/usr/bin/env bash
#
# Runs the TogetherFlow load scenarios end to end (IMPLEMENTATION_PLAN.md Phase 7).
#
# Starts an engine, seeds it, runs both scenarios, tears down. Everything runs in Docker,
# so nothing beyond Docker and Node needs installing — k6 in particular is used through its
# official image rather than asking you to install it.
#
#   ./qa/load/run.sh                          # H2, small volume — a smoke test of the harness
#   ./qa/load/run.sh --postgres --instances 20000 --completed 30000
#   ./qa/load/run.sh --smoke                  # ~20s per scenario: proves the harness runs
#   ./qa/load/run.sh --port 18080             # if something already holds 8080
#   ./qa/load/run.sh --keep                   # leave the engine up to poke at afterwards
#   ./qa/load/run.sh --engine http://host:8080/flowable-rest/service   # use your own
#
# H2 is the default because it needs nothing, but read the note about it in README.md
# before trusting a number that came out of it.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

INSTANCES=2000
COMPLETED=2000
DATABASE="h2"
KEEP=0
EXTERNAL_ENGINE=""
OUT_DIR="qa/load/results"
PROFILE="full"
PORT=8080

while [ $# -gt 0 ]; do
  case "$1" in
    --instances) INSTANCES="$2"; shift 2 ;;
    --completed) COMPLETED="$2"; shift 2 ;;
    --postgres) DATABASE="postgres"; shift ;;
    --keep) KEEP=1; shift ;;
    --smoke) PROFILE="smoke"; INSTANCES=200; COMPLETED=200; shift ;;
    --port) PORT="$2"; shift 2 ;;
    --engine) EXTERNAL_ENGINE="$2"; shift 2 ;;
    --out) OUT_DIR="$2"; shift 2 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

NETWORK=togetherflow-load
ENGINE_CONTAINER=togetherflow-load-engine
DB_CONTAINER=togetherflow-load-db
ENGINE_USER=rest-admin
ENGINE_PASSWORD=test

cleanup() {
  # Captured first, and re-raised at the end: an EXIT trap whose last command succeeds
  # otherwise overwrites the script's status, and a load run that failed would report
  # success. Found by this script doing exactly that.
  local status=$?
  if [ "$KEEP" -eq 1 ]; then
    echo
    echo "Leaving the engine up (--keep). Tear down with:"
    echo "  docker rm -f $ENGINE_CONTAINER $DB_CONTAINER; docker network rm $NETWORK"
    exit "$status"
  fi
  docker rm -f "$ENGINE_CONTAINER" "$DB_CONTAINER" >/dev/null 2>&1 || true
  docker network rm "$NETWORK" >/dev/null 2>&1 || true
  exit "$status"
}

if [ -z "$EXTERNAL_ENGINE" ]; then
  trap cleanup EXIT
fi

start_engine() {
  docker network create "$NETWORK" >/dev/null 2>&1 || true

  if [ "$DATABASE" = "postgres" ]; then
    echo "Starting PostgreSQL…"
    docker run -d --name "$DB_CONTAINER" --network "$NETWORK" \
      -e POSTGRES_DB=flowable -e POSTGRES_USER=flowable -e POSTGRES_PASSWORD=flowable \
      postgres:16-alpine >/dev/null
    # The engine's own retry is not generous enough to cover first-boot initdb.
    for _ in $(seq 1 60); do
      docker exec "$DB_CONTAINER" pg_isready -U flowable >/dev/null 2>&1 && break
      sleep 1
    done
    DB_ARGS=(
      -e SPRING_DATASOURCE_URL=jdbc:postgresql://$DB_CONTAINER:5432/flowable
      -e SPRING_DATASOURCE_USERNAME=flowable
      -e SPRING_DATASOURCE_PASSWORD=flowable
      -e SPRING_DATASOURCE_DRIVER_CLASS_NAME=org.postgresql.Driver
    )
  else
    DB_ARGS=()
  fi

  # Checked up front: docker's own message for a taken port arrives after the pull and
  # names an endpoint id rather than the port, which is a slow way to learn this.
  if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Port $PORT is already in use. Pass --port <free port>." >&2
    exit 1
  fi

  echo "Starting the engine ($DATABASE) on port $PORT…"
  # `${DB_ARGS[@]+...}` rather than a bare `"${DB_ARGS[@]}"`: under `set -u`, bash 3.2 —
  # which is what macOS ships — treats expanding an empty array as an unbound variable.
  docker run -d --name "$ENGINE_CONTAINER" --network "$NETWORK" \
    -p "$PORT:8080" ${DB_ARGS[@]+"${DB_ARGS[@]}"} flowable/flowable-rest >/dev/null

  echo -n "Waiting for the engine"
  for _ in $(seq 1 120); do
    if curl -fsS -u "$ENGINE_USER:$ENGINE_PASSWORD" \
         "http://localhost:$PORT/flowable-rest/service/management/engine" >/dev/null 2>&1; then
      echo " — up."
      return 0
    fi
    echo -n "."
    sleep 2
  done
  echo
  echo "Engine did not become ready. Last 40 lines:" >&2
  docker logs --tail 40 "$ENGINE_CONTAINER" >&2
  exit 1
}

if [ -n "$EXTERNAL_ENGINE" ]; then
  API_BASE="$EXTERNAL_ENGINE"
  echo "Using the engine at $API_BASE (not starting one, not tearing one down)."
else
  start_engine
  API_BASE="http://localhost:$PORT/flowable-rest/service"
fi

echo
node qa/load/seed.mjs --base "$API_BASE" --user "$ENGINE_USER" --password "$ENGINE_PASSWORD" \
  --instances "$INSTANCES" --completed "$COMPLETED"

mkdir -p "$OUT_DIR"

# When this script started the engine, k6 joins the engine's own Docker network and
# addresses it by container name. Going out through host.docker.internal instead produced a
# steady trickle of "dial: i/o timeout" under sustained load on Docker Desktop — a harness
# artifact that shows up as engine errors in the results, which is the last thing a load
# test should invent. Container-to-container on a user-defined network avoids it entirely.
#
# An external --engine is reached as given, with host.docker.internal substituted for
# localhost so that a locally-run engine is still reachable from inside the container.
if [ -n "$EXTERNAL_ENGINE" ]; then
  K6_BASE="${API_BASE/localhost/host.docker.internal}"
  K6_NETWORK_ARGS=(--add-host=host.docker.internal:host-gateway)
else
  K6_BASE="http://$ENGINE_CONTAINER:8080/flowable-rest/service"
  K6_NETWORK_ARGS=(--network "$NETWORK")
fi

status=0
for scenario in work-inbox control-ops; do
  echo
  echo "=== $scenario ==="
  if ! docker run --rm -i \
      "${K6_NETWORK_ARGS[@]}" \
      -v "$REPO_ROOT/qa/load:/load" \
      -v "$REPO_ROOT/$OUT_DIR:/out" \
      -e TF_API_BASE="$K6_BASE" \
      -e TF_USER="$ENGINE_USER" \
      -e TF_PASSWORD="$ENGINE_PASSWORD" \
      -e TF_LOAD_PROFILE="$PROFILE" \
      grafana/k6:latest run --summary-export="/out/$scenario.json" \
      "/load/scenarios/$scenario.js"; then
    # k6 exits non-zero when a threshold fails, which is a result rather than an error.
    echo "!! $scenario breached a threshold — see $OUT_DIR/$scenario.json"
    status=1
  fi
done

echo
echo "Summaries written to $OUT_DIR/."
[ "$status" -eq 0 ] && echo "All thresholds met." || echo "At least one threshold was breached."
exit "$status"
