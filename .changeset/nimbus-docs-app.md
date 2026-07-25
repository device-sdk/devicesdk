---
"@devicesdk/docs": minor
---

Add a new Nimbus-based documentation app (`apps/docs`) and deploy it to `docs.devicesdk.com` as a Cloudflare Workers static site. All existing documentation pages from `docs/public` are copied into `apps/docs/src/content/docs` with rewritten internal links (dropping the `/docs/` prefix) and mapped to the existing sidebar order. The existing website at `devicesdk.com/docs` is left untouched for this initial phase.
