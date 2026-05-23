---
"@devicesdk/api": patch
"@devicesdk/core": patch
"@devicesdk/dashboard": patch
"@devicesdk/website": patch
---

Infra and quality improvements (no user-visible changes):

- **API metrics** — emit Analytics Engine data points for command RPC latency, user-script init time, and Worker Loader failures. New `ANALYTICS` binding declared in `apps/api/wrangler.jsonc` (top-level + `env.production`); thin wrapper at `apps/api/src/foundation/analytics.ts` with three event kinds (`command_rpc`, `script_init`, `loader_failure`) using `event_kind` as the index for cross-cutting queries. Safe with the binding undefined (local dev / tests no-op).
- **`@devicesdk/core` unit tests** — add `vitest` to the package with runtime tests for `I2cDevice` and `SSD1306` (constructor defaults, the `esp32c3OledVariant` factory, pixel ops, drawing primitives, sparse encoding) and type-level guards for the `DeviceCommand` / `DeviceResponse` discriminated unions, including the `payload.mode`-discriminated `PinStateUpdate`. Wired into root `pnpm test` and `turbo run test`.
- **Pico firmware host tests in CI** — the existing gtest suite under `firmware/pico/test/` (base64, i2c command handlers, display update, ws client) is now built and run in `.github/workflows/firmware-pico.yml`, mirroring the ESP32 pattern. The `build` job depends on `unit-tests` so a regression blocks the firmware build.
- **Workflow consolidation** — `dashboard-tests.yml` is merged into `ci.yml` as `Component Tests` and `E2E Tests` jobs (gated on PR events, matching prior behavior). Old workflow file removed. Branch protection: required-status-check names change from `Dashboard Tests / *` to `CI / *` — update settings post-merge.
- **PR preview deploys** — new `.github/workflows/preview-deploys.yml` publishes per-PR preview URLs for the dashboard and website using `wrangler versions upload --tag pr-N`, gated on changed paths. Each preview posts (and updates) a sticky PR comment with the URL. Website's `preview_urls` flag flipped to `true` to enable preview URL emission; production traffic still routes via the custom domain.
