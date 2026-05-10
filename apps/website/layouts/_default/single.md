{{- /* Per-page Markdown mirror. Available at <page-url>/index.md for AI agents. */ -}}
---
title: {{ .Title | jsonify }}
{{- with .Description }}
description: {{ . | jsonify }}
{{- end }}
url: {{ .Permalink }}
---

# {{ .Title }}

{{ with .Description }}> {{ . }}

{{ end -}}
{{ .RawContent }}
