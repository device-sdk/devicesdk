# @repo/typescript-config

## 0.0.1

### Patch Changes

- e299282: Baseline community, security, and licensing cleanup:
  - Added `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, and `SECURITY.md`.
  - Fixed root `README.md` tech-stack copy (website is Vue 3 + Vite SSG, not Hugo).
  - Replaced remaining `CLAUDE.md` references with `AGENTS.md` across docs and firmware readmes.
  - Updated `firmware/pico/IMPLEMENTATIONS.md` and `src/ca_cert.h` comments for the self-hosted era.
  - Added the AGPL-3.0-only license to every workspace `package.json` and copied `LICENSE` into `packages/core`, `packages/cli`, `packages/mcp`, and `packages/typescript-config`.
  - Excluded `examples/*` from the root `pnpm build` to avoid CLI-dependent example builds in the default task.
  - Removed `apps/server/openapi.json` from git, gitignored the generated file, and updated website-deploy triggers to rebuild it from server sources.
  - Hardened Docker defaults: `ALLOW_REGISTRATION=false`, `SECURE_COOKIES=true`, non-root runtime user, and a `/health` `HEALTHCHECK`.
  - Added GitHub issue/PR templates and `CODEOWNERS`.
  - Scoped Device WebSocket `versionId` lookup to the device (`device_id` filter).
  - Scoped CLI token revocation to the authenticated user (`user_id` filter).
