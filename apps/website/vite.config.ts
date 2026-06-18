import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import pages from "vite-plugin-pages";

function loadDocPaths(): string[] {
	try {
		const raw = readFileSync(
			resolve(__dirname, "src/generated/docs-paths.json"),
			"utf8",
		);
		return JSON.parse(raw) as string[];
	} catch {
		return [];
	}
}

export default defineConfig({
	root: process.cwd(),
	base: "/",
	plugins: [
		vue(),
		pages({
			dirs: [{ dir: "src/pages", baseRoute: "" }],
			extensions: ["vue"],
			routeStyle: "file",
		}),
	],
	resolve: {
		alias: {
			"~/": `${resolve(__dirname, "src")}/`,
		},
	},
	css: {
		devSourcemap: true,
	},
	ssgOptions: {
		script: "async",
		formatting: "minify",
		crittersOptions: {
			reduceInlineStyles: false,
		},
		includedRoutes(paths) {
			const docPaths = loadDocPaths();
			const staticPaths = paths.filter(
				(p) => !p.includes(":") && !p.includes("*"),
			);
			return [...staticPaths, ...docPaths];
		},
	},
	build: {
		outDir: "dist",
		emptyOutDir: true,
	},
});
