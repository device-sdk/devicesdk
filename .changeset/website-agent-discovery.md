---
"@devicesdk/website": patch
---

Add agent-discovery metadata on the marketing site:

- `Link` response headers on `/` (RFC 8288) pointing to `api-catalog`, `service-desc` (OpenAPI schema), and `service-doc` (Swagger UI).
- New `/.well-known/api-catalog` resource (RFC 9727) served as `application/linkset+json`, listing the REST API's OpenAPI schema and documentation URLs.

Implemented via a static `apps/website/static/_headers` file (honored by Cloudflare Workers Assets) and a static linkset JSON at `apps/website/static/.well-known/api-catalog`.

Also collapse `robots.txt` to a single wildcard `User-agent: *` group with a `Content-Signal: ai-train=yes, search=yes, ai-input=yes` line, replacing the per-bot enumeration. Stance is unchanged — fully open to every crawler, AI included.
