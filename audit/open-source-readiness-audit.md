# DeviceSDK Open-Source Readiness Audit

**Date:** 2026-06-19  
**Audited commit:** `2961dac` (`docs(website): auto-generate sidebar, add prev/next, and fix navigation gaps`)  
**Verdict:** NOT READY for public release — several blockers must be resolved first.

This audit was performed with parallel subagents covering legal/licensing, security, code quality/tests, documentation, build/runtime, Git/CI, community metadata, and API/auth/runtime correctness.

---

## TL;DR: Must-Fix Blockers

1. **Hardcoded credentials in firmware source** — Wi-Fi SSID/password and API token placeholders are baked into ESP32/Pico source and tests.
2. **`pnpm build` fails out of the box** — examples refuse to build with unconfigured Wi-Fi placeholders.
3. **Published npm packages ship without a `LICENSE` file** despite `files` claiming one.
4. **Committed `apps/server/openapi.json` is stale** (≈3.5k line diff on regeneration).
5. **Missing baseline community docs** — `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`.
6. **Root README is wrong** — still says website is "Hugo + Tailwind"; it is Vue 3 + Vite SSG.
7. **Docs still reference a non-existent `CLAUDE.md`** — should be `AGENTS.md`.
8. **`firmware/pico/IMPLEMENTATIONS.md` is severely outdated** — describes the old hosted `api.devicesdk.com` era.
9. **Docker defaults are insecure** — `ALLOW_REGISTRATION=true` + `SECURE_COOKIES=false`.
10. **Docker image runs as root with no `HEALTHCHECK`**.
11. **No GitHub issue/PR templates or `CODEOWNERS`**.
12. **Device WebSocket `versionId` lookup is not scoped to the device** — version confusion risk.
13. **CLI token revocation is not scoped to the authenticated user**.

See [`open-source-readiness-validation.md`](./open-source-readiness-validation.md) for a per-item checklist on how to verify each finding is resolved.

---

## Findings by Category

### Legal & Licensing
| Severity | Finding |
|---|---|
| **BLOCKER** | `packages/core`, `packages/cli`, `packages/mcp` list `"LICENSE"` in `files`, but no `LICENSE` file exists in those directories. Published tarballs will violate AGPL distribution requirements. |
| **BLOCKER** | `packages/typescript-config/package.json` says `"SEE LICENSE IN LICENSE"` but has no `LICENSE` file. |
| IMPORTANT | `examples/*` have no `license` field; they should carry `AGPL-3.0-only`. |
| IMPORTANT | 332 of 334 source files lack license/copyright headers (only 2 test files have SPDX headers). |
| MINOR | Consider adding a top-level `NOTICE`/`ATTRIBUTIONS.md` for vendored BSD/picojson and dependency bundles. |
| MINOR | `node-forge` is dual BSD-3-Clause OR GPL-2.0; project must rely on BSD side. `sharp-libvips` (LGPL) and `lightningcss` (MPL) are build-time only but need notice review. |

### Security
| Severity | Finding |
|---|---|
| **BLOCKER** | Hardcoded firmware credentials in `firmware/esp32/main/config.h`, `firmware/pico/CMakeLists.txt`, `firmware/pico/main.cpp`, `firmware/esp32/main/devicesdk_main.c`, `apps/server/src/endpoints/devices/downloadFirmware.ts`, and `apps/server/tests/e2e/firmware.test.ts`. Replace with build-time inputs and obvious placeholders. |
| **BLOCKER** | Docker Compose + `.env.example` default to `ALLOW_REGISTRATION=true` and `SECURE_COOKIES=false`. Internet-exposed installs will allow arbitrary signup and insecure cookies. |
| IMPORTANT | Docker image downloads firmware from GitHub Releases without pinned version or checksum verification. |
| IMPORTANT | In-process script execution (`scriptHost.ts`) runs user code with full server privileges; must be documented loudly as the self-hosted trust model. |
| IMPORTANT | Device WebSocket upgrade accepts arbitrary `versionId` not scoped to the device. |
| IMPORTANT | CLI token revoke does not filter by authenticated `user_id`. |
| IMPORTANT | Legacy unsalted SHA-256 token hash fallback remains active; consider migrating/removing. |
| MINOR | MCP docs search fetches `https://devicesdk.com/llms.txt` — unexpected outbound call for self-hosted stack. |
| MINOR | `.gitignore` lacks generic patterns for `*.pem`, `*.key`, `*.p12`, `.venv`. |

### Code Quality & Tests
| Severity | Finding |
|---|---|
| **BLOCKER** | `pnpm build` from root fails because `examples/basic` and `examples/esp32c3-clock` reject placeholder Wi-Fi credentials. |
| IMPORTANT | Default server test command runs only 22 tests; the 301-test comprehensive suite is behind `test:e2e`. |
| IMPORTANT | `apps/server/src/runtime/deviceSession.ts` is 815 LOC, exceeding the ~700 LOC standard. |
| IMPORTANT | Root `pnpm lint` uses `--write` and is not filter-aware; it auto-formats packages even when filtered. |
| IMPORTANT | Dashboard unit tests run without Quasar plugins registered, producing many warnings. |
| IMPORTANT | Bun API (`bun:sqlite`) appears in dashboard e2e test code outside `apps/server`. |
| MINOR | `apps/server/src/db/bunSqliteQB.ts` uses `any`; `packages/core` has Biome-flagged `{}` banned types. |
| MINOR | One Biome warning in `batchUpload.ts` (`newDevice.results!`). |

### Build & Runtime
| Severity | Finding |
|---|---|
| **BLOCKER** | `apps/server/openapi.json` is stale; regeneration produces a 6.6k-line diff. |
| IMPORTANT | Dockerfile runs as root and has no `HEALTHCHECK`. |
| IMPORTANT | `docker-compose.yml` uses floating `latest` tag and has no healthcheck. |
| IMPORTANT | `apps/server/.env.example` is missing `API_TOKEN_SECRET` and `LOG_FILE`. |
| IMPORTANT | `pnpm dev --filter @devicesdk/server` does not pass through `DATA_DIR`/`MDNS_ENABLED` due to missing `passThroughEnv` in `turbo.json`. |
| OK | Production package builds succeed when filtered. Docker image builds. Server starts and applies migrations. |

### Documentation
| Severity | Finding |
|---|---|
| **BLOCKER** | Missing `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`. |
| **BLOCKER** | Root `README.md` incorrectly describes website as "Hugo + Tailwind". |
| **BLOCKER** | `docs/public/cli/init.md`, `docs/public/changelog.md` claim `devicesdk init` scaffolds `CLAUDE.md` — it does not. |
| **BLOCKER** | `firmware/pico/IMPLEMENTATIONS.md` references old `api.devicesdk.com` and treats ESP32 as a future port. |
| IMPORTANT | `TROUBLESHOOT.md` mixes pre-refactor Cloudflare/Workers-era notes without an archival disclaimer. |
| IMPORTANT | No dedicated self-hosting/Docker deployment guide. |
| IMPORTANT | No dedicated authentication/security guide. |
| IMPORTANT | `examples/basic/README.md` describes non-existent `Pico.gpio()` API. |
| MINOR | CLI index page omits some commands; no `devicesdk env` reference page. |

### Git, CI & Community Metadata
| Severity | Finding |
|---|---|
| **BLOCKER** | No `.github/ISSUE_TEMPLATE/`, `.github/PULL_REQUEST_TEMPLATE.md`, or `.github/CODEOWNERS`. |
| IMPORTANT | Branch protection is documented but not configured in repo; must be done in GitHub UI before going public. |
| IMPORTANT | Docker publishing only tags `latest` + SHA; no semver tags. |
| IMPORTANT | Many stale local branches and worktrees should be pruned. |
| IMPORTANT | `.github/workflows/firmware-esp32.yml` creates `.venv` at repo root; `.gitignore` doesn't cover it. |
| IMPORTANT | No Dependabot/Renovate configured for security updates. |
| MINOR | `actions/checkout` version inconsistency (`v4` vs `v6`). |
| MINOR | Workflows lack `timeout-minutes`. |

### Package Metadata
| Severity | Finding |
|---|---|
| IMPORTANT | Root `package.json` lacks `description`, `author`, `repository`, `bugs`, `homepage`, `keywords`. |
| IMPORTANT | Published packages lack top-level `types` field. |
| IMPORTANT | Inconsistent `author` metadata across packages. |
| IMPORTANT | `examples/temperature-to-discord` package name is `@devicesdk/example-temperature` (doesn't match directory). |
| MINOR | Several private apps lack `repository`/`homepage`/`bugs`. |

---

## Positive Findings

- **AGPL-3.0-only license is present and correctly declared** in most package.json files.
- **No telemetry or phone-home** in the server; usage metrics stay in local SQLite.
- **No committed secrets** in the working tree or recent git history.
- **Strong credential handling**: argon2id password hashing, constant-time verification, HMAC-SHA-256 API/CLI token hashes, `0o600` permissions on credential files.
- **Auth middleware is well-structured**: Bearer, session cookie, CLI `dsdk_*`, and API token hash paths are cleanly separated.
- **Comprehensive test coverage exists** when the full suite is run (301 server e2e tests + 224 CLI tests).
- **Strict TypeScript** is enabled across all packages.
- **mDNS responder** only advertises hostname/IP, no credentials.
- **Path traversal protection** is present in blob storage.
- **Rate limiting** is applied to auth endpoints.
- **Changeset tooling** is configured for all published and private-with-changelog packages.

---

## Recommended Pre-Launch Action Plan

### Phase 1 — Blockers (do not go public without these)
1. Fix or exclude examples from root `pnpm build`.
2. Copy the root `LICENSE` into `packages/core/`, `packages/cli/`, `packages/mcp/`, and `packages/typescript-config/`.
3. Regenerate and commit `apps/server/openapi.json`; add a CI drift check.
4. Replace hardcoded firmware credentials with build-time placeholders; update patch logic and tests.
5. Change Docker Compose / `.env.example` defaults to `ALLOW_REGISTRATION=false` with a first-user setup note, and document `SECURE_COOKIES=true` for TLS.
6. Add `HEALTHCHECK` and non-root user to Dockerfile; add compose healthcheck.
7. Add `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`.
8. Fix root README website stack description.
9. Replace all `CLAUDE.md` references with `AGENTS.md` or correct docs URLs.
10. Rewrite or remove `firmware/pico/IMPLEMENTATIONS.md`.
11. Add `.github/ISSUE_TEMPLATE/`, `.github/PULL_REQUEST_TEMPLATE.md`, and `.github/CODEOWNERS`.
12. Scope device WebSocket `versionId` lookup to the device.
13. Scope CLI token revocation to the authenticated user.

### Phase 2 — Important polish
14. Add dedicated self-hosting and auth/security guides.
15. Fix `examples/basic/README.md` API description.
16. Add archival disclaimer to old Cloudflare entries in `TROUBLESHOOT.md`.
17. Complete root and package metadata (`description`, `author`, `repository`, etc.).
18. Add semver Docker tags.
19. Prune stale branches/worktrees; add `.venv/` to `.gitignore`.
20. Add Dependabot/Renovate.
21. Document the in-process script execution trust model.
22. Remove or migrate legacy SHA-256 token fallback.

### Phase 3 — Minor cleanup
23. Address remaining lint warnings.
24. Add generic cert/key patterns to `.gitignore`.
25. Align `actions/checkout` versions; add workflow timeouts.
26. Consider per-file SPDX headers and a top-level `NOTICE` file.
