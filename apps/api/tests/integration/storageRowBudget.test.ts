/**
 * Storage row-budget guardrails.
 *
 * The `Device` DO is SQLite-backed, so every KV op and every `device_logs`
 * SQL statement bills as rows read / rows written. A production "Durable Object
 * rows written" quota alert is almost always a regression where a hot path
 * (per-message / per-alarm / per-connect / per-log) starts writing O(N) rows
 * where O(1) was intended, or an unbounded table grows. These tests pin the
 * row cost of the known hot paths so such a regression fails CI instead of
 * surfacing as a surprise bill.
 *
 * Mechanism: `runInDurableObject` hands us the real `DurableObjectStorage`
 * inside the DO's IO context; `meterStorage` wraps it in a transparent counting
 * layer; we drive the actual production functions and assert the row counts.
 * See tests/helpers/meteredStorage.ts for the accounting model.
 */

import { env, runInDurableObject } from "cloudflare:test";
import type { GpioStateChanged } from "@devicesdk/core";
import { describe, expect, it } from "vitest";
import {
	ensureLogsTable,
	type LogStreamState,
	persistAndBroadcastLog,
} from "../../src/durableObjects/lib/logStreaming";
import {
	drainPendingUserWorkerEvents,
	enqueueUserWorkerEvent,
	MAX_DRAIN_BATCH,
	PENDING_USER_EVENTS_KEY,
	type PendingUserEvent,
} from "../../src/durableObjects/lib/userEventQueue";
import type { IUserDeviceWorker } from "../../src/durableObjects/lib/userWorkerTypes";
import {
	LOG_CLEANUP_INTERVAL,
	LOG_MAX_STORED,
} from "../../src/foundation/consts";
import { fakeCtxWithStorage, meterStorage } from "../helpers/meteredStorage";

function getTestStub(name: string) {
	const id = env.TEST_DEVICE.idFromName(name);
	return env.TEST_DEVICE.get(id);
}

/** A user worker that does nothing — drains complete without a real LOADER. */
const noopWorker: IUserDeviceWorker = {
	onDeviceConnect: async () => {},
	onDeviceDisconnect: async () => {},
	onMessage: async () => {},
};

/** A small, valid DeviceResponse for `message` events. */
const msg = (i: number): GpioStateChanged => ({
	id: `m-${i}`,
	type: "gpio_state_changed",
	payload: { pin: i % 40, state: i % 2 === 0 ? "high" : "low" },
});

describe.sequential("DO storage row budget — pending user-event queue", () => {
	it("enqueue writes exactly one row regardless of backlog size", async () => {
		const stub = getTestStub("row-budget:enqueue-o1");
		await runInDurableObject(stub, async (_instance, state) => {
			// A large pre-existing backlog. The queue is a single KV value, so the
			// append cost must NOT scale with backlog length.
			const backlog: PendingUserEvent[] = Array.from(
				{ length: 400 },
				(_, i) => ({ kind: "message", message: msg(i) }),
			);
			await state.storage.put(PENDING_USER_EVENTS_KEY, backlog);
			await state.storage.deleteAlarm();

			const m = meterStorage(state.storage);
			await enqueueUserWorkerEvent(m.storage, {
				kind: "message",
				message: msg(999),
			});

			// 1 read (load queue) + 1 write (store queue). One row, not 401.
			expect(m.counters.kvReads).toBe(1);
			expect(m.counters.kvWrites).toBe(1);

			await state.storage.delete(PENDING_USER_EVENTS_KEY);
			await state.storage.deleteAlarm();
		});
	});

	it("a redundant connect enqueue writes zero rows (coalesced)", async () => {
		const stub = getTestStub("row-budget:enqueue-coalesce");
		await runInDurableObject(stub, async (_instance, state) => {
			await state.storage.put(PENDING_USER_EVENTS_KEY, [{ kind: "connect" }]);
			await state.storage.deleteAlarm();

			const m = meterStorage(state.storage);
			// onDeviceConnect is idempotent, so a reconnect storm must not append
			// (and must not write) when a connect is already queued.
			await enqueueUserWorkerEvent(m.storage, { kind: "connect" });

			expect(m.counters.kvReads).toBe(1); // reads to check for a dup
			expect(m.counters.kvWrites).toBe(0); // but writes nothing

			await state.storage.delete(PENDING_USER_EVENTS_KEY);
			await state.storage.deleteAlarm();
		});
	});

	it("draining a large backlog writes O(1) rows, not one per event", async () => {
		const stub = getTestStub("row-budget:drain-bounded");
		await runInDurableObject(stub, async (_instance, state) => {
			const backlog: PendingUserEvent[] = Array.from(
				{ length: MAX_DRAIN_BATCH + 25 },
				(_, i) => ({ kind: "message", message: msg(i) }),
			);
			await state.storage.put(PENDING_USER_EVENTS_KEY, backlog);
			await state.storage.deleteAlarm();

			const m = meterStorage(state.storage);
			await drainPendingUserWorkerEvents({
				storage: m.storage,
				getOrCreateUserWorker: async () => noopWorker,
				initializeCrons: async () => {},
			});

			// 1 read (load queue) + 1 write (persist the un-drained remainder).
			// Independent of how many events were dispatched this batch.
			expect(m.counters.kvReads).toBe(1);
			expect(m.counters.kvWrites).toBe(1);

			await state.storage.delete(PENDING_USER_EVENTS_KEY);
			await state.storage.deleteAlarm();
		});
	});

	it("draining a backlog that fits in one batch clears it with a single write", async () => {
		const stub = getTestStub("row-budget:drain-clear");
		await runInDurableObject(stub, async (_instance, state) => {
			const backlog: PendingUserEvent[] = [
				{ kind: "connect" },
				{ kind: "message", message: msg(1) },
				{ kind: "message", message: msg(2) },
			];
			await state.storage.put(PENDING_USER_EVENTS_KEY, backlog);
			await state.storage.deleteAlarm();

			const m = meterStorage(state.storage);
			await drainPendingUserWorkerEvents({
				storage: m.storage,
				getOrCreateUserWorker: async () => noopWorker,
				initializeCrons: async () => {},
			});

			// 1 read + 1 delete (queue emptied). A delete bills as one row written.
			expect(m.counters.kvReads).toBe(1);
			expect(m.counters.kvWrites).toBe(1);

			await state.storage.delete(PENDING_USER_EVENTS_KEY);
			await state.storage.deleteAlarm();
		});
	});
});

describe.sequential("DO storage row budget — device logs", () => {
	it("persists exactly one row per log and does not scan the table on each write", async () => {
		const stub = getTestStub("row-budget:logs-per-insert");
		await runInDurableObject(stub, async (_instance, state) => {
			const m = meterStorage(state.storage);
			const ctx = fakeCtxWithStorage(m.storage);
			const logState: LogStreamState = {
				logsTableReady: false,
				logWriteCount: 0,
				lastLogCleanupAt: Date.now(),
			};

			const n = 40; // below LOG_CLEANUP_INTERVAL, so no overflow scan runs
			for (let k = 0; k < n; k++) {
				persistAndBroadcastLog(ctx, logState, "log", `line ${k}`);
			}

			// Each log costs 3 row-writes: the table row + the TEXT PRIMARY KEY
			// auto-index + the idx_logs_created_at index. (Chatty logging is thus
			// 3x as expensive as it looks — directly relevant to the rows-written
			// quota.) Pinning it means any schema/index change that shifts
			// per-log billing is a deliberate decision, not a silent regression.
			const WRITES_PER_LOG_INSERT = 3;
			const inserts = m.counters.sqlExecs.filter((e) => e.verb === "INSERT");
			expect(inserts.length).toBe(n);
			expect(
				inserts.every((e) => e.rowsWritten === WRITES_PER_LOG_INSERT),
			).toBe(true);
			// No per-insert table scan, and crucially NO overflow DELETE on the
			// per-log hot path (writes below LOG_CLEANUP_INTERVAL).
			expect(inserts.every((e) => e.rowsRead === 0)).toBe(true);
			expect(m.sqlExecCount("DELETE")).toBe(0);
		});
	});

	it("runs the overflow scan at most once across a burst (wall-clock throttled)", async () => {
		const stub = getTestStub("row-budget:logs-throttle");
		await runInDurableObject(stub, async (_instance, state) => {
			const m = meterStorage(state.storage);
			const ctx = fakeCtxWithStorage(m.storage);
			const logState: LogStreamState = {
				logsTableReady: false,
				logWriteCount: 0,
				lastLogCleanupAt: 0, // gate open at the first interval boundary
			};

			const n = LOG_CLEANUP_INTERVAL * 2 + 50; // crosses the boundary twice
			for (let k = 0; k < n; k++) {
				persistAndBroadcastLog(ctx, logState, "log", `line ${k}`);
			}

			expect(m.sqlExecCount("INSERT")).toBe(n);
			// The first boundary runs cleanup (2 DELETEs) then stamps
			// lastLogCleanupAt, closing the 6h gate so later boundaries don't
			// re-scan. Regression guard: removing the throttle makes this O(n/100).
			expect(m.sqlExecCount("DELETE")).toBeLessThanOrEqual(2);
		});
	});

	it("overflow cleanup trims the table back to LOG_MAX_STORED rows", async () => {
		const stub = getTestStub("row-budget:logs-cap");
		await runInDurableObject(stub, async (_instance, state) => {
			// Seed well past the cap with recent rows so the 24h retention delete
			// is a no-op and the overflow trim is what does the bounding.
			const seedState: LogStreamState = {
				logsTableReady: false,
				logWriteCount: 0,
				lastLogCleanupAt: 0,
			};
			ensureLogsTable(state.storage.sql, seedState);
			const seed = LOG_MAX_STORED + 250;
			const base = Date.now() - seed * 10;
			for (let k = 0; k < seed; k++) {
				state.storage.sql.exec(
					"INSERT INTO device_logs (id, level, message, created_at) VALUES (?, ?, ?, ?)",
					crypto.randomUUID(),
					"log",
					`seed ${k}`,
					base + k * 10,
				);
			}

			// One more persist trips logWriteCount to the cleanup interval with the
			// wall-clock gate open, so exactly one overflow trim runs.
			const ctx = fakeCtxWithStorage(state.storage);
			const liveState: LogStreamState = {
				logsTableReady: true,
				logWriteCount: LOG_CLEANUP_INTERVAL - 1,
				lastLogCleanupAt: 0,
			};
			persistAndBroadcastLog(ctx, liveState, "log", "trigger trim");

			const count = state.storage.sql
				.exec("SELECT count(*) AS n FROM device_logs")
				.one().n as number;
			expect(count).toBe(LOG_MAX_STORED);
		});
	});
});
