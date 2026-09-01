#!/usr/bin/env bash
#
# Deploys the Resignation (Sales) example into a running Flowable REST app.
#
# Everything here is content: one case, five processes, an app definition and the people the
# models assign work to. None of it needs a jar on the server - the models are posted to the
# engine's own repository APIs, which is what the Design app does when you press Deploy.
#
#   ./deploy.sh                                   # localhost:8080, rest-admin/test
#   BASE=https://host/flowable-rest FL_USER=me FL_PASS=secret ./deploy.sh
#   ./deploy.sh --no-identity                     # models only, leave the directory alone
#
# FL_USER rather than USER: the shell already exports USER as your login name, so a
# `USER="${USER:-rest-admin}"` default never applies and every call goes out as you.
#
set -euo pipefail

BASE="${BASE:-http://localhost:8080/flowable-rest}"
FL_USER="${FL_USER:-rest-admin}"
FL_PASS="${FL_PASS:-test}"
PASSWORD="${SAMPLE_PASSWORD:-demo}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

WITH_IDENTITY=1
[[ "${1:-}" == "--no-identity" ]] && WITH_IDENTITY=0

# The servlet prefixes are not the Flowable defaults: this app mounts BPMN at /service and
# each other engine under its own /<engine>-api. Verified against a running instance, and
# the dev proxy in every frontend's vite.config.ts rewrites to exactly these.
post_models() {
  local endpoint="$1" name="$2"; shift 2
  local body code payload cleanup=()
  body="$(mktemp)"

  # One file per request, or a .bar archive for several. Flowable's deployment endpoint
  # takes a *single* resource: posting five -F fields silently deploys one of them and
  # answers 200, which is how four of these processes went missing the first time.
  if [[ $# -eq 1 ]]; then
    payload="$1"
  else
    local dir names=()
    dir="$(dirname "$1")"
    for f in "$@"; do names+=("$(basename "$f")"); done
    payload="$(mktemp -d)/$name.bar"
    ( cd "$dir" && zip -q "$payload" "${names[@]}" )
    cleanup+=("$payload")
  fi

  code=$(curl -sS -u "$FL_USER:$FL_PASS" -o "$body" -w '%{http_code}' \
         -X POST "$BASE/$endpoint/deployments?deploymentName=$name" \
         -F "$(basename "$payload")=@$payload")
  if [[ "$code" != 2* ]]; then
    echo "  $endpoint -> HTTP $code" >&2
    head -c 300 "$body" >&2; echo >&2
    rm -f "$body" "${cleanup[@]:-}"
    exit 1
  fi
  rm -f "$body" "${cleanup[@]:-}"
  echo "  $endpoint: deployed $# file(s) as $(basename "$payload")"
}

echo "Deploying Resignation (Sales) to $BASE as $FL_USER"

post_models "service/repository"       "resignation-processes" "$HERE"/processes/*.bpmn20.xml
post_models "cmmn-api/cmmn-repository" "resignation-case"      "$HERE"/case/*.cmmn
post_models "app-api/app-repository"   "resignation-app"       "$HERE"/app/*.app

if [[ $WITH_IDENTITY -eq 1 ]]; then
  echo "Creating groups and users (existing ones are left alone)"
  python3 "$HERE/seed-identity.py" \
    "$HERE/identity/resignation-sample-users.json" "$BASE" "$FL_USER" "$FL_PASS" "$PASSWORD"
fi

echo
echo "Done. Start a case of 'salesResignation' as a member of sales-ase."
echo "The walkthrough is in USER_MANUAL.md."
