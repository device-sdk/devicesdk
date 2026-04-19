---
"@devicesdk/api": patch
---

Add `openapi` and `build` scripts that generate a static `openapi.json` via `npx chanfana` during the Turbo build graph. Enables the marketing website to serve an interactive Swagger UI at `/api/docs` sourced from the live schema, without exposing the API's auth-gated runtime docs endpoint.
