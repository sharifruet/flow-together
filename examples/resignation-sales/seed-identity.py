"""Create the sample groups, users and memberships through the IDM REST API.

Split out of deploy.sh rather than inlined as a heredoc: a heredoc inside a script that is
itself generated is one nesting level too many, and it broke silently the first time.
"""

import base64
import json
import sys
import urllib.error
import urllib.request

path, base, user, password, sample_password = sys.argv[1:6]
auth = base64.b64encode(f"{user}:{password}".encode()).decode()


def get(endpoint):
    request = urllib.request.Request(
        f"{base}{endpoint}", headers={"Authorization": f"Basic {auth}"})
    return json.loads(urllib.request.urlopen(request).read())


def post(endpoint, payload):
    request = urllib.request.Request(
        f"{base}{endpoint}",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Basic {auth}"},
        method="POST",
    )
    try:
        urllib.request.urlopen(request).read()
        return "created"
    except urllib.error.HTTPError as error:
        # 409 is "already there". This never overwrites, so a real `hrm` group that happens
        # to share an id is not quietly redefined. Anything else is a real failure.
        if error.code == 409:
            return "exists"
        if error.code == 401:
            sys.exit(f"  401 from {endpoint}: check FL_USER / FL_PASS")
        body = error.read().decode(errors="replace")[:200]
        sys.exit(f"  {error.code} from {endpoint}: {body}")


data = json.load(open(path))
created = exists = 0

for group in data["groups"]:
    state = post("/idm-api/groups", {"id": group["id"], "name": group["name"], "type": group["type"]})
    created += state == "created"
    exists += state == "exists"

for member in data["users"]:
    state = post("/idm-api/users", {
        "id": member["id"],
        "firstName": member["firstName"],
        "lastName": member["lastName"],
        "email": member["email"],
        "password": sample_password,
    })
    created += state == "created"
    exists += state == "exists"
    for group in member["groups"]:
        post(f"/idm-api/groups/{group}/members", {"userId": member["id"]})

# Without access-rest-api nobody can reach the API at all: the sign-in succeeds and every
# request after it is a 403.
#
# Per user, not per group. Granting it to the nineteen groups is the tidier shape and it does
# not work - the group grant is stored and the user is still refused, because this build
# resolves the privilege against the user rather than through membership. Verified against a
# running engine: group grant -> 403, user grant -> 201.
privileges = {p["name"]: p["id"] for p in get("/idm-api/privileges")["data"]}
privilege_id = privileges.get("access-rest-api")
if privilege_id is None:
    sys.exit("  no 'access-rest-api' privilege on this server - cannot grant API access")

granted = 0
for member in data["users"]:
    if post(f"/idm-api/privileges/{privilege_id}/users", {"userId": member["id"]}) == "created":
        granted += 1

print(f"  {created} created, {exists} already present")
print(f"  access-rest-api granted to {granted} user(s)")
