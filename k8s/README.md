# Flowable Kubernetes

## Requirements

* Kubernetes v1.16+
* Helm 3

Flowable REST app can be deployed to a Kubernetes cluster using the `flowable-rest.yaml` manifest located in the `resources` folder.
This manifest contains 'only' the deployment and service descriptors for Flowable REST. 

A more preferred way of deploying FlowableRest is using the Helm chart. This deploys Flowable using a predefined configuration; which can be overridden.
By default the chart will deploy a PostgreSQL instance. For this a *PersistantVolume* is required. Because different cloud providers have different implementations the applicable *storage class* must be provided when deploying in order to create the *PersistantVolumeClaim*.

There are several ways to expose the deployed Flowable REST service on the Kubernetes cluster to the outside world.
For convenience the Flowable Helm chart includes *ingress rules* that can be used to configure an *Ingress controller*. For this the *Ingress controller* must be present and configured on the cluster.
By default an Ingress with the annotation `kubernetes.io/ingress.class: "nginx"` will located. This class is configurable.

Info on how to install the *ingress-nginx* controller can be found here; 
[Ingress-Nginx](https://github.com/kubernetes/ingress-nginx/tree/main/charts/ingress-nginx).


## Deploy Flowable OSS

```console
helm repo add flowable-oss https://flowable.github.io/helm/
```
```console
helm install flowable flowable-oss/flowable \
    --create-namespace --namespace=flowable \
    --set host.external=<cluster external hostname> --set ingress.useHost=true \
    --set postgres.storage.storageClassName=default
```

***flowable.host.external** will be used for client redirects*  

Check for individual pod status

```console
kubectl get pods -n flowable -w
```

## Undeploy Flowable OSS

```console
helm delete flowable -n flowable
```

## Deploy TogetherFlow (the UIs)

The four TogetherFlow apps and the optional attachment gateway have their own chart in
[`flowable/togetherflow`](flowable/togetherflow/README.md), which `helm-release.yml`
publishes alongside the engine chart. They are static SPAs that talk to an engine's REST
servlets from the browser, so the chart deploys no engine of its own — deploy one with the
chart above first, or point the UIs at an existing one.

```console
helm install togetherflow k8s/flowable/togetherflow \
    --create-namespace --namespace=flowable \
    --set auth.oidc.authority=https://keycloak.example.com/realms/Flowable \
    --set ingress.enabled=true --set ingress.hosts.work=work.example.com
```

The same deployment is also available as plain manifests in `resources/togetherflow-*.yaml`
for people who do not use Helm. Neither is generated from the other, so a change belongs in
both.