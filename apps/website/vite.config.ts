import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig, type Plugin } from "vite";

const devEntryPlugin: Plugin = {
	name: "dev-entry",
	transformIndexHtml: {
		order: "pre",
		handler(html, ctx) {
			if (ctx.server) {
				return html.replace('src="/src/main.ts"', 'src="/src/main.dev.ts"');
			}
			return html;
		},
	},
};

export default defineConfig({
	base: "/",
	publicDir: "static",
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	plugins: [
		devEntryPlugin,
		vue({
			template: {
				compilerOptions: {
					isCustomElement: (tag) => tag === "search-modal-snippet",
				},
			},
		}),
		tailwindcss(),
	],
	build: {
		outDir: "dist",
		emptyOutDir: true,
		assetsDir: "assets",
	},
	ssgOptions: {
		script: "async",
	},
});
