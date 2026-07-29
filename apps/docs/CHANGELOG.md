# @devicesdk/docs

## 0.1.1

### Patch Changes

- 99ed8dc: Remove the legacy `docs/public/` directory and the `apps/website` `/docs/` mount. Documentation now lives exclusively in `apps/docs` and is served from `https://docs.devicesdk.com`. The marketing site redirects all `/docs/*` URLs to the new subdomain with the path preserved, and the API reference stays on the main site at `/api/`. The server docs FTS index, README, and hardcoded docs links across the codebase are updated to point to the new docs location.

## 0.1.0

### Minor Changes

- 005a049: Add a new Nimbus-based documentation app (`apps/docs`) and deploy it to `docs.devicesdk.com` as a Cloudflare Workers static site. All existing documentation pages from `docs/public` are copied into `apps/docs/src/content/docs` with rewritten internal links (dropping the `/docs/` prefix) and mapped to the existing sidebar order. The existing website at `devicesdk.com/docs` is left untouched for this initial phase.
