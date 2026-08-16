import type { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { logger } from "../foundation/logger";

/**
 * Minimal sequential-SQL-file migration runner.
 *
 * Deliberately does NOT use workers-qb's migrations builder: every workers-qb
 * Query runs trimQuery(), which collapses newline+indent whitespace so a
 * `-- comment` line swallows the SQL that follows it. Raw db.exec() preserves
 * the file byte-for-byte and handles multi-statement files.
 *
 * The whole application runs inside a single `BEGIN IMMEDIATE` transaction:
 * with busy_timeout set on the connection, a second server instance booting on
 * the same DATA_DIR blocks until the first finishes instead of crashing on a
 * half-applied migration, and every file plus its bookkeeping row is atomic
 * as a batch (a failure rolls everything back to a clean pre-migration state).
 */
export function applyMigrations(db: Database, migrationsDir: string): string[] {
	const applied: string[] = [];
	try {
		db.exec("BEGIN IMMEDIATE");
		db.exec(
			"CREATE TABLE IF NOT EXISTS migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, applied_at INTEGER NOT NULL)",
		);
		const appliedRows = db.query("SELECT name FROM migrations").all() as {
			name: string;
		}[];
		const alreadyApplied = new Set(appliedRows.map((r) => r.name));

		const files = readdirSync(migrationsDir)
			.filter((f) => f.endsWith(".sql"))
			.sort();

		for (const file of files) {
			if (alreadyApplied.has(file)) continue;
			db.exec(readFileSync(join(migrationsDir, file), "utf-8"));
			db.query("INSERT INTO migrations (name, applied_at) VALUES (?1, ?2)").run(
				file,
				Date.now(),
			);
			applied.push(file);
		}
		db.exec("COMMIT");
	} catch (error) {
		try {
			db.exec("ROLLBACK");
		} catch {
			// No transaction was open (e.g. BEGIN IMMEDIATE itself failed).
		}
		if (
			error instanceof Error &&
			error.message.toLowerCase().includes("database is locked")
		) {
			logger.error(
				error,
				"Database is locked during migration - another server instance is migrating this DATA_DIR. Retry after it finishes.",
			);
		}
		throw error;
	}
	return applied;
}
