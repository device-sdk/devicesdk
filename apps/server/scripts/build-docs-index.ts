#!/usr/bin/env bun
/**
 * Builds a SQLite FTS5 full-text index of apps/docs/src/content/docs/**\/*.md
 * at build time. The index is shipped inside the Docker image and queried
 * locally (BM25, no network call) by devicesdk_docs_search - so docs search
 * works offline and always matches the docs the running server version shipped
 * with, even if the live docs.devicesdk.com site has since moved on.
 *
 * Path-to-URL mapping mirrors the new docs app (Astro/Nimbus) where the
 * filesystem under src/content/docs is mounted at the root of
 * https://docs.devicesdk.com/. Keep the two in sync if either changes -
 * a mismatch here means the index ships URLs that don't match the live site.
 *
 * Frontmatter parsing is a minimal hand-rolled YAML subset (no gray-matter/js-yaml
 * dependency in apps/server - Bun-only deps stay minimal here): simple
 * `key: value` scalars, optionally single/double-quoted, plus `>-` folded
 * multi-line scalars and a nested `build:` map for the `render: never` skip
 * flag. This covers every frontmatter shape actually used in the migrated
 * docs content as of this writing; anything fancier is intentionally ignored
 * rather than mis-parsed.
 */
import { Database } from "bun:sqlite";
import {
	type Dirent,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	rmSync,
} from "node:fs";
import { dirname, extname, join, parse, resolve } from "node:path";

/** apps/server/scripts/ -> apps/docs/src/content/docs (three levels up, then apps/docs/...). */
function defaultInputDir(): string {
	return new URL("../../../apps/docs/src/content/docs", import.meta.url)
		.pathname;
}

/** apps/server/scripts/ -> apps/server/dist/docs-index.sqlite (one level up). */
function defaultOutputPath(): string {
	return new URL("../dist/docs-index.sqlite", import.meta.url).pathname;
}

const inputDir = process.argv[2]
	? resolve(process.cwd(), process.argv[2])
	: defaultInputDir();
const outputPath = process.argv[3]
	? resolve(process.cwd(), process.argv[3])
	: defaultOutputPath();

function walkMarkdownFiles(dir: string): string[] {
	const results: string[] = [];
	let entries: Dirent[];
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch (err) {
		console.error(
			`Cannot read docs directory ${dir}: ${(err as Error).message}`,
		);
		return results;
	}
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			results.push(...walkMarkdownFiles(full));
		} else if (entry.isFile() && extname(entry.name) === ".md") {
			results.push(full);
		}
	}
	return results;
}

interface Frontmatter {
	title?: string;
	description?: string;
	url?: string;
	slug?: string;
	draft?: boolean;
	buildRenderNever?: boolean;
}

function unquote(value: string): string {
	const trimmed = value.trim();
	if (
		trimmed.length >= 2 &&
		((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
			(trimmed.startsWith("'") && trimmed.endsWith("'")))
	) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

/**
 * Splits `raw` into { frontmatter, body }. Returns body === raw unchanged if
 * there is no well-formed leading `---` frontmatter block.
 */
function splitFrontmatter(raw: string): { fm: Frontmatter; body: string } {
	const fm: Frontmatter = {};
	if (!raw.startsWith("---")) return { fm, body: raw };

	const lines = raw.split("\n");
	if (lines[0].trim() !== "---") return { fm, body: raw };

	let end = -1;
	for (let i = 1; i < lines.length; i++) {
		if (lines[i].trim() === "---") {
			end = i;
			break;
		}
	}
	if (end === -1) return { fm, body: raw };

	const fmLines = lines.slice(1, end);
	const body = lines.slice(end + 1).join("\n");

	let i = 0;
	let inBuildBlock = false;
	while (i < fmLines.length) {
		const line = fmLines[i];
		const topLevelMatch = /^([A-Za-z_][A-Za-z0-9_]*):(.*)$/.exec(line);

		if (!topLevelMatch) {
			// Indented line: either a `build:` submap entry or a list item under a
			// key we don't care about (e.g. `aliases:`) - only act on it while
			// inside a recognized submap.
			if (inBuildBlock) {
				const nested = /^\s+([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
				if (
					nested &&
					nested[1] === "render" &&
					unquote(nested[2]) === "never"
				) {
					fm.buildRenderNever = true;
				}
			}
			i++;
			continue;
		}

		inBuildBlock = false;
		const key = topLevelMatch[1];
		const rest = topLevelMatch[2].trim();

		if (key === "build" && rest === "") {
			inBuildBlock = true;
			i++;
			continue;
		}

		if (
			(key === "description" || key === "title") &&
			(rest === ">-" || rest === ">")
		) {
			// Folded block scalar: consecutive indented lines join with spaces,
			// trailing blank line (chomped by `-`) is dropped.
			const parts: string[] = [];
			let j = i + 1;
			while (j < fmLines.length && /^\s+\S/.test(fmLines[j])) {
				parts.push(fmLines[j].trim());
				j++;
			}
			const value = parts.join(" ");
			if (key === "description") fm.description = value;
			else fm.title = value;
			i = j;
			continue;
		}

		if (key === "draft") {
			fm.draft = unquote(rest) === "true";
		} else if (key === "title") {
			fm.title = unquote(rest);
		} else if (key === "description") {
			fm.description = unquote(rest);
		} else if (key === "url") {
			fm.url = unquote(rest);
		} else if (key === "slug") {
			fm.slug = unquote(rest);
		}
		i++;
	}

	return { fm, body };
}

/** Mirrors build-content.ts's shouldSkipPage (draft + build.render==="never"). */
function shouldSkipPage(fm: Frontmatter): boolean {
	return fm.draft === true || fm.buildRenderNever === true;
}

/** Mirrors the new docs app: src/content/docs/* maps to the root of docs.devicesdk.com. */
function routePathFromRel(relPath: string, prefix: string): string {
	const parsed = parse(relPath);
	const dir = parsed.dir ? parsed.dir.replace(/\\/g, "/") : "";
	const name = parsed.name;
	if (name === "_index" || name === "index") {
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

/** Mirrors build-content.ts's resolveRoutePath: url > slug > filename. */
function resolveRoutePath(
	relPath: string,
	prefix: string,
	fm: Frontmatter,
): string {
	if (fm.url) return normalizeRoutePath(fm.url);
	if (fm.slug) {
		const parsed = parse(relPath);
		const dir = parsed.dir ? parsed.dir.replace(/\\/g, "/") : "";
		const safeSlug = fm.slug.replace(/^\/+|\/+$/g, "").replace(/\/+/g, "-");
		const sluggedRel = dir ? `${dir}/${safeSlug}.md` : `${safeSlug}.md`;
		return routePathFromRel(sluggedRel, prefix);
	}
	return routePathFromRel(relPath, prefix);
}

/**
 * Strips markdown syntax down to plain text for FTS indexing: fenced code
 * markers (keeping the code itself), inline code backticks, links/images
 * (keeping the visible text), heading hashes, emphasis markers, blockquote
 * markers, and horizontal rules.
 */
function stripMarkdown(content: string): string {
	return content
		.replace(/^```[^\n]*\n/gm, "")
		.replace(/^```$/gm, "")
		.replace(/`([^`]+)`/g, "$1")
		.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/^#{1,6}\s+/gm, "")
		.replace(/\*\*([^*]+)\*\*/g, "$1")
		.replace(/__([^_]+)__/g, "$1")
		.replace(/\*([^*]+)\*/g, "$1")
		.replace(/_([^_]+)_/g, "$1")
		.replace(/^>\s?/gm, "")
		.replace(/^(?:---+|\*\*\*+)$/gm, "")
		.replace(/[ \t]+/g, " ")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

function main(): void {
	if (!existsSync(inputDir)) {
		console.error(`Docs directory not found: ${inputDir}`);
		process.exit(1);
	}

	if (existsSync(outputPath)) rmSync(outputPath);
	mkdirSync(dirname(outputPath), { recursive: true });

	const db = new Database(outputPath, { create: true });
	db.exec(
		"CREATE VIRTUAL TABLE docs_fts USING fts5(path UNINDEXED, title, description, content, tokenize='porter unicode61')",
	);
	db.exec(
		"CREATE TABLE meta (built_at INTEGER NOT NULL, doc_count INTEGER NOT NULL)",
	);

	const insert = db.prepare(
		"INSERT INTO docs_fts (path, title, description, content) VALUES (?1, ?2, ?3, ?4)",
	);

	const files = walkMarkdownFiles(inputDir).sort();
	let indexed = 0;

	const insertAll = db.transaction(() => {
		for (const abs of files) {
			const relPath = abs.slice(inputDir.length).replace(/^[/\\]/, "");
			const raw = readFileSync(abs, "utf-8");
			const { fm, body } = splitFrontmatter(raw);
			if (shouldSkipPage(fm)) continue;

			const title = fm.title || parse(relPath).name;
			const description = fm.description ?? "";
			const path = resolveRoutePath(relPath, "", fm);
			const content = stripMarkdown(body);

			insert.run(path, title, description, content);
			indexed++;
		}
	});
	insertAll();

	db.prepare("INSERT INTO meta (built_at, doc_count) VALUES (?1, ?2)").run(
		Date.now(),
		indexed,
	);
	db.close();

	console.log(`indexed ${indexed} pages -> ${outputPath}`);
	if (indexed === 0) {
		console.error(
			"No pages were indexed - refusing to ship an empty docs index.",
		);
		process.exit(1);
	}
}

// Only run as a side effect when executed directly (`bun run scripts/build-docs-index.ts`),
// never when a test imports this module for its exported helpers below - a
// bare import must not rebuild the production index or process.exit().
if (import.meta.main) {
	main();
}

export { resolveRoutePath, shouldSkipPage, splitFrontmatter, stripMarkdown };
