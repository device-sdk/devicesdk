import { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resetDocsSearchCache, searchDocs } from "../../src/mcp/docsSearch";

const SCRIPT_PATH = new URL(
	"../../scripts/build-docs-index.ts",
	import.meta.url,
).pathname;

let fixtureDir: string;
let indexPath: string;

beforeAll(() => {
	fixtureDir = mkdtempSync(join(tmpdir(), "dsdk-docs-fixture-"));
	mkdirSync(join(fixtureDir, "sub"), { recursive: true });

	// Densely about "banana" - should outrank page-b for a "banana" query
	// under BM25 (higher term frequency, shorter/more focused document).
	writeFileSync(
		join(fixtureDir, "page-a.md"),
		`---
title: Banana Guide
description: Everything about bananas
---

Bananas are a tropical fruit. This banana guide covers banana varieties,
banana nutrition, and banana recipes. Bananas are rich in potassium.
`,
	);

	// Mentions "banana" only twice, tangentially, in a longer apple-focused doc.
	writeFileSync(
		join(fixtureDir, "sub", "page-b.md"),
		`---
title: Apple Guide
description: Everything about apples
---

Apples are a temperate fruit. This guide covers apple varieties and apple
pie recipes, growing apples, and storing apples over winter. Have you ever
seen a banana growing on an apple tree? No - apples and bananas don't mix,
they need very different climates entirely.
`,
	);

	writeFileSync(
		join(fixtureDir, "_index.md"),
		`---
title: Fruit Docs
description: Fruit documentation index
---

Welcome to the fruit documentation. See the guides for apples and bananas.
`,
	);

	const outDir = mkdtempSync(join(tmpdir(), "dsdk-docs-index-"));
	indexPath = join(outDir, "docs-index.sqlite");

	const proc = Bun.spawnSync([
		"bun",
		"run",
		SCRIPT_PATH,
		fixtureDir,
		indexPath,
	]);
	if (proc.exitCode !== 0) {
		throw new Error(
			`indexer failed (exit ${proc.exitCode}): ${proc.stderr.toString()}`,
		);
	}
});

afterAll(() => {
	resetDocsSearchCache();
	rmSync(fixtureDir, { recursive: true, force: true });
	rmSync(join(indexPath, ".."), { recursive: true, force: true });
});

describe("build-docs-index: indexing", () => {
	test("indexes exactly the 3 fixture pages", () => {
		const db = new Database(indexPath, { readonly: true });
		const meta = db.query("SELECT doc_count FROM meta").get() as {
			doc_count: number;
		};
		expect(meta.doc_count).toBe(3);
		db.close();
	});

	test("path mapping: dir/page.md -> /dir/page/, _index.md -> /", () => {
		const db = new Database(indexPath, { readonly: true });
		const rows = db.query("SELECT path FROM docs_fts ORDER BY path").all() as {
			path: string;
		}[];
		const paths = rows.map((r) => r.path).sort();
		expect(paths).toEqual(["/", "/page-a/", "/sub/page-b/"]);
		db.close();
	});

	test("title/description are carried through from frontmatter", () => {
		const db = new Database(indexPath, { readonly: true });
		const row = db
			.query("SELECT title, description FROM docs_fts WHERE path = ?1")
			.get("/page-a/") as { title: string; description: string };
		expect(row.title).toBe("Banana Guide");
		expect(row.description).toBe("Everything about bananas");
		db.close();
	});
});

describe("devicesdk_docs_search (searchDocs) against the fixture index", () => {
	test("BM25 ranks the banana-focused page above the apple-focused page", () => {
		const result = searchDocs("banana", indexPath);
		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.result.matches.length).toBeGreaterThan(0);
		expect(result.result.matches[0].path).toBe("/page-a/");
	});

	test("returns a snippet and a devicesdk.com URL for each match", () => {
		const result = searchDocs("banana", indexPath);
		expect(result.success).toBe(true);
		if (!result.success) return;
		const first = result.result.matches[0];
		expect(first.url).toBe("https://docs.devicesdk.com/page-a/");
		expect(typeof first.snippet).toBe("string");
		expect(first.snippet.length).toBeGreaterThan(0);
	});

	test("a query full of FTS5 operator syntax never throws - result set or empty", () => {
		expect(() =>
			searchDocs('AND ( * NEAR "unterminated', indexPath),
		).not.toThrow();
		const result = searchDocs('AND ( * NEAR "unterminated', indexPath);
		expect(result.success).toBe(true);
		if (result.success) {
			expect(Array.isArray(result.result.matches)).toBe(true);
		}
	});

	test("empty query is a structured failure, not a throw", () => {
		const result = searchDocs("   ", indexPath);
		expect(result.success).toBe(false);
	});
});

describe("devicesdk_docs_search: missing index file", () => {
	test("reports docs_index_missing instead of throwing", () => {
		const result = searchDocs(
			"banana",
			join(fixtureDir, "does-not-exist.sqlite"),
		);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.code).toBe("docs_index_missing");
		}
	});
});
