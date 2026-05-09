{{- /* Per-section Markdown mirror. Available at <section-url>/index.md for AI agents. */ -}}
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

## Pages in this section
{{ range .Pages.ByWeight }}
- [{{ .Title }}]({{ .Permalink }}index.md){{ with .Description }} — {{ . }}{{ end }}
{{- end }}
