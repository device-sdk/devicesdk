import type { Database } from "bun:sqlite";
import { FetchTypes, type Query, QueryBuilder } from "workers-qb";

// The QueryBuilder base class types execute() over Query<any, IsAsync>; the
// alias keeps the single justified `any` in one place.
// biome-ignore lint/suspicious/noExplicitAny: matches the workers-qb base-class contract
type AnyQuery = Query<any, true>;

/**
 * D1-compatible result meta so endpoint code written against D1QB results
 * (`result.meta.changes`, `result.results`, `result.success`) keeps working
 * unchanged on bun:sqlite.
 */
interface BunSqliteMeta {
	changes: number;
	last_row_id: number;
	duration: number;
	served_by: string;
	rows_read: number;
	rows_written: number;
}

export interface BunSqliteResult<T = unknown> {
	success: true;
	results: T;
	changes: number;
	last_row_id: number;
	meta: BunSqliteMeta;
}

/**
 * workers-qb adapter over bun:sqlite, mirroring D1QB's result shapes.
 *
 * Notes proven by the Phase-0 spike:
 * - bun:sqlite natively binds the `?1`/`?2` numbered placeholders the
 *   codebase uses (workers-qb generates them sequentially).
 * - Argument-less queries go through `db.exec`, which supports
 *   multi-statement SQL (needed by raw maintenance queries).
 * - Do NOT route SQL containing `--` comments through workers-qb Query
 *   objects: Query's trimQuery() collapses newline+indent runs so a comment
 *   swallows the SQL after it. Migrations therefore bypass this class
 *   entirely (see migrate.ts).
 */
export class BunSqliteQB extends QueryBuilder<
	Record<string, never>,
	unknown,
	true
> {
	public db: Database;

	constructor(
		db: Database,
		options?: ConstructorParameters<typeof QueryBuilder>[0],
	) {
		super(options);
		this.db = db;
	}

	private isWrite(sql: string): boolean {
		const t = sql.trim().toUpperCase();
		return (
			t.startsWith("INSERT") ||
			t.startsWith("UPDATE") ||
			t.startsWith("DELETE") ||
			t.startsWith("REPLACE")
		);
	}

	private runStats(): { changes: number; last_row_id: number } {
		return this.db
			.query("SELECT changes() AS changes, last_insert_rowid() AS last_row_id")
			.get() as { changes: number; last_row_id: number };
	}

	private executeSync(query: AnyQuery): BunSqliteResult {
		const processed = query.toObject();
		const args = (processed.args ?? []) as never[];
		const sql = processed.query;

		if (
			query.fetchType === FetchTypes.ONE ||
			query.fetchType === FetchTypes.ALL
		) {
			const rows = this.db.query(sql).all(...args) as Record<string, unknown>[];
			const stats = this.isWrite(sql)
				? this.runStats()
				: { changes: 0, last_row_id: 0 };
			return {
				success: true,
				results: query.fetchType === FetchTypes.ONE ? rows[0] : rows,
				changes: stats.changes,
				last_row_id: stats.last_row_id,
				meta: {
					...stats,
					duration: 0,
					served_by: "bun-sqlite",
					rows_read: rows.length,
					rows_written: stats.changes,
				},
			};
		}

		// No fetch type: mirror D1's stmt.run() → D1Result with meta.
		// Argument-less SQL goes through db.exec (multi-statement capable).
		if (args.length === 0) {
			this.db.exec(sql);
		} else {
			this.db.query(sql).run(...args);
		}
		const stats = this.runStats();
		return {
			success: true,
			results: undefined,
			changes: stats.changes,
			last_row_id: stats.last_row_id,
			meta: {
				...stats,
				duration: 0,
				served_by: "bun-sqlite",
				rows_read: 0,
				rows_written: stats.changes,
			},
		};
	}

	async execute(query: AnyQuery): Promise<unknown> {
		return this.executeSync(query);
	}

	async batchExecute(queryArray: AnyQuery[]): Promise<unknown[]> {
		const tx = this.db.transaction(() =>
			queryArray.map((q) => this.executeSync(q)),
		);
		return tx();
	}
}
