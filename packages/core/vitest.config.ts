import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
	test: {
		environment: "node",
		root: dir,
		include: ["tests/**/*.test.ts"],
		typecheck: {
			enabled: true,
			include: ["tests/**/*.test-d.ts"],
		},
	},
});
