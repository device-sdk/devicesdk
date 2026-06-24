---
name: devicesdk-api
description: Use the DeviceSDK REST API to manage projects, devices, scripts, environment variables, and API tokens. The API is served by your own self-hosted server (base URL http://<server>:8080), not a managed cloud host. All endpoints require Bearer authentication (session cookie or an API token with the prefix dsdk_). Responses use the envelope { success, result | error }. The full interactive OpenAPI reference is published at https://devicesdk.com/docs/api.
---

## Base URL
The API is served by the server you run yourself, under `/v1/*` (e.g. `http://<server>:8080/v1/...`). There is no hosted api host - replace `<server>:8080` with wherever your server listens.

## Authentication
Send `Authorization: Bearer <token>`. Tokens come from either the dashboard login session (served by your own server) or from `POST /v1/tokens` (prefix `dsdk_`).

## Key resources
- `GET /v1/user` - current user profile.
- `GET /v1/projects`, `POST /v1/projects` - list / create projects.
- `GET /v1/projects/{id}/devices`, `POST /v1/projects/{id}/devices` - list / create devices.
- `GET /v1/projects/{id}/devices/{did}/script`, `POST …/script` - fetch / upload a device script (the POST returns a signed upload URL).
- `GET /v1/projects/{id}/devices/{did}/logs` - paginated logs.
- `GET /v1/projects/{id}/devices/{did}/watch` - WebSocket (upgrade) streaming `status` / `log` / `state` frames in real time.
- `GET /v1/projects/{id}/env`, `PUT …/env/{key}` - environment variables.
- `POST /v1/tokens` - create API tokens.

## Response envelope
```json
{ "success": true, "result": { /* payload */ } }
```
or on error:
```json
{ "success": false, "error": "human-readable message" }
```

## See also
- Full schema: <https://devicesdk.com/docs/api>
- CLI equivalents: `devicesdk-cli` skill.
