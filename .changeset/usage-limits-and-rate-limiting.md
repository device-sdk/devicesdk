---
"@devicesdk/api": minor
---

Add tier-based usage limits, per-user API rate limiting, and abuse prevention. Introduces Free/Paid plan system: resource limits on project, device, script version, API token, and env var creation; per-user rate limiting (60/120 req/min); per-device daily message counting in Durable Objects with firmware support for rate-limit reconnect delays. Enriches /v1/user/me with plan, limits, and usage fields.
