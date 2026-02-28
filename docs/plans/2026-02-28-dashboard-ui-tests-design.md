# Dashboard UI Testing Design

**Date**: 2026-02-28
**Status**: Approved

## Goal

Add UI tests to `apps/dashboard` so that coding agents can verify UI changes by running a single command and getting clear pass/fail output.

## Architecture

Two testing layers:

| Layer | Tool | Command | Tests |
|-------|------|---------|-------|
| Component | Vitest + @vue/test-utils | `pnpm test:unit --filter @devicesdk/dashboard` | Individual component behavior |
| E2E | Playwright (headless Chromium) | `pnpm test:e2e --filter @devicesdk/dashboard` | Full user flows against real local API |

Both via: `pnpm test --filter @devicesdk/dashboard`

## E2E Tests (Playwright)

### Infrastructure

**Global setup** (`tests/e2e/global-setup.ts`):
1. Apply D1 migrations: `wrangler d1 migrations apply DB --local`
2. Seed test data (user, session, projects) via `wrangler d1 execute DB --local`
3. Start API dev server (wrangler dev, port 8787)
4. Start dashboard dev server (quasar dev, port 9000)
5. Wait for both servers to respond

**Global teardown** (`tests/e2e/global-teardown.ts`):
- Kill API and dashboard server processes

### Auth Bypass

Google OAuth cannot run headlessly. Instead, inject a session cookie directly into Playwright's browser context.

The API's auth middleware (`src/foundation/auth.ts`) reads the `devicesdk-session` cookie and looks up the token in the `user_sessions` table. We seed a known token and inject the matching cookie:

```typescript
// auth.setup.ts — Playwright setup project
setup('authenticate', async ({ page }) => {
  await page.context().addCookies([{
    name: 'devicesdk-session',
    value: 'test-session-token',
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    secure: false,
  }]);
  await page.context().storageState({ path: 'tests/e2e/.auth/session.json' });
});
```

All test projects use `storageState: 'tests/e2e/.auth/session.json'`.

### Test Data

Seeded via SQL in global setup (mirrors `apps/api/tests/setup-test-data.ts`):

- **User**: `user-1` (Alice Johnson, alice@example.com)
- **Session**: token `test-session-token`, expires 24h from setup
- **Projects**: `proj-1` (Smart Home), `proj-2` (Weather Station) — both owned by user-1

### E2E Test Coverage (initial set)

1. **Login page** — renders sign-in button, unauthenticated users redirected here
2. **Projects page** — lists seeded projects, create project dialog opens/submits/validates
3. **Project details** — shows project info, lists devices, create device dialog works
4. **Device details** — shows device info and script section
5. **Tokens page** — lists tokens, create/delete token
6. **Navigation** — sidebar links work, breadcrumbs render

## Component Tests (Vitest + Vue Test Utils)

### Infrastructure

**Config** (`tests/unit/vitest.config.ts`):
- `@vitejs/plugin-vue` for SFC compilation
- `jsdom` environment
- Path alias `@/*` → `src/*` (matches Quasar config)

**Setup** (`tests/unit/setup.ts`):
- Install Quasar test plugins (Notify, etc.)
- Global stubs for router/store if needed

### Mock Strategy

- Mock `src/services/api.service.ts` with `vi.mock()` — return canned responses
- Mount components with `@vue/test-utils` `mount()` or `shallowMount()`
- For Quasar components, use `installQuasarPlugin()` from `@quasar/quasar-app-extension-testing-unit-vitest`

### Component Test Coverage (initial set)

1. **CreateProjectDialog** — form validation, submit with valid data, error display
2. **CreateDeviceDialog** — form validation, board type selection, submit
3. **CreateTokenDialog** — form validation, token display after creation
4. **MainLayout** — navigation items render, user info displays

## File Structure

```
apps/dashboard/
├── tests/
│   ├── e2e/
│   │   ├── playwright.config.ts
│   │   ├── global-setup.ts
│   │   ├── global-teardown.ts
│   │   ├── auth.setup.ts
│   │   ├── .auth/                  # gitignored
│   │   ├── projects.spec.ts
│   │   ├── project-details.spec.ts
│   │   ├── device-details.spec.ts
│   │   ├── tokens.spec.ts
│   │   └── navigation.spec.ts
│   └── unit/
│       ├── vitest.config.ts
│       ├── setup.ts
│       ├── CreateProjectDialog.spec.ts
│       ├── CreateDeviceDialog.spec.ts
│       └── CreateTokenDialog.spec.ts
├── package.json                    # Updated scripts
```

## Package.json Script Changes

```json
{
  "scripts": {
    "test": "pnpm test:unit && pnpm test:e2e",
    "test:unit": "vitest run --config tests/unit/vitest.config.ts",
    "test:e2e": "playwright test --config tests/e2e/playwright.config.ts"
  }
}
```

## Dependencies to Add

**devDependencies**:
- `@playwright/test` — E2E test runner
- `vitest` — component test runner
- `@vue/test-utils` — Vue component mounting
- `@vitejs/plugin-vue` — SFC compilation for Vitest
- `jsdom` — DOM environment for Vitest
- `@quasar/quasar-app-extension-testing-unit-vitest` — Quasar test helpers (if available/compatible)

## Agent Workflow

```bash
# Quick component check (~2s):
pnpm test:unit --filter @devicesdk/dashboard

# Full E2E check (~30s):
pnpm test:e2e --filter @devicesdk/dashboard

# Everything:
pnpm test --filter @devicesdk/dashboard
```

Output is standard test runner format — clear pass/fail per test name.
