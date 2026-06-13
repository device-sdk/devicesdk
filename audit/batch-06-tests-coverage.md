# Audit Batch 06 — Tests, Coverage & Duplication

These items close testing gaps and remove redundant code.

## 1. Add tests for `packages/mcp`

**File:** `packages/mcp/src/index.ts`

`packages/mcp` currently has zero tests. It spawns the `devicesdk` CLI and parses JSON; regressions in the AI-agent surface are not caught.

**Action:** Add unit tests for `runCli`, `asToolResponse`, and tool listing.

---

## 2. Remove duplicate CLI test files

**Files:**
- `packages/cli/tests/whoami.test.ts`
- `packages/cli/tests/logout.test.ts`
- `packages/cli/src/commands/whoami.test.ts`
- `packages/cli/src/commands/logout.test.ts`

The legacy `packages/cli/tests/*.test.ts` files test the same commands as the newer `src/commands/*.test.ts` files, increasing maintenance burden.

**Action:** Delete the legacy `packages/cli/tests/whoami.test.ts` and `packages/cli/tests/logout.test.ts` in favor of the newer tests.

---

## 3. Add a lint script to `packages/mcp`

**Files:** `packages/mcp/package.json`, root `package.json`

`@devicesdk/mcp` has no `lint` script and is not covered by the root lint workflow.

**Action:** Add a `lint` script to `@devicesdk/mcp` and ensure root linting includes it.

---

## 4. Improve coverage for low-coverage server files

**Files:**
- `apps/server/src/foundation/baseRoute.ts`
- `apps/server/src/spa.ts`
- `apps/server/src/foundation/deviceStatus.ts`
- `apps/server/src/foundation/logger.ts`
- `apps/server/src/endpoints/tokens/listCliTokens.ts`

These files have notably low line/function coverage in the current test:coverage report.

**Action:** Add tests for the ZodError branch in `baseRoute.ts`, file-serving/index.html branches in `spa.ts`, the catch path in `deviceStatus.ts`, and the result mapping path in `listCliTokens.ts`.
