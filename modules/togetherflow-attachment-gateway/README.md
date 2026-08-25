# TogetherFlow Attachment Gateway

Optional attachment storage for TogetherFlow (REQUIREMENTS.md §7.6).

**Most deployments do not need this.** The default provider is `db` — Flowable's own
byte-array storage — and with it the Work app posts multipart straight to the engine's
task-attachment endpoint. This service is not part of that deployment at all.

Deploy it only when you want files somewhere other than the engine's database.

## Why a server-side component exists

Uploads can't go from browser JavaScript to SharePoint directly: app credentials would
be exposed client-side. So the gateway is a small proxy that

1. receives the file from the Work app,
2. stores it (filesystem or SharePoint), and
3. returns a URL,

which the UI then registers against the task as an `externalUrl` attachment. No bytes
pass through the engine. Reads need no proxy for SharePoint — the browser opens the
stored URL and Microsoft 365 handles the viewer's own auth.

## Providers

| Provider | What it does | Needs this service |
|---|---|---|
| `db` (default) | Bytes in the engine's own database | **No** |
| `filesystem` | Bytes in a directory tree; the gateway serves downloads | Yes |
| `sharepoint` | Uploaded to a document library via Microsoft Graph | Yes |

Switching provider is one property. Attachments created under a previous provider keep
resolving, because Flowable stores either a `url` or a `contentId` per row and the two
coexist — there is no data migration.

## Running it

```bash
./mvnw -Ptogetherflow -pl modules/togetherflow-attachment-gateway package

java -jar modules/togetherflow-attachment-gateway/target/togetherflow-attachment-gateway-*.jar \
  --togetherflow.attachments.provider=filesystem \
  --togetherflow.attachments.filesystem.base-path=/var/lib/togetherflow/attachments \
  --togetherflow.attachments.filesystem.public-base-url=https://files.example.com
```

Then point the Work app at it — `TF_ATTACHMENT_GATEWAY=https://files.example.com` — and
its attachment widget switches to the gateway path with no code change.

## Container

```bash
./mvnw -Ptogetherflow -pl modules/togetherflow-attachment-gateway -am package
docker build -f modules/togetherflow-attachment-gateway/docker/Dockerfile \
  -t togetherflow/attachment-gateway:dev modules/togetherflow-attachment-gateway
```

Built from an already-packaged jar rather than compiling inside the image: this is a
reactor module, and building it in the Dockerfile would mean re-resolving the whole engine
build for one artifact. Runs as a non-root user, with the filesystem provider's directory
declared as a volume — bytes written into a container layer are lost on restart.

A Kubernetes manifest is at
[`k8s/resources/togetherflow-attachment-gateway.yaml`](../../k8s/resources/togetherflow-attachment-gateway.yaml).
Note its `replicas: 1`: the filesystem provider shares a volume across replicas, so
scaling out needs `ReadWriteMany`. The SharePoint provider has no such constraint.

## Configuration

```yaml
togetherflow:
  attachments:
    provider: db | filesystem | sharepoint
    max-file-size-bytes: 26214400
    filesystem:
      base-path: /var/lib/togetherflow/attachments
      public-base-url: https://files.example.com   # must be reachable by the browser
    sharepoint:
      tenant-id: ...
      client-id: ...
      client-secret: ...
      drive-id: ...
      folder-path: TogetherFlow
```

Configuration is validated **at startup**, not on first upload: a gateway that starts
happily and fails only when someone attaches a file has moved the failure to the worst
possible moment.

## API

| Endpoint | Purpose |
|---|---|
| `POST /attachments` (multipart: `taskId`, `file`) | Stores a file, returns `{url, fileName, contentType, sizeBytes}` |
| `GET /attachments/{id}` | Serves a stored file (filesystem provider only) |
| `GET /attachments/health` | Reports the active provider, so Work can degrade gracefully (§13.4) |

Registering the attachment against the task stays with the UI, which already talks to
Flowable and holds the user's credentials. Doing it here would mean the gateway
impersonating users.

## Security notes

- **Path traversal is closed by construction.** The client's file name is never used as a
  path component: stored files are named by a generated id, and the original name travels
  only as metadata. `../../etc/passwd` lands as a UUID inside the base directory.
- **Downloads are always `Content-Disposition: attachment`** with `nosniff`. Serving
  user-supplied bytes inline would invite stored XSS on this origin.
- **Size is checked before any bytes are written**, so an oversized upload cannot fill the
  disk on its way to being rejected.
- **Provider errors are logged, not returned.** They can name internal paths and hosts.
- The gateway does **not** authenticate callers itself. Put it behind the same ingress and
  auth as the apps; it is not designed to face the public internet unprotected.

## Verification status — read this before enabling SharePoint

The filesystem provider is verified end to end against a running engine: upload → stored
on disk → registered with Flowable as an `externalUrl` attachment → fetched back through
the gateway.

**The SharePoint provider is not.** Exercising it needs an Azure AD tenant, an app
registration and a SharePoint site, none of which exist in this environment. The Graph
request shapes follow Microsoft's documentation and the path handling is unit-tested, but
treat the first run against a real tenant as the actual acceptance test.

Two further caveats for SharePoint:

- Auth is **app-only** (client credentials): one service identity performs every upload,
  so SharePoint sees the gateway rather than the end user. Check that against your audit
  requirements. Delegated auth — each user's own Microsoft 365 login — would need the
  shell to broker a second identity provider (REQUIREMENTS.md Open Question 11).
- Uploads use Graph's simple upload, documented up to 250 MB. Keep
  `max-file-size-bytes` at or below that; larger files need an upload session, which this
  does not implement.

## Tests

```bash
./mvnw -Ptogetherflow -pl modules/togetherflow-attachment-gateway test
```

20 tests: the filesystem store (including traversal attempts), SharePoint path
construction, and the controller end to end over MockMvc.
