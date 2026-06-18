#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { glob } from "glob";
import MarkdownIt from "markdown-it";
import anchor from "markdown-it-anchor";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CONTENT_DIR = path.join(ROOT, "content");
const DOCS_DIR = path.join(ROOT, "..", "..", "docs", "public");
const STATIC_DIR = path.join(ROOT, "static");
const GENERATED_DIR = path.join(ROOT, "src", "generated");
const LLMS_SOURCE = path.join(ROOT, "src", "llms.txt");

const SITE_URL = "https://devicesdk.com";

interface TocItem {
	level: number;
	text: string;
	id: string;
	children: TocItem[];
}

interface PageData {
	path: string;
	sourcePath: string;
	sourceType: "content" | "docs";
	isSection: boolean;
	title: string;
	description: string;
	socialImage: string;
	html: string;
	rawMarkdown: string;
	tocHtml: string;
	children: string[];
	weight: number;
	lastmod: string | null;
}

const md = new MarkdownIt({ html: true, linkify: true, typographer: false });
md.use(anchor, {
	permalink: false,
	slugify: (s: string) =>
		String(s)
			.trim()
			.toLowerCase()
			.replace(/[^\w\s-]/g, "")
			.replace(/\s+/g, "-")
			.replace(/-+/g, "-"),
});

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

function ensureDir(filePath: string): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function routePathFromRel(relPath: string, prefix: string): string {
	const parsed = path.parse(relPath);
	const dir = parsed.dir ? parsed.dir.replace(/\\/g, "/") : "";
	const name = parsed.name;
	if (name === "_index") {
		if (!dir) return prefix ? `${prefix.replace(/\/+$/, "")}/` : "/";
		return `${prefix}/${dir}/`.replace(/\/+/g, "/");
	}
	if (!dir) return `${prefix}/${name}/`.replace(/\/+/g, "/");
	return `${prefix}/${dir}/${name}/`.replace(/\/+/g, "/");
}

function normalizeRoutePath(value: string): string {
	let p = value.trim();
	if (!p.startsWith("/")) p = `/${p}`;
	if (!p.endsWith("/")) p = `${p}/`;
	return p.replace(/\/+/g, "/");
}

function resolveRoutePath(
	rel: string,
	prefix: string,
	data: Record<string, unknown>,
): string {
	const url = parseFrontmatterValue(data.url);
	if (url) return normalizeRoutePath(url);
	const slug = parseFrontmatterValue(data.slug);
	if (slug) {
		const parsed = path.parse(rel);
		const dir = parsed.dir ? parsed.dir.replace(/\\/g, "/") : "";
		const safeSlug = slug.replace(/^\/+|\/+$/g, "").replace(/\/+/g, "-");
		const sluggedRel = dir ? `${dir}/${safeSlug}.md` : `${safeSlug}.md`;
		return routePathFromRel(sluggedRel, prefix);
	}
	return routePathFromRel(rel, prefix);
}

function parseFrontmatterValue(value: unknown): string {
	if (value === null || value === undefined) return "";
	if (typeof value === "string") return value;
	if (Array.isArray(value)) return value.join(", ");
	return String(value);
}

function shouldSkipPage(data: Record<string, unknown>): boolean {
	if (data.draft === true) return true;
	const build = data.build as Record<string, unknown> | undefined;
	if (build?.render === "never") return true;
	return false;
}

function stringifyFrontmatter(data: Record<string, unknown>): string {
	const lines = ["---"];
	for (const [key, value] of Object.entries(data)) {
		if (value === undefined || value === null) continue;
		if (typeof value === "string" && (value.includes("\n") || value.includes('"'))) {
			lines.push(`${key}: |-
  ${value.replace(/\n/g, "\n  ")}`);
		} else if (typeof value === "string") {
			lines.push(`${key}: "${value}"`);
		} else {
			lines.push(`${key}: ${JSON.stringify(value)}`);
		}
	}
	lines.push("---");
	return lines.join("\n");
}

interface MarkdownToken {
	type: string;
	tag: string;
	content: string;
	children: MarkdownToken[] | null;
	attrGet(name: string): string | null;
}

function extractTextFromInline(tokens: MarkdownToken[]): string {
	let text = "";
	for (const token of tokens) {
		if (token.type === "text" || token.type === "code_inline") text += token.content;
		else if (token.children) text += extractTextFromInline(token.children);
	}
	return text;
}

function buildToc(src: string): TocItem[] {
	const tokens = md.parse(src, {}) as MarkdownToken[];
	const flat: { level: number; text: string; id: string }[] = [];
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i];
		if (token.type === "heading_open" && (token.tag === "h2" || token.tag === "h3")) {
			const idAttr = token.attrGet("id");
			const next = tokens[i + 1];
			const text = next ? extractTextFromInline((next.children as MarkdownToken[] | null) ?? []) : "";
			flat.push({ level: Number(token.tag[1]), text, id: idAttr ?? "" });
		}
	}

	const root: TocItem[] = [];
	const stack: TocItem[] = [];
	for (const item of flat) {
		const node: TocItem = { level: item.level, text: item.text, id: item.id, children: [] };
		while (stack.length > 0 && stack[stack.length - 1].level >= item.level) {
			stack.pop();
		}
		if (stack.length === 0) root.push(node);
		else stack[stack.length - 1].children.push(node);
		stack.push(node);
	}
	return root;
}

function renderToc(items: TocItem[]): string {
	if (items.length === 0) return "";
	let html = "<ul>";
	for (const item of items) {
		html += `<li><a href="#${item.id}">${escapeHtml(item.text)}</a>${renderToc(item.children)}</li>`;
	}
	html += "</ul>";
	return html;
}

async function getLastmod(filePath: string): Promise<string | null> {
	try {
		const result = await new Promise<string>((resolve, reject) => {
			import("node:child_process")
				.then(({ execFile }) => {
					execFile("git", ["log", "-1", "--format=%cI", filePath], { cwd: ROOT }, (err, stdout) => {
						if (err) reject(err);
						else resolve(stdout.trim());
					});
				})
				.catch(reject);
		});
		return result || null;
	} catch {
		return null;
	}
}

async function collectPages(): Promise<PageData[]> {
	const pages: PageData[] = [];

	const contentFiles = await glob("**/*.md", { cwd: CONTENT_DIR, nodir: true });
	for (const rel of contentFiles) {
		const abs = path.join(CONTENT_DIR, rel);
		const raw = fs.readFileSync(abs, "utf8");
		const parsed = matter(raw);
		const data = parsed.data as Record<string, unknown>;
		if (shouldSkipPage(data)) continue;
		const title = parseFrontmatterValue(data.title) || path.basename(rel, ".md");
		const description = parseFrontmatterValue(data.description);
		const socialImage = parseFrontmatterValue(data.social_image);
		const html = md.render(parsed.content);
		const tocHtml = renderToc(buildToc(parsed.content));
		const routePath = resolveRoutePath(rel, "", data);
		pages.push({
			path: routePath,
			sourcePath: abs,
			sourceType: "content",
			isSection: path.basename(rel, ".md") === "_index",
			title,
			description,
			socialImage,
			html,
			rawMarkdown: parsed.content,
			tocHtml,
			children: [],
			weight: Number(data.weight) || 0,
			lastmod: await getLastmod(abs),
		});
	}

	const docsFiles = await glob("**/*.md", { cwd: DOCS_DIR, nodir: true });
	for (const rel of docsFiles) {
		const abs = path.join(DOCS_DIR, rel);
		const raw = fs.readFileSync(abs, "utf8");
		const parsed = matter(raw);
		const data = parsed.data as Record<string, unknown>;
		if (shouldSkipPage(data)) continue;
		const title = parseFrontmatterValue(data.title) || path.basename(rel, ".md");
		const description = parseFrontmatterValue(data.description);
		const socialImage = parseFrontmatterValue(data.social_image);
		const html = md.render(parsed.content);
		const tocHtml = renderToc(buildToc(parsed.content));
		const routePath = resolveRoutePath(rel, "/docs", data);
		pages.push({
			path: routePath,
			sourcePath: abs,
			sourceType: "docs",
			isSection: path.basename(rel, ".md") === "_index",
			title,
			description,
			socialImage,
			html,
			rawMarkdown: parsed.content,
			tocHtml,
			children: [],
			weight: Number(data.weight) || 0,
			lastmod: await getLastmod(abs),
		});
	}

	pages.sort((a, b) => a.path.localeCompare(b.path));

	// Populate direct children for section pages.
	for (const page of pages) {
		if (!page.isSection) continue;
		const prefix = page.path;
		const prefixDepth = prefix.split("/").filter(Boolean).length;
		page.children = pages
			.filter((p) => p.path.startsWith(prefix) && p.path !== prefix)
			.filter((p) => p.path.split("/").filter(Boolean).length === prefixDepth + 1)
			.map((p) => p.path);
	}

	return pages;
}

function pageUrl(path: string): string {
	return `${SITE_URL}${path}`;
}

function writeIndexMdMirror(page: PageData): void {
	const mirrorPath = path.join(STATIC_DIR, page.path.replace(/^\//, ""), "index.md");
	ensureDir(mirrorPath);
	const frontmatter: Record<string, unknown> = {
		title: page.title,
		url: pageUrl(page.path),
	};
	if (page.description) frontmatter.description = page.description;

	let body = `# ${page.title}\n\n`;
	if (page.description) body += `> ${page.description}\n\n`;
	body += page.rawMarkdown;

	if (page.isSection && page.children.length > 0) {
		body += "\n\n## Pages in this section\n";
		for (const childPath of page.children) {
			const child = pages.find((p) => p.path === childPath);
			if (!child) continue;
			body += `- [${child.title}](${pageUrl(child.path)}index.md)${child.description ? ` — ${child.description}` : ""}\n`;
		}
	}

	fs.writeFileSync(mirrorPath, `${stringifyFrontmatter(frontmatter)}\n\n${body}`, "utf8");
}

function writeRootIndexMd(): void {
	const mirrorPath = path.join(STATIC_DIR, "index.md");
	const rootPage = pages.find((p) => p.path === "/");
	if (!rootPage) return;
	const frontmatter: Record<string, unknown> = {
		title: rootPage.title,
		url: pageUrl("/"),
	};
	if (rootPage.description) frontmatter.description = rootPage.description;
	let body = `# ${rootPage.title}\n\n`;
	if (rootPage.description) body += `> ${rootPage.description}\n\n`;
	body += rootPage.rawMarkdown;
	fs.writeFileSync(mirrorPath, `${stringifyFrontmatter(frontmatter)}\n\n${body}`, "utf8");
}

function writeSitemap(): void {
	const lines = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
	];
	for (const page of pages) {
		if (page.path === "/404/") continue;
		lines.push("  <url>");
		lines.push(`    <loc>${pageUrl(page.path)}</loc>`);
		if (page.lastmod) lines.push(`    <lastmod>${page.lastmod}</lastmod>`);
		lines.push("    <changefreq>weekly</changefreq>");
		lines.push("    <priority>0.5</priority>");
		lines.push("  </url>");
	}
	lines.push("</urlset>");
	fs.writeFileSync(path.join(STATIC_DIR, "sitemap.xml"), lines.join("\n") + "\n", "utf8");
}

function writeLlmsTxt(): void {
	if (fs.existsSync(LLMS_SOURCE)) {
		fs.copyFileSync(LLMS_SOURCE, path.join(STATIC_DIR, "llms.txt"));
	}
}

function writeLlmsFull(): void {
	const header = `# DeviceSDK — Full Documentation

> Deploy TypeScript scripts to Raspberry Pi Pico and ESP32 microcontrollers. DeviceSDK is free, open-source (AGPL-3.0), and self-hosted: you run the server yourself (Docker on a Pi/NUC/NAS), and devices connect to it over WebSocket; your script handles events and issues commands.

> AI agent context: device scripts run in-process on the DeviceSDK server you host (a Bun runtime) — NOT firmware on the chip. Hardware access goes through \`this.env.DEVICE\`. Onboard LED is virtual pin 99. Field in \`devicesdk.ts\` is \`className\`, not \`entrypoint\`. \`setPwmState\` \`dutyCycle\` is 0..1, not 0..100.
`;

	const docsPages = pages
		.filter((p) => p.sourceType === "docs" && !p.isSection)
		.sort((a, b) => {
			if (a.weight !== b.weight) return a.weight - b.weight;
			return a.path.localeCompare(b.path);
		});

	const parts = [header];
	for (const page of docsPages) {
		let section = `\n---\n\n# ${page.title}\n\n`;
		if (page.description) section += `> ${page.description}\n\n`;
		section += `Source: ${pageUrl(page.path)}\n\n${page.rawMarkdown}`;
		parts.push(section);
	}

	fs.writeFileSync(path.join(STATIC_DIR, "llms-full.txt"), parts.join("\n") + "\n", "utf8");
}

let pages: PageData[] = [];

function writeGeneratedFiles(): void {
	ensureDir(path.join(GENERATED_DIR, "routes.ts"));

	const routeImports = new Map<string, string>();
	routeImports.set("/", "HomePage");
	routeImports.set("/product/", "ProductPage");
	routeImports.set("/solutions/", "SolutionsPage");
	routeImports.set("/examples/", "ExamplesPage");
	routeImports.set("/about/", "AboutPage");
	routeImports.set("/community/", "CommunityPage");
	routeImports.set("/privacy/", "PrivacyPage");
	routeImports.set("/terms/", "TermsPage");
	routeImports.set("/404/", "NotFoundPage");

	for (const page of pages) {
		if (routeImports.has(page.path)) continue;
		if (page.sourceType === "docs") {
			routeImports.set(page.path, page.isSection ? "DocsListPage" : "DocsPage");
		}
	}

	const componentImports = [
		"HomePage",
		"ProductPage",
		"SolutionsPage",
		"ExamplesPage",
		"AboutPage",
		"CommunityPage",
		"PrivacyPage",
		"TermsPage",
		"DocsListPage",
		"DocsPage",
		"NotFoundPage",
	];

	const imports = componentImports
		.map((name) => `import ${name} from "@/pages/${name}.vue";`)
		.join("\n");

	const routes = Array.from(routeImports.entries())
		.map(([path, component]) => `  { path: "${path}", component: ${component} }`)
		.join(",\n");

	const routesFile = `${imports}
import type { RouteRecordRaw } from "vue-router";

const routes: RouteRecordRaw[] = [
${routes},
];

export default routes;
`;

	fs.writeFileSync(path.join(GENERATED_DIR, "routes.ts"), routesFile, "utf8");
	fs.writeFileSync(path.join(GENERATED_DIR, "content.json"), JSON.stringify({ pages }, null, 2), "utf8");
}

async function main(): Promise<void> {
	ensureDir(path.join(GENERATED_DIR, "placeholder"));
	pages = await collectPages();

	for (const page of pages) {
		writeIndexMdMirror(page);
	}
	writeRootIndexMd();

	writeSitemap();
	writeLlmsTxt();
	writeLlmsFull();
	writeGeneratedFiles();

	console.log(`Generated ${pages.length} pages.`);
}

main().catch((err: unknown) => {
	console.error(err);
	process.exit(1);
});
