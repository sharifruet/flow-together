# TogetherFlow Identity

Users, groups and privileges (REQUIREMENTS.md §7.3). Phase 2 of
[docs/ui/IMPLEMENTATION_PLAN.md](../../docs/ui/IMPLEMENTATION_PLAN.md).

## Run it locally

Needs a running Flowable REST app that exposes **both** the process API and the IDM API:

```bash
docker run -p 8080:8080 flowable/flowable-rest
cd src/main/frontend && npm install && npm run dev   # http://localhost:5274
```

`TF_API_TARGET=http://host:port npm run dev` points both proxies elsewhere.

## Scripts

Same as the other modules: `dev`, `build`, `test`, `lint`, `typecheck`, `e2e`.

## Maven

```bash
./mvnw install -Ptogetherflow -pl modules/togetherflow-common,modules/togetherflow-identity
```

## What's here

- **Users** — list, search by id, create, edit, delete. Passwords are write-only: the REST
  layer never returns them, and an untouched password field is omitted on update so the
  engine does not reset it.
- **Groups** — list, search, create, edit, delete, plus membership. The engine has no
  "list members" endpoint, so members are listed through `GET /users?memberOfGroup=…`.
- **Privileges** — grant and revoke to users and groups. Privileges themselves are defined
  by the deployment; the REST layer exposes no create/delete for them.
- **Profile** — a user's picture and their custom info key/value pairs. Viewable even in a
  read-only deployment; editable only where identities are writable.

**These two are not IDM endpoints**, which is worth knowing before looking for them:
`UserPictureResource` and `UserInfoCollectionResource` live in `flowable-rest` under
`/identity/users/{id}/…` — the *process* API. The same paths on `/idm-api` answer "No
endpoint". The info collection also returns **keys only**, so reading the values costs one
request per key; `UserProfileApi.listInfo` does that so callers get what they asked for.

## Read-only (directory-backed) deployments

When identities come from LDAP rather than the engine's own tables, set
`TF_IDENTITY_READ_ONLY=true`. Every create/edit/delete control is hidden and a banner
explains why, instead of offering actions that would fail against a read-only backend.

The engine exposes no flag for this, so it is deployment configuration rather than something
the UI can detect — see REQUIREMENTS.md §7.3.

## Container

```bash
cd modules
docker build -f togetherflow-identity/docker/Dockerfile -t togetherflow/identity:dev .

docker run -p 8080:8080 \
  -e TF_AUTH_MODE=oidc \
  -e TF_OIDC_AUTHORITY=https://keycloak.example.com/realms/Flowable \
  -e TF_OIDC_CLIENT_ID=togetherflow-ui \
  -e TF_IDM_BASE=/idm-api \
  togetherflow/identity:dev
```

| Env var | Default | Meaning |
|---|---|---|
| `TF_API_BASE` | `/process-api` | Process REST API (used for the sign-in check) |
| `TF_IDM_BASE` | `/idm-api` | IDM REST API |
| `TF_IDENTITY_READ_ONLY` | `false` | Hide all mutating controls |
| `TF_AUTH_MODE` | `oidc` | `oidc` or `basic` (local development only) |
| `TF_OIDC_AUTHORITY` / `TF_OIDC_CLIENT_ID` | — | Required when mode is `oidc` |
