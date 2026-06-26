import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FetchTypes } from "workers-qb";
import { BunSqliteQB, type BunSqliteResult } from "../../src/db/bunSqliteQB";
import { D1CompatDatabase } from "../../src/db/d1Compat";
import { applyMigrations } from "../../src/db/migrate";

interface Row {
	id: number;
	name: string;
	score: number;
}

describe("BunSqliteQB", () => {
	let db: Database;
	let qb: BunSqliteQB;

	beforeEach(() => {
		db = new Database(":memory:");
		db.exec(
			"CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, score INTEGER NOT NULL DEFAULT 0)",
		);
		qb = new BunSqliteQB(db);
	});

	afterEach(() => db.close());

	test("insert with returning yields the inserted row (D1-shaped result)", async () => {
		const res = (await qb
			.insert<Row>({
				tableName: "items",
				data: { name: "alpha", score: 5 },
				returning: "*",
			})
			.execute()) as BunSqliteResult<Row>;

		expect(res.success).toBe(true);
		expect(res.results.name).toBe("alpha");
		expect(res.results.score).toBe(5);
		expect(res.results.id).toBeGreaterThan(0);
		expect(res.meta.served_by).toBe("bun-sqlite");
		expect(res.meta.changes).toBe(1);
		expect(res.last_row_id).toBeGreaterThan(0);
	});

	test("insert without returning reports changes but no results", async () => {
		const res = (await qb
			.insert({ tableName: "items", data: { name: "beta", score: 1 } })
			.execute()) as BunSqliteResult<undefined>;
		expect(res.success).toBe(true);
		expect(res.results).toBeUndefined();
		expect(res.changes).toBe(1);
		expect(res.last_row_id).toBeGreaterThan(0);
		expect(res.meta.rows_written).toBe(1);
	});

	test("fetchOne returns a single object, fetchAll returns an array", async () => {
		await qb
			.insert({ tableName: "items", data: { name: "a", score: 1 } })
			.execute();
		await qb
			.insert({ tableName: "items", data: { name: "b", score: 2 } })
			.execute();

		const one = (await qb
			.fetchOne<Row>({
				tableName: "items",
				where: { conditions: ["name = ?1"], params: ["a"] },
			})
			.execute()) as BunSqliteResult<Row>;
		expect(Array.isArray(one.results)).toBe(false);
		expect(one.results.name).toBe("a");

		const all = (await qb
			.fetchAll<Row>({ tableName: "items", orderBy: "score" })
			.execute()) as BunSqliteResult<Row[]>;
		expect(Array.isArray(all.results)).toBe(true);
		expect(all.results.length).toBe(2);
		expect(all.results.map((r) => r.name)).toEqual(["a", "b"]);
		expect(all.meta.rows_read).toBe(2);
	});

	test("fetchOne miss yields undefined results", async () => {
		const miss = (await qb
			.fetchOne<Row>({
				tableName: "items",
				where: { conditions: ["name = ?1"], params: ["nope"] },
			})
			.execute()) as BunSqliteResult<Row | undefined>;
		expect(miss.results).toBeUndefined();
	});

	test("update mutates rows and reports the change count", async () => {
		await qb
			.insert({ tableName: "items", data: { name: "c", score: 1 } })
			.execute();
		const res = (await qb
			.update({
				tableName: "items",
				data: { score: 99 },
				where: { conditions: ["name = ?1"], params: ["c"] },
			})
			.execute()) as BunSqliteResult<undefined>;
		expect(res.changes).toBe(1);

		const row = (await qb
			.fetchOne<Row>({
				tableName: "items",
				where: { conditions: ["name = ?1"], params: ["c"] },
			})
			.execute()) as BunSqliteResult<Row>;
		expect(row.results.score).toBe(99);
	});

	test("delete removes rows", async () => {
		await qb
			.insert({ tableName: "items", data: { name: "d", score: 1 } })
			.execute();
		const res = (await qb
			.delete({
				tableName: "items",
				where: { conditions: ["name = ?1"], params: ["d"] },
			})
			.execute()) as BunSqliteResult<undefined>;
		expect(res.changes).toBe(1);

		const all = (await qb
			.fetchAll<Row>({ tableName: "items" })
			.execute()) as BunSqliteResult<Row[]>;
		expect(all.results.length).toBe(0);
	});

	test("raw with FetchTypes.ONE returns the first row", async () => {
		await qb
			.insert({ tableName: "items", data: { name: "x", score: 7 } })
			.execute();
		const res = (await qb
			.raw<{ total: number }>({
				query: "SELECT SUM(score) AS total FROM items",
				fetchType: FetchTypes.ONE,
			})
			.execute()) as BunSqliteResult<{ total: number }>;
		expect(res.results.total).toBe(7);
	});

	test("raw with FetchTypes.ALL returns every row", async () => {
		await qb
			.insert({ tableName: "items", data: { name: "p", score: 1 } })
			.execute();
		await qb
			.insert({ tableName: "items", data: { name: "q", score: 2 } })
			.execute();
		const res = (await qb
			.raw<Row>({
				query: "SELECT * FROM items ORDER BY score",
				fetchType: FetchTypes.ALL,
			})
			.execute()) as BunSqliteResult<Row[]>;
		expect(res.results.map((r) => r.name)).toEqual(["p", "q"]);
	});

	test("batchExecute runs queries in a transaction", async () => {
		const results = (await qb.batchExecute([
			qb.insert({ tableName: "items", data: { name: "b1", score: 1 } }),
			qb.insert({ tableName: "items", data: { name: "b2", score: 2 } }),
		])) as BunSqliteResult<undefined>[];
		expect(results.length).toBe(2);
		expect(results.every((r) => r.success)).toBe(true);

		const all = (await qb
			.fetchAll<Row>({ tableName: "items" })
			.execute()) as BunSqliteResult<Row[]>;
		expect(all.results.length).toBe(2);
	});
});

describe("D1CompatDatabase", () => {
	let db: Database;
	let d1: D1CompatDatabase;

	beforeEach(() => {
		db = new Database(":memory:");
		db.exec("CREATE TABLE kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)");
		d1 = new D1CompatDatabase(db);
	});

	afterEach(() => db.close());

	test("prepare().bind().run() inserts and reports meta", async () => {
		const res = await d1
			.prepare("INSERT INTO kv (k, v) VALUES (?1, ?2)")
			.bind("a", "1")
			.run();
		expect(res.success).toBe(true);
		expect(res.meta.changes).toBe(1);
	});

	test("first() returns a row or null", async () => {
		await d1
			.prepare("INSERT INTO kv (k, v) VALUES (?1, ?2)")
			.bind("a", "1")
			.run();

		const hit = await d1
			.prepare("SELECT v FROM kv WHERE k = ?1")
			.bind("a")
			.first<{ v: string }>();
		expect(hit?.v).toBe("1");

		const miss = await d1
			.prepare("SELECT v FROM kv WHERE k = ?1")
			.bind("zzz")
			.first();
		expect(miss).toBeNull();
	});

	test("all() returns a D1-shaped results array", async () => {
		await d1
			.prepare("INSERT INTO kv (k, v) VALUES (?1, ?2)")
			.bind("a", "1")
			.run();
		await d1
			.prepare("INSERT INTO kv (k, v) VALUES (?1, ?2)")
			.bind("b", "2")
			.run();

		const res = await d1
			.prepare("SELECT k, v FROM kv ORDER BY k")
			.all<{ k: string; v: string }>();
		expect(res.success).toBe(true);
		expect(res.results.length).toBe(2);
		expect(res.results[0].k).toBe("a");
	});

	test("bind() does not mutate the original statement", async () => {
		const stmt = d1.prepare("INSERT INTO kv (k, v) VALUES (?1, ?2)");
		await stmt.bind("x", "10").run();
		await stmt.bind("y", "20").run();
		const res = await d1.prepare("SELECT COUNT(*) AS n FROM kv").first<{
			n: number;
		}>();
		expect(res?.n).toBe(2);
	});

	test("batch() executes statements in a transaction", async () => {
		const res = await d1.batch([
			d1.prepare("INSERT INTO kv (k, v) VALUES (?1, ?2)").bind("p", "1"),
			d1.prepare("INSERT INTO kv (k, v) VALUES (?1, ?2)").bind("q", "2"),
		]);
		expect(res.length).toBe(2);
		const count = await d1.prepare("SELECT COUNT(*) AS n FROM kv").first<{
			n: number;
		}>();
		expect(count?.n).toBe(2);
	});

	test("batch() rolls back atomically when a later statement fails", async () => {
		// The table has a primary-key constraint on k.
		await d1
			.prepare("INSERT INTO kv (k, v) VALUES (?1, ?2)")
			.bind("existing", "x")
			.run();

		await expect(
			d1.batch([
				d1.prepare("INSERT INTO kv (k, v) VALUES (?1, ?2)").bind("new", "1"),
				// Duplicate key should abort the whole transaction.
				d1
					.prepare("INSERT INTO kv (k, v) VALUES (?1, ?2)")
					.bind("existing", "y"),
			]),
		).rejects.toThrow();

		const count = await d1.prepare("SELECT COUNT(*) AS n FROM kv").first<{
			n: number;
		}>();
		// The first insert in the batch must have been rolled back.
		expect(count?.n).toBe(1);
	});
});

describe("applyMigrations", () => {
	let dir: string;
	let db: Database;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "dsdk-migrate-"));
		db = new Database(":memory:");
	});

	afterEach(() => {
		db.close();
		rmSync(dir, { recursive: true, force: true });
	});

	test("applies .sql files in sorted order and records them", () => {
		writeFileSync(
			join(dir, "0002_second.sql"),
			"CREATE TABLE t2 (id INTEGER PRIMARY KEY);",
		);
		writeFileSync(
			join(dir, "0001_first.sql"),
			"CREATE TABLE t1 (id INTEGER PRIMARY KEY);",
		);

		const applied = applyMigrations(db, dir);
		expect(applied).toEqual(["0001_first.sql", "0002_second.sql"]);

		// Both tables exist.
		const tables = db
			.query(
				"SELECT name FROM sqlite_master WHERE type='table' AND name IN ('t1','t2') ORDER BY name",
			)
			.all() as { name: string }[];
		expect(tables.map((t) => t.name)).toEqual(["t1", "t2"]);

		// migrations bookkeeping table records the file names.
		const recorded = db
			.query("SELECT name FROM migrations ORDER BY name")
			.all() as { name: string }[];
		expect(recorded.map((r) => r.name)).toEqual([
			"0001_first.sql",
			"0002_second.sql",
		]);
	});

	test("is idempotent - a second run applies nothing", () => {
		writeFileSync(
			join(dir, "0001_first.sql"),
			"CREATE TABLE t1 (id INTEGER PRIMARY KEY);",
		);
		expect(applyMigrations(db, dir)).toEqual(["0001_first.sql"]);
		// Re-running would error if it tried to re-CREATE the table; instead it
		// must apply nothing.
		expect(applyMigrations(db, dir)).toEqual([]);
	});

	test("applies only new files on a subsequent run", () => {
		writeFileSync(
			join(dir, "0001_first.sql"),
			"CREATE TABLE t1 (id INTEGER PRIMARY KEY);",
		);
		applyMigrations(db, dir);

		writeFileSync(
			join(dir, "0002_second.sql"),
			"CREATE TABLE t2 (id INTEGER PRIMARY KEY);",
		);
		expect(applyMigrations(db, dir)).toEqual(["0002_second.sql"]);
	});

	test("ignores non-.sql files", () => {
		writeFileSync(join(dir, "README.md"), "# not a migration");
		writeFileSync(
			join(dir, "0001_first.sql"),
			"CREATE TABLE t1 (id INTEGER PRIMARY KEY);",
		);
		expect(applyMigrations(db, dir)).toEqual(["0001_first.sql"]);
	});

	test("multi-statement files and -- comments are preserved (db.exec path)", () => {
		writeFileSync(
			join(dir, "0001_multi.sql"),
			`-- create the first table
CREATE TABLE a (id INTEGER PRIMARY KEY);
-- and the second
CREATE TABLE b (id INTEGER PRIMARY KEY);`,
		);
		expect(applyMigrations(db, dir)).toEqual(["0001_multi.sql"]);
		const tables = db
			.query(
				"SELECT name FROM sqlite_master WHERE type='table' AND name IN ('a','b') ORDER BY name",
			)
			.all() as { name: string }[];
		expect(tables.map((t) => t.name)).toEqual(["a", "b"]);
	});
});
