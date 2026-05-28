---
"@devicesdk/api": patch
"@devicesdk/cli": patch
"@devicesdk/core": patch
"@devicesdk/dashboard": patch
---

Audit cleanup (correctness, tech-debt, deps, CI):

- **dashboard:** fix a watcher-WebSocket reconnect storm in `useDeviceStream` — `onerror`+`onclose` both fired the reconnect handler, scheduling duplicate reconnects and leaking the first timer (which `disconnect()` could then no longer cancel). Each socket now reconnects at most once per drop.
- **api:** script-validation `400`s now include the canonical `error` string (alongside the structured `errors`), so `devicesdk deploy` surfaces the real validation messages instead of a generic "Request failed with status 400".
- **cli:** `dev` now scans for a genuinely-free fallback port instead of picking one random port that could itself be in use; the Linux `lsblk` volume parser no longer truncates labels/mountpoints containing `=`; `logs --tail` bounds its `seenIds` dedup set in long-running sessions.
- **core/api/cli:** centralized the script-size limit as `MAX_SCRIPT_SIZE_BYTES` in `@devicesdk/core`, consumed by the API upload validation and the CLI pre-deploy check (one source of truth).
- **firmware (esp32 + pico):** fix `i2c_write` on real hardware — the handlers required a base64 string, but the SDK sends (and `i2c_batch_write`/SPI accept) a hex-string array, so writes were silently dropped on a device. Both handlers now parse the hex-string array.
- **dashboard:** removed unused Quasar scaffolding; de-duplicated the `normalizeTimestamp`/`formatDate` helpers into `lib/time.ts`.
- **api (security):** bumped `hono` 4.10.7 → 4.12.23 (clears several advisories; the affected JWT middleware is unused) and pinned `chanfana` to exact `3.3.0` to match its patch target. Also bumped `@sentry/cloudflare` and (dashboard) `axios` to latest.
- **repo/CI:** untracked the vendored ESP-IDF `managed_components/` (re-fetched at build time via `idf_component.yml`); added minimal `permissions: { contents: read }` to `ci.yml`/`deploy.yml`; SHA-pinned all third-party GitHub Actions; bumped `turbo`; reconciled the ESP-IDF version in docs to match CI (`v5.5.1`).
