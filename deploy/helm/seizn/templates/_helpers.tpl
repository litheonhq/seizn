{{- define "seizn.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "seizn.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{- define "seizn.labels" -}}
helm.sh/chart: {{ include "seizn.chart" . }}
{{ include "seizn.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "seizn.selectorLabels" -}}
app.kubernetes.io/name: {{ include "seizn.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "seizn.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "seizn.serviceAccountName" -}}
{{- default (include "seizn.fullname" .) .Values.serviceAccount.name }}
{{- end }}
