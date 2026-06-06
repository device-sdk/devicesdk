/**
 * meteredStorage — wraps a real `DurableObjectStorage` (obtained inside
 * `runInDurableObject`) in a transparent counting layer so tests can assert how
 * many storage *rows* a code path reads and writes.
 *
 * Why this exists: the `Device` DO is SQLite-backed (`new_sqlite_classes`), so
 * every KV op (`get`/`put`/`delete`/`list`) and every `sql.exec(...)` bills as
 * rows read / rows written. A production quota alert on "Durable Object rows
 * written" is almost always a regression where a hot path (per-message,
 * per-alarm, per-connect) started writing O(N) rows where O(1) was expected, or
 * an unbounded table grew. These counters turn that class of regression into a
 * failing test instead of a surprise bill.
 *
 * Row-accounting model (matches how the storage backend bills):
 *   - KV `put(key, value)`            → 1 row written  (the value is one row,
 *                                        regardless of how large the value is).
 *   - KV `put({ k1, k2 })`            → N rows written (one per key).
 *   - KV `delete(key)` / `delete([…])`→ 1 / N rows written (a delete is a write).
 *   - KV `get(key)` / `get([…])`      → 1 / N rows read.
 *   - KV `list()`                     → result-size rows read.
 *   - `sql.exec(q)`                   → cursor.rowsRead / cursor.rowsWritten,
 *                                        captured eagerly for writes and again
 *                                        after the cursor is consumed for reads.
 *
 * The wrapper delegates every other member straight through, so the code under
 * test is unaware it is being metered.
 */

export interface SqlExecRecord {
	/** First SQL keyword, upper-cased (INSERT / DELETE / SELECT / CREATE / …). */
	verb: string;
	rowsRead: number;
	rowsWritten: number;
}

export interface StorageCounters {
	/** Rows read via KV get/list. */
	kvReads: number;
	/** Rows written via KV put/delete. */
	kvWrites: number;
	/** One record per `sql.exec(...)` call, in call order. */
	sqlExecs: SqlExecRecord[];
}

export interface MeteredStorage {
	/** Drop-in replacement to pass wherever a `DurableObjectStorage` is expected. */
	storage: DurableObjectStorage;
	counters: StorageCounters;
	/** Number of sql.exec calls, optionally filtered by verb (e.g. "INSERT"). */
	sqlExecCount(verb?: string): number;
	/** Total rows written across KV writes and SQL writes. */
	rowsWritten(): number;
	/** Total rows read across KV reads and SQL reads. */
	rowsRead(): number;
}

/** Reads a numeric getter defensively — a runtime that omits it leaves the record untouched. */
function captureCursorCounts(
	cursor: SqlStorageCursor<Record<string, SqlStorageValue>>,
	record: SqlExecRecord,
): void {
	const written = cursor.rowsWritten;
	if (typeof written === "number") record.rowsWritten = written;
	const read = cursor.rowsRead;
	if (typeof read === "number") record.rowsRead = read;
}

/**
 * Wraps a cursor so consuming it (`toArray`/`one`/`next`/`raw`) re-captures the
 * final rowsRead/rowsWritten — SELECT counts are only final after consumption.
 */
function wrapCursor(
	cursor: SqlStorageCursor<Record<string, SqlStorageValue>>,
	record: SqlExecRecord,
): SqlStorageCursor<Record<string, SqlStorageValue>> {
	const consuming = new Set(["toArray", "one", "next", "raw"]);
	return new Proxy(cursor, {
		get(target, prop, receiver) {
			const value = Reflect.get(target, prop, receiver);
			if (typeof prop === "string" && consuming.has(prop)) {
				const fn = value as (...args: unknown[]) => unknown;
				return (...args: unknown[]) => {
					const out = fn.apply(target, args);
					captureCursorCounts(target, record);
					return out;
				};
			}
			return typeof value === "function"
				? (value as (...args: unknown[]) => unknown).bind(target)
				: value;
		},
	});
}

function meterSql(realSql: SqlStorage, counters: StorageCounters): SqlStorage {
	return new Proxy(realSql, {
		get(target, prop, receiver) {
			if (prop === "exec") {
				return (
					query: string,
					...bindings: unknown[]
				): SqlStorageCursor<Record<string, SqlStorageValue>> => {
					const verb = query.trim().split(/\s+/)[0]?.toUpperCase() ?? "";
					const exec = target.exec as (
						q: string,
						...b: unknown[]
					) => SqlStorageCursor<Record<string, SqlStorageValue>>;
					const cursor = exec.call(target, query, ...bindings);
					const record: SqlExecRecord = { verb, rowsRead: 0, rowsWritten: 0 };
					counters.sqlExecs.push(record);
					// Writes (INSERT/UPDATE/DELETE) execute eagerly — counts are
					// final now. Reads update again when the cursor is consumed.
					captureCursorCounts(cursor, record);
					return wrapCursor(cursor, record);
				};
			}
			const value = Reflect.get(target, prop, receiver);
			return typeof value === "function"
				? (value as (...args: unknown[]) => unknown).bind(target)
				: value;
		},
	});
}

export function meterStorage(real: DurableObjectStorage): MeteredStorage {
	const counters: StorageCounters = { kvReads: 0, kvWrites: 0, sqlExecs: [] };
	const meteredSql = meterSql(real.sql, counters);

	const getFn = real.get as (
		keyOrKeys: string | string[],
		options?: DurableObjectGetOptions,
	) => Promise<unknown>;
	const putFn = real.put as (
		keyOrEntries: unknown,
		valueOrOptions?: unknown,
		options?: unknown,
	) => Promise<void>;
	const deleteFn = real.delete as (
		keyOrKeys: string | string[],
		options?: DurableObjectPutOptions,
	) => Promise<boolean | number>;
	const listFn = real.list as (
		options?: DurableObjectListOptions,
	) => Promise<Map<string, unknown>>;

	const intercept: Record<string | symbol, unknown> = {
		sql: meteredSql,
		get: (keyOrKeys: string | string[], options?: DurableObjectGetOptions) => {
			counters.kvReads += Array.isArray(keyOrKeys) ? keyOrKeys.length : 1;
			return getFn.call(real, keyOrKeys, options);
		},
		put: (
			keyOrEntries: string | Record<string, unknown>,
			valueOrOptions?: unknown,
			options?: unknown,
		) => {
			counters.kvWrites +=
				typeof keyOrEntries === "string" ? 1 : Object.keys(keyOrEntries).length;
			return putFn.call(real, keyOrEntries, valueOrOptions, options);
		},
		delete: (
			keyOrKeys: string | string[],
			options?: DurableObjectPutOptions,
		) => {
			counters.kvWrites += Array.isArray(keyOrKeys) ? keyOrKeys.length : 1;
			return deleteFn.call(real, keyOrKeys, options);
		},
		list: (options?: DurableObjectListOptions) =>
			listFn.call(real, options).then((res) => {
				counters.kvReads += res.size;
				return res;
			}),
	};

	const storage = new Proxy(real, {
		get(target, prop, receiver) {
			if (prop in intercept) return intercept[prop];
			const value = Reflect.get(target, prop, receiver);
			return typeof value === "function"
				? (value as (...args: unknown[]) => unknown).bind(target)
				: value;
		},
	});

	return {
		storage,
		counters,
		sqlExecCount: (verb?: string) =>
			verb === undefined
				? counters.sqlExecs.length
				: counters.sqlExecs.filter((e) => e.verb === verb).length,
		rowsWritten: () =>
			counters.kvWrites +
			counters.sqlExecs.reduce((sum, e) => sum + e.rowsWritten, 0),
		rowsRead: () =>
			counters.kvReads +
			counters.sqlExecs.reduce((sum, e) => sum + e.rowsRead, 0),
	};
}

/**
 * Minimal `DurableObjectState` stand-in for code that only touches
 * `ctx.storage` and `ctx.getWebSockets` (e.g. logStreaming). Lets a test feed a
 * metered storage into functions typed against the full state without standing
 * up a real WebSocket fan-out.
 */
export function fakeCtxWithStorage(
	storage: DurableObjectStorage,
): DurableObjectState {
	return {
		storage,
		getWebSockets: () => [],
	} as unknown as DurableObjectState;
}
