---
"@devicesdk/core": patch
"@devicesdk/cli": patch
"@devicesdk/server": patch
"@devicesdk/dashboard": patch
---

Self-host release readiness pass

- Added `KNOWN_NOT_ISSUES.md` documenting the npm Trusted Publishers release setup.
- Fixed dashboard token snippet and redirect allow-list for custom self-hosted origins.
- Added `apps/server/.env.example` and a `TRUST_PROXY` setting so rate limiting safely handles reverse proxies.
- Removed stale cloud-era wording from `@devicesdk/core`, the CLI `init` template, and `examples/AGENTS.md`.
- Corrected OTA firmware claims in docs until the feature ships.
- Updated `TROUBLESHOOT.md` to reference self-hosted dashboard URLs and generic proxy/CDN guidance.
- Added `data/` directories to `.gitignore`, pinned the Bun version in `Dockerfile` to `1.3.14`, and renamed `durableObjectStub.ts` to `deviceHandle.ts`.
- Documented the intentionally skipped migration `0003` in `apps/server/migrations/README.md`.
