# Open-Source Readiness Validation Checklist

Use this checklist to verify that each audit finding has been resolved before making the DeviceSDK repository public and open-source.

**Audit source:** [`open-source-readiness-audit.md`](./open-source-readiness-audit.md)

---

## How to use this file

1. Create a PR that addresses one or more findings.
2. Update the status column for each resolved item (`❌ TBD` → `🔄 In Progress` → `✅ Done`).
3. Run the validation command(s) listed in the "How to verify" column and paste the output or a summary into the PR description.
4. Do not mark an item `✅ Done` unless the verification command succeeds on a clean checkout.

---

## Phase 1 — Blockers

### 1. Root `pnpm build` succeeds
- **Status:** ❌ TBD
- **How to verify:**
  ```bash
  pnpm build
  ```
- **Pass criteria:** Command exits 0 with no build failures in any workspace package.
- **Notes:** Currently fails because `examples/basic` and `examples/esp32c3-clock` reject placeholder Wi-Fi credentials.

### 2. Published npm packages include a `LICENSE` file
- **Status:** ❌ TBD
- **How to verify:**
  ```bash
  ls packages/core/LICENSE packages/cli/LICENSE packages/mcp/LICENSE packages/typescript-config/LICENSE
  pnpm build --filter @devicesdk/core --filter @devicesdk/cli --filter @devicesdk/mcp
  tar -tzf packages/core/*.tgz 2>/dev/null | grep -E '^package/LICENSE$' || echo "LICENSE missing from tarball"
  ```
- **Pass criteria:** Each listed `LICENSE` file exists, and `pnpm pack` output includes `package/LICENSE`.

### 3. `apps/server/openapi.json` is up to date
- **Status:** ❌ TBD
- **How to verify:**
  ```bash
  cd apps/server
  cp openapi.json openapi.json.before
  bun run scripts/generate-openapi.ts
  diff -u openapi.json.before openapi.json
  rm openapi.json.before
  ```
- **Pass criteria:** Regeneration produces zero diff against the committed file.
- **CI gate:** Add a step that runs `bun run scripts/generate-openapi.ts` and fails if `git diff --exit-code apps/server/openapi.json` is non-zero.

### 4. No hardcoded firmware credentials in source
- **Status:** ❌ TBD
- **How to verify:**
  ```bash
  rg -i '(ssid|password|token|host|project|device).*\s*=\s*["\'][^"\']{3,}["\']' \
    firmware/esp32/main/config.h \
    firmware/pico/CMakeLists.txt \
    firmware/pico/main.cpp \
    firmware/esp32/main/devicesdk_main.c \
    apps/server/src/endpoints/devices/downloadFirmware.ts \
    apps/server/tests/e2e/firmware.test.ts
  ```
- **Pass criteria:** No literal credential values remain; only obvious placeholders like `YOUR_WIFI_SSID` or CMake variables. The server patch logic uses the new placeholder markers.

### 5. Docker Compose and `.env.example` defaults are secure
- **Status:** ❌ TBD
- **How to verify:**
  ```bash
  grep -E 'ALLOW_REGISTRATION|SECURE_COOKIES' docker-compose.yml apps/server/.env.example
  ```
- **Pass criteria:** `ALLOW_REGISTRATION=false` (with a comment that first user is still allowed during setup); `SECURE_COOKIES=false` only in `.env.example` with a prominent warning to enable it behind TLS.

### 6. Dockerfile is hardened
- **Status:** ❌ TBD
- **How to verify:**
  ```bash
  docker build -t devicesdk-audit .
  docker run --rm devicesdk-audit:latest id
  docker inspect devicesdk-audit:latest | jq '.[0].Config.Healthcheck'
  ```
- **Pass criteria:** Container runs as a non-root user; `docker inspect` shows a non-empty `Healthcheck` section; `/health` and `/ready` endpoints still respond.

### 7. Community docs exist
- **Status:** ❌ TBD
- **How to verify:**
  ```bash
  ls CONTRIBUTING.md CODE_OF_CONDUCT.md SECURITY.md
  ```
- **Pass criteria:** All three files exist and contain at least project-specific guidance (not just generic templates).

### 8. Root README describes the correct website stack
- **Status:** ❌ TBD
- **How to verify:**
  ```bash
  grep -iE 'hugo|vue|vite|ssg' README.md
  ```
- **Pass criteria:** No mention of "Hugo"; website is described as "Vue 3 + Vite SSG" or similar.

### 9. No stale `CLAUDE.md` references remain
- **Status:** ❌ TBD
- **How to verify:**
  ```bash
  rg -i 'CLAUDE\.md' --type md --type ts --type vue --type tsx --type js
  ```
- **Pass criteria:** Zero matches, or only in historical CHANGELOG entries that are clearly archival.

### 10. `firmware/pico/IMPLEMENTATIONS.md` is current or removed
- **Status:** ❌ TBD
- **How to verify:**
  ```bash
  grep -c 'api.devicesdk.com' firmware/pico/IMPLEMENTATIONS.md || true
  ```
- **Pass criteria:** Either the file is deleted, or `api.devicesdk.com` count is 0 and the document accurately describes the current self-hosted stack and existing ESP32 port.

### 11. GitHub templates and `CODEOWNERS` exist
- **Status:** ❌ TBD
- **How to verify:**
  ```bash
  ls .github/ISSUE_TEMPLATE .github/PULL_REQUEST_TEMPLATE.md .github/CODEOWNERS
  ```
- **Pass criteria:** At least bug-report and feature-request issue templates exist; a PR template exists; `CODEOWNERS` maps critical paths to maintainers.

### 12. Device WebSocket `versionId` is scoped to the device
- **Status:** ❌ TBD
- **How to verify:**
  ```bash
  rg -A 20 'versionId' apps/server/src/endpoints/devices/wsRoutes.ts
  ```
- **Pass criteria:** The query parameter `versionId` is validated against both `device_id` and `project_id` (not just `version_id`). Add a test in `apps/server/tests/e2e/` that proves a version from another device cannot be loaded.

### 13. CLI token revocation scopes by user
- **Status:** ❌ TBD
- **How to verify:**
  ```bash
  rg -A 15 'revokeToken' apps/server/src/endpoints/cli-auth/revokeToken.ts
  ```
- **Pass criteria:** The SQL `DELETE` includes `AND user_id = ?` (or equivalent) bound to the authenticated user's ID. Add a test proving User A cannot revoke User B's token.

---

## Phase 2 — Important

### 14. Self-hosting / Docker deployment guide exists
- **Status:** ❌ TBD
- **How to verify:**
  ```bash
  ls docs/public/guides/self-hosting.md
  ```
- **Pass criteria:** Document covers reverse proxies, HTTPS/TLS, `SECURE_COOKIES`, backups, and multi-server LAN considerations.

### 15. Authentication / security guide exists
- **Status:** ❌ TBD
- **How to verify:**
  ```bash
  ls docs/public/guides/security.md
  ```
- **Pass criteria:** Document explains local account model, first-user bootstrap risk, API token scoping, in-process script trust model, and `ALLOW_REGISTRATION`.

### 16. `examples/basic/README.md` describes the real API
- **Status:** ❌ TBD
- **How to verify:**
  ```bash
  grep -i 'Pico.gpio\|configureGpioInputMonitoring' examples/basic/README.md
  ```
- **Pass criteria:** `Pico.gpio()` is removed; `configureGpioInputMonitoring` is correctly described.

### 17. `TROUBLESHOOT.md` pre-refactor entries are flagged
- **Status:** ❌ TBD
- **How to verify:**
  ```bash
  head -20 TROUBLESHOOT.md
  ```
- **Pass criteria:** A clear archival header separates pre-self-host-refactor Cloudflare/Workers entries from current Bun/SQLite entries.

### 18. Package metadata is complete
- **Status:** ❌ TBD
- **How to verify:**
  ```bash
  node -e "const p=require('./package.json'); ['description','author','repository','bugs','homepage','keywords'].forEach(k=>console.log(k, !!p[k]))"
  ```
- **Pass criteria:** Root `package.json` and all workspace packages have `description`, `author`, `repository`, `bugs`, `homepage` where applicable; published packages also have `types`.

### 19. Docker publishing uses semver tags
- **Status:** ❌ TBD
- **How to verify:**
  ```bash
  grep -E 'semver|tags:|push:' .github/workflows/docker.yml
  ```
- **Pass criteria:** Workflow tags images with semver on `v*` tag pushes, in addition to `latest` and SHA.

### 20. Stale branches and worktrees are pruned
- **Status:** ❌ TBD
- **How to verify:**
  ```bash
  git branch -a | wc -l
  git worktree list
  ```
- **Pass criteria:** Only active feature branches and `main` remain; merged/stale worktrees are removed.

### 21. `.venv/` is gitignored
- **Status:** ❌ TBD
- **How to verify:**
  ```bash
  grep -E '^\.venv|^venv' .gitignore
  ```
- **Pass criteria:** `.gitignore` contains `.venv/` and `venv/`.

### 22. Dependency update automation is configured
- **Status:** ❌ TBD
- **How to verify:**
  ```bash
  ls .github/dependabot.yml renovate.json
  ```
- **Pass criteria:** Either Dependabot or Renovate is configured for at least npm/pnpm and GitHub Actions.

### 23. In-process script execution model is documented
- **Status:** ❌ TBD
- **How to verify:**
  ```bash
  rg -i 'in-process|sandbox|trust model|full server privileges' docs/public README.md SECURITY.md
  ```
- **Pass criteria:** User-facing docs clearly state that deployed device scripts run in-process with server privileges because it is a self-hosted, user-owned stack.

### 24. Legacy SHA-256 token fallback is removed or gated
- **Status:** ❌ TBD
- **How to verify:**
  ```bash
  rg -i 'legacyHashToken|legacy.*hash' apps/server/src
  ```
- **Pass criteria:** No legacy fallback remains, or it is gated behind a migration that re-hashes all legacy tokens on startup.

---

## Phase 3 — Minor

### 25. Lint warnings are addressed
- **Status:** ❌ TBD
- **How to verify:**
  ```bash
  pnpm lint
  ```
- **Pass criteria:** Zero warnings (or only documented, accepted exceptions).

### 26. `.gitignore` covers key material
- **Status:** ❌ TBD
- **How to verify:**
  ```bash
  grep -E '^\*\.pem|^\*\.key|^\*\.p12' .gitignore
  ```
- **Pass criteria:** Patterns for `*.pem`, `*.key`, `*.p12`, and `.venv/` are present.

### 27. GitHub Action versions are aligned
- **Status:** ❌ TBD
- **How to verify:**
  ```bash
  rg 'actions/checkout@v' .github/workflows
  ```
- **Pass criteria:** All workflows use the same major version of `actions/checkout`.

### 28. Workflows have timeouts
- **Status:** ❌ TBD
- **How to verify:**
  ```bash
  rg 'timeout-minutes' .github/workflows
  ```
- **Pass criteria:** `release.yml` and `docker.yml` (and ideally all workflows) define `timeout-minutes`.

### 29. Optional: per-file SPDX headers
- **Status:** ❌ TBD
- **How to verify:**
  ```bash
  rg -c 'SPDX-License-Identifier' packages/core/src apps/server/src packages/cli/src packages/mcp/src
  ```
- **Pass criteria:** If the project adopts per-file headers, count matches total source files in those directories.

### 30. Optional: top-level `NOTICE` or `ATTRIBUTIONS.md`
- **Status:** ❌ TBD
- **How to verify:**
  ```bash
  ls NOTICE ATTRIBUTIONS.md
  ```
- **Pass criteria:** File exists and lists vendored code (picojson, pico_sdk_import) and dependency license summary.

---

## Final sign-off

Before making the repository public, a maintainer should run through this checklist and confirm:

- [ ] All Phase 1 blockers are `✅ Done` and verified.
- [ ] Phase 2 items are either `✅ Done` or explicitly accepted as post-launch debt with issues filed.
- [ ] Phase 3 items are triaged.
- [ ] `pnpm build`, `pnpm check-types`, `pnpm test --filter @devicesdk/server test:e2e`, and `pnpm test --filter @devicesdk/cli` pass on a clean checkout.
- [ ] `docker build -t devicesdk .` succeeds and the container passes its healthcheck.
- [ ] Branch protection is enabled in the GitHub UI for `main`.
