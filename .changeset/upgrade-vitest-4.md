---
"@devicesdk/api": patch
"@devicesdk/dashboard": patch
---

Upgrade `vitest` 3.2.4 → 4.1.5 and `@cloudflare/vitest-pool-workers` 0.11.1 → 0.15.2 across the monorepo:

- **`apps/api/tests/vitest.config.mts`** rewrite for the new pool-workers shape: imports `defineConfig` from `vitest/config` and the `cloudflareTest` Vite plugin from `@cloudflare/vitest-pool-workers` (the `/config` subpath was removed, and `defineWorkersConfig` no longer exists). The wrangler `configPath` is now resolved relative to the project root, so it's passed as an absolute path. Test miniflare `compatibilityDate` synced to `2026-04-24` to match `wrangler.jsonc`.
- **Test isolation regression** caused by removal of `isolatedStorage`: D1/KV/Cache writes now persist between `it()` blocks within a file. Added per-suite cleanup in `tokens.test.ts`, `scripts.test.ts` (with the inner `beforeAll` script-upload blocks converted to `beforeEach` so they re-seed after the wipe), and `devices.test.ts`. `blockList.test.ts` and `rateLimitBlock.test.ts` now also purge the matching `caches.default` Request after deleting from KV — `TieredCache` writes to both layers, and L1 staleness was tripping the path-scoped middleware test.
- **`packages/cli/src/commands/logs.test.ts`**: vitest 4 rejects arrow-function implementations passed to `vi.fn()` when the mock is invoked with `new`. The `ws` mock now references a top-level `function` declaration (which biome leaves untouched) instead of an inline arrow.
- **`apps/dashboard/package.json`**: `vitest` aligned to the workspace catalog so all three test-using packages share one version.
- **catalog bumps** in `pnpm-workspace.yaml`: `vitest`/`@vitest/runner`/`@vitest/coverage-istanbul`/`@vitest/snapshot` → `^4.1.5`, `wrangler` → `^4.87.0`. `@cloudflare/workers-types` → `^4.20260501.1` in `apps/api`.

No production-runtime behavior changes; this is dev-tooling only.
