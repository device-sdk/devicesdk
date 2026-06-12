import type { Database } from "bun:sqlite";

/**
 * Minimal D1Database-compatible facade over bun:sqlite, covering the surface
 * the endpoints actually use: prepare().bind().first()/all()/run(). Exists so
 * the many `c.env.DB.prepare(...)` call sites ported from the Workers app
 * keep working without rewriting each one onto the query builder.
 */
export class D1CompatStatement {
	private db: Database;
	private sql: string;
	private args: unknown[];

	constructor(db: Database, sql: string, args: unknown[] = []) {
		this.db = db;
		this.sql = sql;
		this.args = args;
	}

	bind(...args: unknown[]): D1CompatStatement {
		return new D1CompatStatement(this.db, this.sql, args);
	}

	async first<T = Record<string, unknown>>(): Promise<T | null> {
		return (this.db.query(this.sql).get(...(this.args as never[])) ??
			null) as T | null;
	}

	async all<T = Record<string, unknown>>(): Promise<{
		results: T[];
		success: true;
		meta: { changes: number };
	}> {
		const results = this.db
			.query(this.sql)
			.all(...(this.args as never[])) as T[];
		return { results, success: true, meta: { changes: 0 } };
	}

	async run(): Promise<{
		success: true;
		meta: { changes: number; last_row_id: number };
	}> {
		this.db.query(this.sql).run(...(this.args as never[]));
		const stats = this.db
			.query("SELECT changes() AS changes, last_insert_rowid() AS last_row_id")
			.get() as { changes: number; last_row_id: number };
		return { success: true, meta: stats };
	}
}

export class D1CompatDatabase {
	private db: Database;

	constructor(db: Database) {
		this.db = db;
	}

	prepare(sql: string): D1CompatStatement {
		return new D1CompatStatement(this.db, sql);
	}

	async batch(
		statements: D1CompatStatement[],
	): Promise<{ success: true; meta: { changes: number } }[]> {
		const tx = this.db.transaction(async () => {
			const out: {
				success: true;
				meta: { changes: number; last_row_id: number };
			}[] = [];
			for (const stmt of statements) {
				out.push(await stmt.run());
			}
			return out;
		});
		return tx();
	}
}
