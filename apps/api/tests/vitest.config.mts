import path from "node:path";
import {
	defineWorkersConfig,
	readD1Migrations,
} from "@cloudflare/vitest-pool-workers/config";

const migrationsPath = path.join(__dirname, "..", "migrations");
const migrations = await readD1Migrations(migrationsPath);

export default defineWorkersConfig({
	esbuild: {
		target: "esnext",
	},
	test: {
		setupFiles: ["./tests/apply-migrations.ts", "./tests/setup-test-data.ts"],
		poolOptions: {
			workers: {
				isolatedStorage: true,
				wrangler: {
					configPath: "../wrangler.jsonc",
				},
				miniflare: {
					compatibilityDate: "2025-12-02",
					compatibilityFlags: ["experimental", "nodejs_compat"],
					bindings: {
						MIGRATIONS: migrations,
						ENV: "production",
						SALT_TOKEN: "test-salt-token",
					},
					durableObjects: {
						// TestDevice exposes test-only helpers (seedCronStorage,
						// getScheduledAlarmTime) that are not on the production Device class.
						TEST_DEVICE: "TestDevice",
					},
				},
			},
		},
	},
});
