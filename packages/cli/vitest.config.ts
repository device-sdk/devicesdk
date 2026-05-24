import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		globals: true,
		include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
		coverage: {
			provider: "istanbul",
			reporter: ["text-summary", "json-summary", "html", "lcov"],
			reportsDirectory: "./coverage",
			include: ["src/**/*.ts"],
			exclude: [
				"src/**/*.test.ts",
				"src/**/*.contract.test.ts",
				"src/**/*.e2e.test.ts",
				"src/index.ts",
			],
		},
	},
});
