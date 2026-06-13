# Audit Batch 12 — API Documentation & OpenAPI

These items make the public API reference complete and keep it in sync with code.

## 1. Convert auth routes to Chanfana routes

**Files:** `apps/server/src/endpoints/auth/localAuth.ts`

Local auth endpoints (`/v1/auth/register`, `/v1/auth/login`, `/v1/auth/status`, `/v1/auth/logout`) are implemented as plain Hono handlers, not Chanfana `OpenAPIRoute` classes. They do not appear in the generated `openapi.json`.

**Action:** Convert them to `BaseRoute`/`OpenAPIRoute` so they are included in `openapi.json`.

---

## 2. Convert CLI-auth routes to Chanfana routes

**Files:** `apps/server/src/endpoints/cli-auth/*.ts`

CLI-auth endpoints are also plain Hono handlers and missing from the public API spec.

**Action:** Convert them to `BaseRoute` or add manual OpenAPI metadata.

---

## 3. Add CI gate for `openapi.json` drift

**Files:** `.github/workflows/ci.yml`, `apps/server/openapi.json`

The committed `openapi.json` can drift from code; 13 endpoints currently have only `"Successful response."` placeholders. There is no test or CI gate that checks it.

**Action:** Add a CI step that regenerates `openapi.json` and fails if the committed copy diverges.

---

## 4. Document the WebSocket protocol

**Files:** `apps/server/src/endpoints/devices/wsRoutes.ts`, docs

WebSocket routes cannot be documented by Chanfana, but there is no supplemental documentation for `/v1/projects/:projectId/devices/:deviceId/connect/websocket` and `/.../watch`.

**Action:** Add a static WebSocket protocol section to the API docs/reference describing frames, backfill, and events.
