import type { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Minimal sequential-SQL-file migration runner.
 *
 * Deliberately does NOT use workers-qb's migrations builder: every workers-qb
 * Query runs trimQuery(), which collapses newline+indent whitespace so a
 * `-- comment` line swallows the SQL that follows it. Raw db.exec() preserves
 * the file byte-for-byte and handles multi-statement files.
 */
export function applyMigrations(db: Database, migrationsDir: string): string[] {
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

	const applied: string[] = [];
	for (const file of files) {
		if (alreadyApplied.has(file)) continue;
		const sql = readFileSync(join(migrationsDir, file), "utf-8");
		const tx = db.transaction(() => {
			db.exec(sql);
			db.query("INSERT INTO migrations (name, applied_at) VALUES (?1, ?2)").run(
				file,
				Date.now(),
			);
		});
		tx();
		applied.push(file);
	}
	return applied;
}
