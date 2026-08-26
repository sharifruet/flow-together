{{/*
Shared naming and configuration helpers.

The per-app config maps differ only in which engine servlets each app talks to, so the
shared half lives in `togetherflow.commonConfig` and each app adds its own bases. That
keeps "what does an app need to know" in one place rather than four.
*/}}

{{- define "togetherflow.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "togetherflow.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "togetherflow.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "togetherflow.labels" -}}
helm.sh/chart: {{ include "togetherflow.chart" . }}
{{ include "togetherflow.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "togetherflow.selectorLabels" -}}
app.kubernetes.io/name: {{ include "togetherflow.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "togetherflow.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "togetherflow.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{/*
Full image reference. An empty `image.tag` falls back to the chart's appVersion so a
release is reproducible from the chart version alone.
Usage: include "togetherflow.image" (dict "root" $ "repository" "togetherflow-work")
*/}}
{{- define "togetherflow.image" -}}
{{- $image := .root.Values.image -}}
{{- $tag := default .root.Chart.AppVersion $image.tag -}}
{{- if $image.registry -}}
{{- printf "%s/%s/%s:%s" $image.registry $image.repository .repository $tag -}}
{{- else -}}
{{- printf "%s/%s:%s" $image.repository .repository $tag -}}
{{- end -}}
{{- end -}}

{{/*
The configuration every app carries: authentication, the switcher's sibling URLs,
observability and locale. Rendered as ConfigMap data lines.
*/}}
{{- define "togetherflow.commonConfig" -}}
TF_AUTH_MODE: {{ .Values.auth.mode | quote }}
TF_OIDC_AUTHORITY: {{ .Values.auth.oidc.authority | quote }}
TF_OIDC_CLIENT_ID: {{ .Values.auth.oidc.clientId | quote }}
TF_OIDC_SCOPE: {{ .Values.auth.oidc.scope | quote }}
TF_APP_WORK: {{ .Values.appUrls.work | quote }}
TF_APP_CONTROL: {{ .Values.appUrls.control | quote }}
TF_APP_IDENTITY: {{ .Values.appUrls.identity | quote }}
TF_APP_DESIGN: {{ .Values.appUrls.design | quote }}
TF_ERROR_ENDPOINT: {{ .Values.observability.errorEndpoint | quote }}
TF_RELEASE: {{ default .Chart.AppVersion .Values.observability.release | quote }}
TF_LOCALE: {{ .Values.locale | quote }}
{{- end -}}

{{/*
The engine bases each app needs. Only what an app actually calls is set: an app given a
base it never uses would suggest a dependency it does not have.
*/}}
{{- define "togetherflow.appConfig" -}}
{{- $engine := .root.Values.engine -}}
{{- if eq .app "work" }}
TF_API_BASE: {{ $engine.apiBase | quote }}
TF_CMMN_BASE: {{ $engine.cmmnBase | quote }}
TF_ATTACHMENT_GATEWAY: {{ .root.Values.attachmentGateway.enabled | ternary (printf "https://%s" (default "" .root.Values.ingress.hosts.attachmentGateway)) "" | quote }}
{{- else if eq .app "control" }}
TF_API_BASE: {{ $engine.apiBase | quote }}
TF_IDM_BASE: {{ $engine.idmBase | quote }}
TF_DMN_BASE: {{ $engine.dmnBase | quote }}
TF_CMMN_BASE: {{ $engine.cmmnBase | quote }}
TF_EVENT_BASE: {{ $engine.eventBase | quote }}
TF_EXTERNAL_JOB_BASE: {{ $engine.externalJobBase | quote }}
TF_IDENTITY_READ_ONLY: {{ .root.Values.identity.readOnly | quote }}
{{- else if eq .app "identity" }}
TF_API_BASE: {{ $engine.apiBase | quote }}
TF_IDM_BASE: {{ $engine.idmBase | quote }}
TF_IDENTITY_READ_ONLY: {{ .root.Values.identity.readOnly | quote }}
{{- else if eq .app "design" }}
TF_API_BASE: {{ $engine.apiBase | quote }}
TF_IDM_BASE: {{ $engine.idmBase | quote }}
TF_DMN_BASE: {{ $engine.dmnBase | quote }}
TF_CMMN_BASE: {{ $engine.cmmnBase | quote }}
TF_APP_BASE: {{ $engine.appBase | quote }}
TF_EVENT_BASE: {{ $engine.eventBase | quote }}
TF_EXTERNAL_JOB_BASE: {{ $engine.externalJobBase | quote }}
TF_IDENTITY_READ_ONLY: {{ .root.Values.identity.readOnly | quote }}
{{- end }}
{{- end -}}
