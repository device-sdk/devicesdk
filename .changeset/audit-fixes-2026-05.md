---
"@devicesdk/api": patch
"@devicesdk/cli": patch
"@devicesdk/dashboard": patch
---

Audit cleanup (correctness, tech-debt, deps):

- **dashboard:** fix a watcher-WebSocket reconnect storm in `useDeviceStream` — `onerror`+`onclose` both fired the reconnect handler, scheduling duplicate reconnects and leaking the first timer (which `disconnect()` could then no longer cancel). Each socket now reconnects at most once per drop.
- **api:** script-validation `400`s now include the canonical `error` string (alongside the structured `errors`), so `devicesdk deploy` surfaces the real validation messages instead of a generic "Request failed with status 400".
- **cli:** `dev` now scans for a genuinely-free fallback port instead of picking one random port that could itself be in use; the Linux `lsblk` volume parser no longer truncates labels/mountpoints containing `=`; `logs --tail` bounds its `seenIds` dedup set in long-running sessions.
- **api:** centralized the script-size limit as `MAX_SCRIPT_SIZE_BYTES` in `foundation/consts.ts`; removed dead OpenAPI/stale comments.
- **dashboard:** removed unused Quasar scaffolding (`ExampleComponent.vue`, `EssentialLink.vue`, `components/models.ts`) and de-duplicated the `normalizeTimestamp`/`formatDate` helpers into `lib/time.ts`.
- **api (security):** bumped `hono` 4.10.7 → 4.12.23 (clears several advisories; the affected JWT middleware is unused) and pinned `chanfana` to exact `3.3.0` to match its patch target.
