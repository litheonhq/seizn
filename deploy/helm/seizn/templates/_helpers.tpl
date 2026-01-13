{{/*
Expand the name of the chart.
*/}}
{{- define "seizn.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "seizn.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "seizn.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "seizn.labels" -}}
helm.sh/chart: {{ include "seizn.chart" . }}
{{ include "seizn.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "seizn.selectorLabels" -}}
app.kubernetes.io/name: {{ include "seizn.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "seizn.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "seizn.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Return the PostgreSQL hostname
*/}}
{{- define "seizn.postgresql.host" -}}
{{- if .Values.postgresql.enabled }}
{{- printf "%s-postgresql" (include "seizn.fullname" .) }}
{{- else }}
{{- .Values.externalPostgresql.host }}
{{- end }}
{{- end }}

{{/*
Return the PostgreSQL port
*/}}
{{- define "seizn.postgresql.port" -}}
{{- if .Values.postgresql.enabled }}
{{- printf "5432" }}
{{- else }}
{{- .Values.externalPostgresql.port | toString }}
{{- end }}
{{- end }}

{{/*
Return the PostgreSQL database name
*/}}
{{- define "seizn.postgresql.database" -}}
{{- if .Values.postgresql.enabled }}
{{- .Values.postgresql.auth.database }}
{{- else }}
{{- .Values.externalPostgresql.database }}
{{- end }}
{{- end }}

{{/*
Return the PostgreSQL username
*/}}
{{- define "seizn.postgresql.username" -}}
{{- if .Values.postgresql.enabled }}
{{- .Values.postgresql.auth.username }}
{{- else }}
{{- .Values.externalPostgresql.username }}
{{- end }}
{{- end }}

{{/*
Return the Redis hostname
*/}}
{{- define "seizn.redis.host" -}}
{{- if .Values.redis.enabled }}
{{- printf "%s-redis-master" (include "seizn.fullname" .) }}
{{- else }}
{{- .Values.externalRedis.host }}
{{- end }}
{{- end }}

{{/*
Return the Redis port
*/}}
{{- define "seizn.redis.port" -}}
{{- if .Values.redis.enabled }}
{{- printf "6379" }}
{{- else }}
{{- .Values.externalRedis.port | toString }}
{{- end }}
{{- end }}

{{/*
Return the Qdrant hostname
*/}}
{{- define "seizn.qdrant.host" -}}
{{- if .Values.qdrant.enabled }}
{{- printf "%s-qdrant" (include "seizn.fullname" .) }}
{{- else }}
{{- .Values.externalQdrant.host }}
{{- end }}
{{- end }}

{{/*
Return the Qdrant HTTP port
*/}}
{{- define "seizn.qdrant.httpPort" -}}
{{- if .Values.qdrant.enabled }}
{{- printf "6333" }}
{{- else }}
{{- .Values.externalQdrant.httpPort | toString }}
{{- end }}
{{- end }}
