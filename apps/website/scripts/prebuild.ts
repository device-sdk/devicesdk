#!/usr/bin/env tsx
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { glob } from "glob";
import matter from "gray-matter";
import type { DocsIndex } from "../src/utils/docs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DOCS_DIR = path.resolve(__dirname, "../../../docs/public");
const CONTENT_DIR = path.resolve(__dirname, "../content");
const STATIC_DIR = path.resolve(__dirname, "../static");
const PUBLIC_DIR = path.resolve(__dirname, "../public");
const DIST_DIR = path.resolve(__dirname, "../dist");
const SITE = process.env.SITE_URL || "https://devicesdk.com";

function ensureDir(dir: string) {
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyStaticAssets() {
	if (!fs.existsSync(STATIC_DIR)) return;
	function copyRecursive(src: string, dest: string) {
		const stat = fs.statSync(src);
		if (stat.isDirectory()) {
			ensureDir(dest);
			for (const entry of fs.readdirSync(src)) {
				copyRecursive(path.join(src, entry), path.join(dest, entry));
			}
		} else {
			fs.copyFileSync(src, dest);
		}
	}
	for (const entry of fs.readdirSync(STATIC_DIR)) {
		copyRecursive(path.join(STATIC_DIR, entry), path.join(PUBLIC_DIR, entry));
	}
	console.log("Copied static assets to public/");
}

function copyOpenapi() {
	const src = path.resolve(__dirname, "../../server/openapi.json");
	const dest = path.join(PUBLIC_DIR, "docs/api/openapi.json");
	if (!fs.existsSync(src)) {
		console.warn("openapi.json not found at", src);
		return;
	}
	ensureDir(path.dirname(dest));
	fs.copyFileSync(src, dest);
	console.log("Copied openapi.json to", dest);
}

function buildDocsIndex(): DocsIndex {
	const files = glob.sync("**/*.md", { cwd: DOCS_DIR, nodir: true });
	const pages = files.map((rel) => {
		const abs = path.join(DOCS_DIR, rel);
		const raw = fs.readFileSync(abs, "utf8");
		const parsed = matter(raw);
		const slug = rel
			.replace(/\\/g, "/")
			.replace(/\.md$/, "")
			.replace(/\/_index$/, "")
			.replace(/^_index$/, "");
		return {
			slug,
			path: `/docs/${slug ? `${slug}/` : ""}`,
			title: (parsed.data.title as string) || slug,
			description: parsed.data.description as string | undefined,
			content: parsed.content,
			headings: [] as { level: number; text: string; id: string }[],
			isSection: path.parse(rel).name === "_index",
		};
	});
	pages.sort((a, b) => a.path.localeCompare(b.path));

	return { pages, tree: [] };
}

function generateSitemap(index: DocsIndex) {
	const marketingPaths = [
		"/",
		"/product/",
		"/solutions/",
		"/examples/",
		"/community/",
		"/about/",
		"/terms/",
		"/privacy/",
		"/architecture/",
		"/architecture/data-flow/",
		"/architecture/runtime/",
		"/architecture/self-hosting/",
		"/architecture/comparison/",
	];
	const docPaths = index.pages.map((p) => p.path);
	const allPaths = [...marketingPaths, ...docPaths];

	const urlEntries = allPaths
		.map((p) => {
			const loc = `${SITE}${p}`;
			return `  <url>\n    <loc>${loc}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.5</priority>\n  </url>`;
		})
		.join("\n");

	const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries}\n</urlset>\n`;
	fs.writeFileSync(path.join(PUBLIC_DIR, "sitemap.xml"), sitemap);
	console.log("Generated sitemap.xml");
}

function generateLlms(index: DocsIndex) {
	const docLinks = index.pages
		.filter((p) => !p.isSection)
		.map(
			(p) =>
				`- [${p.title}](${SITE}${p.path})${p.description ? `: ${p.description}` : ""}`,
		)
		.join("\n");

	const llms = `# DeviceSDK — LLM-readable documentation index\n\nDeviceSDK is a free, open-source, self-hosted IoT platform. Users write TypeScript device scripts, deploy them via CLI to a server they run themselves, and connect ESP32/Pico devices over WebSocket.\n\n## Quick links\n\n- [Quickstart](${SITE}/docs/quickstart/)\n- [CLI Reference](${SITE}/docs/cli/)\n- [Platform Architecture](${SITE}/docs/concepts/architecture/)\n- [GitHub](https://github.com/device-sdk/devicesdk-monorepo)\n\n## Documentation pages\n\n${docLinks}\n`;

	fs.writeFileSync(path.join(PUBLIC_DIR, "llms.txt"), llms);
	console.log("Generated llms.txt");

	const fullParts: string[] = [];
	for (const page of index.pages) {
		fullParts.push(`# ${page.title}\n\n${page.content}`);
	}
	fs.writeFileSync(
		path.join(PUBLIC_DIR, "llms-full.txt"),
		fullParts.join("\n\n---\n\n"),
	);
	console.log("Generated llms-full.txt");
}

function generateRobots() {
	const robots = `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`;
	fs.writeFileSync(path.join(PUBLIC_DIR, "robots.txt"), robots);
}

async function main() {
	ensureDir(PUBLIC_DIR);
	ensureDir(DIST_DIR);

	copyStaticAssets();
	copyOpenapi();

	// Build docs index
	const index = buildDocsIndex();
	ensureDir(path.join(ROOT, "src/generated"));
	fs.writeFileSync(
		path.join(ROOT, "src/generated/docs-index.json"),
		JSON.stringify(index, null, 2),
	);
	const paths = index.pages.map((p) => p.path);
	fs.writeFileSync(
		path.join(ROOT, "src/generated/docs-paths.json"),
		JSON.stringify(paths, null, 2),
	);
	console.log("Generated docs index and paths");

	generateSitemap(index);
	generateLlms(index);
	generateRobots();

	// Generate agent skills manifest
	execSync("tsx scripts/generate-agent-skills.ts", {
		cwd: ROOT,
		stdio: "inherit",
	});

	// Generate OG images
	execSync("tsx scripts/generate-og.ts", { cwd: ROOT, stdio: "inherit" });
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
