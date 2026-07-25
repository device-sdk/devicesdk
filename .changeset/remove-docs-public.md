---
"@devicesdk/core": patch
"@devicesdk/cli": patch
"@devicesdk/server": patch
"@devicesdk/website": patch
"@devicesdk/dashboard": patch
"@devicesdk/docs": patch
---

Remove the legacy `docs/public/` directory and the `apps/website` `/docs/` mount. Documentation now lives exclusively in `apps/docs` and is served from `https://docs.devicesdk.com`. The marketing site redirects all `/docs/*` URLs to the new subdomain with the path preserved, and the API reference stays on the main site at `/api/`. The server docs FTS index, README, and hardcoded docs links across the codebase are updated to point to the new docs location.
