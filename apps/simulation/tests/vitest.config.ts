import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const dir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("../src", import.meta.url)),
		},
	},
	test: {
		environment: "node",
		root: dir,
		include: ["**/*.spec.ts"],
		coverage: {
			provider: "istanbul",
			reporter: ["text-summary", "json-summary", "html", "lcov"],
			reportsDirectory: "./coverage",
			include: ["../src/**/*.{ts,vue}"],
			exclude: ["../src/**/*.spec.ts"],
		},
	},
});
