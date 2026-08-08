import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";

export interface DocsSearchRow {
	path: string;
	url: string;
	title: string;
	snippet: string;
}

export type DocsSearchResult =
	| { success: true; result: { query: string; matches: DocsSearchRow[] } }
	| { success: false; error: string; code?: string };

const SITE_URL = "https://docs.devicesdk.com";

let cachedPath: string | undefined;
let cachedDb: Database | null = null;

/**
 * Lazily opens the read-only docs index, caching the handle for as long as
 * `docsIndexPath` doesn't change. Keyed by path (rather than a bare boolean)
 * so multiple servers in one process - e.g. the e2e test harness, which boots
 * a fresh server with its own DOCS_INDEX_PATH per test file - each get their
 * own handle instead of racing over a single global cache.
 */
function getDb(docsIndexPath: string): Database | null {
	if (cachedPath === docsIndexPath) return cachedDb;

	cachedDb?.close();
	cachedPath = docsIndexPath;
	if (!existsSync(docsIndexPath)) {
		cachedDb = null;
		return cachedDb;
	}
	try {
		cachedDb = new Database(docsIndexPath, { readonly: true });
	} catch {
		cachedDb = null;
	}
	return cachedDb;
}

/**
 * Test-only: drops the cached DB handle so a subsequent `searchDocs` call
 * reopens `docsIndexPath` instead of reusing whatever was cached by an
 * earlier call (mirrors foundation/logger.ts's `resetLogger`).
 */
export function resetDocsSearchCache(): void {
	cachedDb?.close();
	cachedDb = null;
	cachedPath = undefined;
}

/**
 * Sanitizes a free-text query for FTS5's own query syntax, which throws on
 * stray quotes/operators (a bare `"` or a dangling `AND` is a syntax error,
 * not a "no results" case). Splitting into tokens and re-quoting each one
 * guarantees a syntactically valid MATCH expression regardless of what the
 * caller typed. Splits on Unicode-aware letter/number classes so non-ASCII
 * terms stay reachable (the index tokenizes with unicode61).
 */
function toFtsQuery(query: string, joiner: "AND" | "OR"): string {
	const tokens = query
		.split(/[^\p{L}\p{N}]+/u)
		.filter((t) => t.length > 0)
		.map((t) => `"${t}"`);
	return tokens.join(` ${joiner} `);
}

const SEARCH_SQL =
	"SELECT path, title, snippet(docs_fts, 3, '[', ']', ' … ', 16) AS snippet " +
	"FROM docs_fts WHERE docs_fts MATCH ?1 ORDER BY rank LIMIT 10";

/**
 * Full-text search over the local docs index. Never throws - a missing index
 * (dev checkout without a build) or an unparseable query both come back as a
 * structured `{ success: false }` result, matching the same convention every
 * other devicesdk_* tool uses.
 */
export function searchDocs(
	query: string,
	docsIndexPath: string,
): DocsSearchResult {
	const db = getDb(docsIndexPath);
	if (!db) {
		return {
			success: false,
			error:
				"Docs search index not found. Run the server build " +
				"(`bun run scripts/build-docs-index.ts` in apps/server, or `pnpm build`) " +
				"to generate dist/docs-index.sqlite, or set DOCS_INDEX_PATH.",
			code: "docs_index_missing",
		};
	}

	const trimmed = query.trim();
	if (!trimmed) {
		return {
			success: false,
			error: "query is required",
			code: "missing_query",
		};
	}

	const runQuery = (ftsQuery: string): DocsSearchRow[] => {
		if (!ftsQuery) return [];
		try {
			const rows = db
				.query<{ path: string; title: string; snippet: string }, [string]>(
					SEARCH_SQL,
				)
				.all(ftsQuery);
			return rows.map((r) => ({
				path: r.path,
				url: `${SITE_URL}${r.path}`,
				title: r.title,
				snippet: r.snippet,
			}));
		} catch {
			// A pathological query (e.g. a single FTS5 operator token) can still
			// fail to parse even after quoting; treat as "no results" rather than
			// propagating a SQLite error to the caller.
			return [];
		}
	};

	let matches = runQuery(toFtsQuery(trimmed, "AND"));
	if (matches.length === 0) {
		matches = runQuery(toFtsQuery(trimmed, "OR"));
	}

	return { success: true, result: { query: trimmed, matches } };
}
