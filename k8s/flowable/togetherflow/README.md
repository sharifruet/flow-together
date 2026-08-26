# TogetherFlow Helm chart

Packages the four TogetherFlow UIs — Work, Control, Identity, Design — and the optional
attachment gateway. It does **not** deploy a Flowable engine: the UIs are static SPAs that
talk to an engine's REST servlets from the browser, so the engine is a separate concern and
`engine.*` below only tells the browser where to find it.

`../../resources/*.yaml` in this repository holds the same deployment as plain manifests,
for people who do not use Helm. Both were derived from the same verified image behaviour;
neither is generated from the other, so a change to one belongs in both.

## Install

```bash
helm install togetherflow k8s/flowable/togetherflow \
  --set auth.oidc.authority=https://keycloak.example.com/realms/Flowable \
  --set auth.oidc.clientId=togetherflow-ui \
  --set ingress.enabled=true \
  --set ingress.className=nginx \
  --set ingress.hosts.work=work.example.com \
  --set ingress.hosts.control=control.example.com \
  --set ingress.hosts.identity=identity.example.com \
  --set ingress.hosts.design=design.example.com \
  --set appUrls.work=https://work.example.com \
  --set appUrls.control=https://control.example.com \
  --set appUrls.identity=https://identity.example.com \
  --set appUrls.design=https://design.example.com
```

`appUrls` is separate from `ingress.hosts` on purpose: the first is what the shell's app
switcher links to, which may be a public URL in front of a CDN, and the second is what this
chart's own ingress routes. They are usually the same and often are not.

## What you must set

| Value | Why |
|---|---|
| `auth.oidc.authority`, `auth.oidc.clientId` | Each app's entrypoint fails fast without them, so the pods never become ready. `auth.mode=basic` skips this and is for local development only. |
| `engine.*` | Defaults are same-origin paths (`/process-api`, …), which assume an ingress that routes them to the engine. Absolute URLs work too, but then the engine must send CORS headers. |
| `image.tag` | Empty means the chart's `appVersion`. Pin it to promote a specific build. |

## Attachment storage

Off by default. With the engine's own `db` provider the browser posts bytes straight to the
engine and this service is not part of the deployment at all — see REQUIREMENTS.md §7.6.

```bash
# Filesystem: needs a volume, and a URL the browser can resolve.
--set attachmentGateway.enabled=true \
--set attachmentGateway.provider=filesystem \
--set attachmentGateway.filesystem.publicBaseUrl=https://files.example.com
```

More than one replica on the filesystem provider needs a `ReadWriteMany` storage class;
`ReadWriteOnce` is the common default and a second replica on it will not schedule.

The claim carries `helm.sh/resource-policy: keep`, so `helm uninstall` leaves uploaded
files alone. Delete it deliberately if you actually want them gone.

For SharePoint, the client secret is never a chart value — create the Secret out of band:

```bash
kubectl create secret generic togetherflow-attachment-gateway-secrets \
  --from-literal=TOGETHERFLOW_ATTACHMENTS_SHAREPOINT_CLIENTSECRET=...
```

The SharePoint provider is the one integration in this repository that has not been
verified against the real service.

## Security posture

Every pod runs non-root with a read-only root filesystem, all capabilities dropped, and no
service-account token mounted. The apps write their generated `config.js` to `/tmp`, outside
the docroot, which is what lets the root filesystem be read-only — verified by running the
built images with `--read-only`.

`networkPolicy.enabled` is off by default because it silently does nothing on a CNI that
does not enforce NetworkPolicy, and a security control that silently does nothing is worse
than an absent one.

## Verifying a change

```bash
helm lint k8s/flowable/togetherflow
helm template tf k8s/flowable/togetherflow --set auth.oidc.authority=https://example.com | \
  docker run --rm -i ghcr.io/yannh/kubeconform:latest -strict -summary -
```

Schema validation needs no cluster, which is why it is the check named here. Applying to a
real cluster is still the only thing that proves scheduling, volumes and probes.
