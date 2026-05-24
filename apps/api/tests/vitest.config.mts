import path from "node:path";
import {
	cloudflareTest,
	readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const migrationsPath = path.join(__dirname, "..", "migrations");
const wranglerConfigPath = path.join(__dirname, "..", "wrangler.jsonc");
const migrations = await readD1Migrations(migrationsPath);

export default defineConfig({
	esbuild: {
		target: "esnext",
	},
	plugins: [
		cloudflareTest({
			wrangler: {
				configPath: wranglerConfigPath,
			},
			miniflare: {
				compatibilityDate: "2026-04-24",
				compatibilityFlags: ["experimental", "nodejs_compat"],
				bindings: {
					MIGRATIONS: migrations,
					ENV: "production",
					SALT_TOKEN: "test-salt-token",
				},
				durableObjects: {
					// TestDevice exposes test-only helpers (seedCronStorage,
					// getScheduledAlarmTime) that are not on the production Device class.
					// It must be exported from the main worker script so miniflare can
					// resolve it here; see src/index.ts for the corresponding export.
					TEST_DEVICE: "TestDevice",
				},
			},
		}),
	],
	test: {
		setupFiles: ["./tests/apply-migrations.ts", "./tests/setup-test-data.ts"],
		// Unit tests live in tests/unit/ and run under a node environment via
		// tests/vitest.unit.config.mts — they don't (and can't) run under the
		// Cloudflare Workers pool because they vi.mock modules that the pool's
		// bundling doesn't intercept.
		exclude: ["tests/unit/**", "node_modules/**"],
		coverage: {
			provider: "istanbul",
			reporter: ["text", "text-summary", "json-summary", "html", "lcov"],
			reportsDirectory: "./coverage",
			include: ["src/**/*.ts"],
			exclude: ["src/types.d.ts"],
			// Baseline measured 2026-05-10: lines 75.52%, statements 75.15%,
			// functions 83.05%, branches 63.63%. Thresholds set ~5pts below to
			// give a regression buffer while keeping the gate meaningful.
			thresholds: {
				lines: 70,
				statements: 70,
				functions: 75,
				branches: 55,
			},
		},
	},
});
