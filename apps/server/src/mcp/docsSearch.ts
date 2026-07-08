import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { loadConfig } from "../config";

export interface DocsSearchRow {
	path: string;
	url: string;
	title: string;
	snippet: string;
}

export type DocsSearchResult =
	| { success: true; result: { query: string; matches: DocsSearchRow[] } }
	| { success: false; error: string; code?: string };

const SITE_URL = "https://devicesdk.com";

let cachedDb: Database | null | undefined;

/** Lazily opens the read-only docs index on first query, caching the handle. */
function getDb(): Database | null {
	if (cachedDb !== undefined) return cachedDb;

	const path = loadConfig().docsIndexPath;
	if (!existsSync(path)) {
		cachedDb = null;
		return cachedDb;
	}
	try {
		cachedDb = new Database(path, { readonly: true });
	} catch {
		cachedDb = null;
	}
	return cachedDb;
}

/**
 * Sanitizes a free-text query for FTS5's own query syntax, which throws on
 * stray quotes/operators (a bare `"` or a dangling `AND` is a syntax error,
 * not a "no results" case). Splitting into alphanumeric tokens and
 * re-quoting each one guarantees a syntactically valid MATCH expression
 * regardless of what the caller typed.
 */
function toFtsQuery(query: string, joiner: "AND" | "OR"): string {
	const tokens = query
		.split(/[^A-Za-z0-9]+/)
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
export function searchDocs(query: string): DocsSearchResult {
	const db = getDb();
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
