import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { glob } from "glob";
import matter from "gray-matter";
import type {
	DocHeading,
	DocPage,
	DocsIndex,
	DocTreeNode,
} from "../src/utils/docs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.resolve(__dirname, "../../../docs/public");
const OUT_INDEX = path.resolve(__dirname, "../src/generated/docs-index.json");
const OUT_PATHS = path.resolve(__dirname, "../src/generated/docs-paths.json");

function slugFromRelPath(relPath: string): string {
	const parsed = path.parse(relPath);
	const dir = parsed.dir.replace(/\\/g, "/");
	const name = parsed.name;
	if (name === "_index") {
		return dir;
	}
	return dir ? `${dir}/${name}` : name;
}

function pathFromSlug(slug: string): string {
	if (!slug) return "/docs/";
	return `/docs/${slug}/`;
}

function extractHeadings(content: string): DocHeading[] {
	const headings: DocHeading[] = [];
	const lines = content.split("\n");
	for (const line of lines) {
		const match = line.match(/^(#{2,3})\s+(.+)$/);
		if (match) {
			const level = match[1].length;
			const text = match[2].replace(/\*\*|__/g, "").trim();
			const id = text
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, "-")
				.replace(/(^-|-$)/g, "");
			headings.push({ level, text, id });
		}
	}
	return headings;
}

function titleFromFilename(name: string): string {
	return name.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

async function buildDocsIndex(): Promise<DocsIndex> {
	const files = await glob("**/*.md", { cwd: DOCS_DIR, nodir: true });
	const pages: DocPage[] = [];

	for (const rel of files) {
		const abs = path.join(DOCS_DIR, rel);
		const raw = fs.readFileSync(abs, "utf8");
		const parsed = matter(raw);
		const slug = slugFromRelPath(rel);
		const docPath = pathFromSlug(slug);
		const title =
			(parsed.data.title as string) || titleFromFilename(path.parse(rel).name);
		const description = parsed.data.description as string | undefined;
		const content = parsed.content;
		const headings = extractHeadings(content);

		pages.push({
			slug,
			path: docPath,
			title,
			description,
			content,
			headings,
			isSection: path.parse(rel).name === "_index",
		});
	}

	pages.sort((a, b) => a.path.localeCompare(b.path));

	const tree = buildTree(pages);

	return { pages, tree };
}

function buildTree(pages: DocPage[]): DocTreeNode[] {
	const root: DocTreeNode[] = [];
	const map = new Map<string, DocTreeNode>();

	for (const page of pages) {
		const parts = page.slug ? page.slug.split("/") : [];
		let current = root;
		let currentPath = "/docs";

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			currentPath = i === 0 ? `/docs/${part}` : `${currentPath}/${part}`;
			const existing = current.find(
				(n) => n.slug === parts.slice(0, i + 1).join("/"),
			);

			if (existing) {
				current = existing.children;
			} else {
				const isLast = i === parts.length - 1;
				const node: DocTreeNode = {
					slug: parts.slice(0, i + 1).join("/"),
					path: currentPath + "/",
					title: isLast ? page.title : titleFromFilename(part),
					children: [],
					isSection: isLast ? (page.isSection ?? false) : true,
				};
				map.set(node.slug, node);
				current.push(node);
				current = node.children;
			}
		}
	}

	return root;
}

async function main() {
	const index = await buildDocsIndex();
	fs.mkdirSync(path.dirname(OUT_INDEX), { recursive: true });
	fs.writeFileSync(OUT_INDEX, JSON.stringify(index, null, 2));

	const paths = index.pages.map((p) => p.path);
	fs.writeFileSync(OUT_PATHS, JSON.stringify(paths, null, 2));

	console.log(`Wrote ${index.pages.length} docs pages to ${OUT_INDEX}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
