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

# ── Finding a Python that is actually Python ────────────────────────────────────
#
# `python3` cannot be trusted to be an interpreter. Windows ships an App Execution
# Alias of that name which prints "Python was not found; run without arguments to
# install from the Microsoft Store" — and **exits 0**. Under `set -e` that is not a
# failure, so the identity step below appeared to run, created nobody, and the script
# went on to report success. A missing tool that announces itself is a nuisance; one
# that reports success is a bug.
#
# So candidates are probed by what they *print*, not by whether they exit cleanly.
find_python() {
  local candidate
  for candidate in python3 python py; do
    command -v "$candidate" >/dev/null 2>&1 || continue
    if [[ "$("$candidate" -c 'import sys; print("ok" if sys.version_info[0] == 3 else "")' \
            2>/dev/null)" == "ok" ]]; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

# ── Building the .bar ───────────────────────────────────────────────────────────
#
# A .bar is a plain zip. `zip(1)` is the obvious way to make one and is absent from
# Windows, from the Git-for-Windows shell, and from most slim Linux images — so this
# tried `zip`, failed at line 45, and deployed nothing at all.
#
# Python is the first fallback because the identity step already needs it, so a machine
# that can run this script whole can almost certainly make the archive. `jar` is the
# second because a JDK is on hand wherever the engine itself gets built. It needs
# `--no-manifest`: the engine deploys every entry in a bar it recognises, and a
# META-INF/MANIFEST.MF it did not ask for has no business in the deployment.
make_bar() {
  local out="$1" dir="$2"; shift 2   # remaining args are basenames within "$dir"
  local python
  if command -v zip >/dev/null 2>&1; then
    ( cd "$dir" && zip -q "$out" "$@" )
  elif python="$(find_python)"; then
    ( cd "$dir" && "$python" -m zipfile -c "$out" "$@" )
  elif command -v jar >/dev/null 2>&1; then
    ( cd "$dir" && jar --create --no-manifest --file="$out" "$@" )
  else
    echo "Cannot build $(basename "$out"): none of zip, python3 or jar is available." >&2
    echo "A .bar is a zip archive — install any one of them and run this again." >&2
    exit 1
  fi
}

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
    make_bar "$payload" "$dir" "${names[@]}"
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

# The fourteen forms go first, so the case and processes that name them by key find them
# deployed the moment they are. The form engine takes a .bar of .form files in one call.
post_models "form-api/form-repository" "resignation-forms"     "$HERE"/forms/*.form
post_models "service/repository"       "resignation-processes" "$HERE"/processes/*.bpmn20.xml
post_models "cmmn-api/cmmn-repository" "resignation-case"      "$HERE"/case/*.cmmn
post_models "app-api/app-repository"   "resignation-app"       "$HERE"/app/*.app

if [[ $WITH_IDENTITY -eq 1 ]]; then
  echo "Creating groups and users (existing ones are left alone)"
  if ! PYTHON="$(find_python)"; then
    echo "  No Python 3 found, so the twenty-two people were not created." >&2
    echo "  Install Python 3, or re-run with --no-identity to deploy the models alone." >&2
    echo "  Without the users, the case starts but every task lands on nobody." >&2
    exit 1
  fi
  "$PYTHON" "$HERE/seed-identity.py" \
    "$HERE/identity/resignation-sample-users.json" "$BASE" "$FL_USER" "$FL_PASS" "$PASSWORD"
fi

echo
echo "Done. Start a case of 'salesResignation' as a member of sales-ase."
echo "The walkthrough is in USER_MANUAL.md."
