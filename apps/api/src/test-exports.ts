/**
 * Test-only entry point — exports internal helpers for integration tests.
 *
 * This file is intentionally NOT the `main` in wrangler.jsonc and is NOT part
 * of the production Worker bundle. It is used exclusively by the vitest/miniflare
 * test environment via the TEST_DEVICE Durable Object binding in vitest.config.mts.
 *
 * Exports here bypass production guards (e.g. the __internal: key prefix) to let
 * tests seed and inspect internal state. Never add this file to wrangler.jsonc.
 */

export { TestDevice } from "./durableObjects/lib/testDevice";
