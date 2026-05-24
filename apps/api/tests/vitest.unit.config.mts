import { defineConfig } from "vitest/config";

// Node-environment vitest config for pure unit tests that don't need the
// Cloudflare Workers runtime (and that need vi.mock to work the normal way,
// which the workers pool's bundling makes awkward).
//
// Workers-pool integration tests live in `tests/integration/` and use
// `vitest.config.mts`. Files under `tests/unit/` use this config.
export default defineConfig({
	test: {
		environment: "node",
		globals: true,
		include: ["tests/unit/**/*.test.ts"],
	},
});
