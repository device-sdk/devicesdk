/**
 * TestDevice — a subclass of BaseDevice that exposes test-only helpers.
 *
 * These methods bypass internal guards (e.g. the __internal: key prefix) so
 * integration tests can seed and inspect internal state without going through
 * the full device-connect flow. They are NOT part of the production API surface
 * and must never be exported as the primary `Device` binding.
 *
 * Usage: bind TEST_DEVICE → TestDevice in the miniflare/vitest config.
 */

import type { CronStorage } from "./cronDispatch";
import { BaseDevice, CRON_STORAGE_KEY } from "./device";
import {
	PENDING_USER_EVENTS_KEY,
	type PendingUserEvent,
} from "./userEventQueue";
import type { IUserDeviceWorker } from "./userWorkerTypes";

export class TestDevice extends BaseDevice {
	// Test-only injection point: when set, getOrCreateUserWorker throws an
	// error with this message instead of going through the real LOADER path.
	// Used to drive drainPendingUserWorkerEvents through its transient/persistent
	// classification branches without depending on a real CF rate limit.
	private _testWorkerInitError?: string;
	/**
	 * Returns the scheduled DO alarm timestamp (ms), or null if none is set.
	 */
	async getScheduledAlarmTime(): Promise<number | null> {
		return this.ctx.storage.getAlarm();
	}

	/**
	 * Triggers the DO alarm handler directly.
	 * `alarm` is a reserved DO lifecycle method and cannot be called over JSRPC;
	 * this wrapper delegates to it so tests can invoke the alarm path.
	 */
	async triggerAlarm(): Promise<void> {
		await this.alarm();
	}

	/**
	 * Accepts a synthetic "device"-tagged WebSocket so the DO reports a live
	 * device connection (getWebSockets("device").length > 0), triggers the
	 * alarm, then snapshots the resulting alarm time — all within one RPC so
	 * the connection state is deterministic for the whole alarm() invocation.
	 * Used to exercise the "device connected" branch of the cron cost guard,
	 * which otherwise can't be reached without a real WebSocket upgrade.
	 *
	 * The socket is torn down after the alarm time is read so vitest-pool-workers'
	 * cleanup isn't left with a dangling connection.
	 */
	async triggerAlarmWhileConnected(): Promise<number | null> {
		const [, server] = Object.values(new WebSocketPair());
		this.ctx.acceptWebSocket(server, ["device"]);
		try {
			await this.alarm();
			return await this.ctx.storage.getAlarm();
		} finally {
			try {
				server.close(1000, "test cleanup");
			} catch {
				/* already closed */
			}
		}
	}

	/**
	 * Test cleanup: cancel any pending alarm and clear the user-event queue.
	 * Used by tests that intentionally arm a near-future alarm (e.g. a transient
	 * retry backoff) so it can't fire during vitest-pool-workers' teardown.
	 */
	async clearSchedulerState(): Promise<void> {
		await this.ctx.storage.deleteAlarm();
		await this.ctx.storage.delete(PENDING_USER_EVENTS_KEY);
	}

	/**
	 * Seeds the internal cron storage directly, bypassing the KV guard.
	 * Pass null to clear the schedule.
	 */
	async seedCronStorage(storage: CronStorage | null): Promise<void> {
		if (storage === null) {
			await this.ctx.storage.delete(CRON_STORAGE_KEY);
		} else {
			await this.ctx.storage.put(CRON_STORAGE_KEY, storage);
		}
	}

	/**
	 * testKvPut: wraps kvPut and returns the error message instead of throwing.
	 *
	 * When a DO method throws synchronously, the workerd I/O framework logs an
	 * "uncaught exception" before the rejection propagates to the test. This breaks
	 * vitest-pool-workers' isolated storage cleanup. Returning the error as a value
	 * avoids the workerd-level exception while still letting tests verify the guard.
	 */
	async testKvPut<T>(key: string, value: T): Promise<string | null> {
		try {
			await this.kvPut(key, value);
			return null;
		} catch (e) {
			return (e as Error).message;
		}
	}

	/**
	 * testKvGet: wraps kvGet and returns the error message instead of throwing.
	 * See testKvPut for the rationale.
	 */
	async testKvGet<T = unknown>(
		key: string,
	): Promise<{ value: T | undefined; error: string | null }> {
		try {
			const value = await this.kvGet<T>(key);
			return { value, error: null };
		} catch (e) {
			return { value: undefined, error: (e as Error).message };
		}
	}

	/**
	 * testHandleRemoteCall: wraps handleRemoteCall and returns the error message instead of throwing.
	 * See testKvPut for the rationale — DO RPC throws break vitest-pool-workers isolated storage cleanup.
	 */
	async testHandleRemoteCall(
		req: Parameters<BaseDevice["handleRemoteCall"]>[0],
	): Promise<string | null> {
		try {
			await this.handleRemoteCall(req);
			return null;
		} catch (e) {
			return (e as Error).message;
		}
	}

	/**
	 * Calls initializeCrons with a minimal mock worker that returns the given crons map.
	 * Allows integration tests to exercise the initialize path without a real LOADER binding.
	 */
	async testInitializeCrons(crons: Record<string, string>): Promise<void> {
		const mockWorker: IUserDeviceWorker = {
			onDeviceConnect: async () => {},
			onDeviceDisconnect: async () => {},
			onMessage: async () => {},
			getCrons: async () => crons,
		};
		await this.initializeCrons(mockWorker);
	}

	/**
	 * Invokes the connect-time cron re-arm (rearmCronAlarmFromStorage) directly,
	 * so tests can verify a reconnect re-arms a previously-cancelled cron alarm
	 * from the persisted schedule without performing a full WebSocket upgrade.
	 */
	async testRearmCronsFromStorage(): Promise<void> {
		await this.rearmCronAlarmFromStorage();
	}

	/**
	 * Reads the pending user-worker event queue. Returns an empty array when
	 * the key is unset.
	 */
	async getPendingUserEvents(): Promise<PendingUserEvent[]> {
		return (
			(await this.ctx.storage.get<PendingUserEvent[]>(
				PENDING_USER_EVENTS_KEY,
			)) ?? []
		);
	}

	/**
	 * Seeds the pending user-worker event queue. Pass null to clear it.
	 */
	async seedPendingUserEvents(
		events: PendingUserEvent[] | null,
	): Promise<void> {
		if (events === null) {
			await this.ctx.storage.delete(PENDING_USER_EVENTS_KEY);
		} else {
			await this.ctx.storage.put(PENDING_USER_EVENTS_KEY, events);
		}
	}

	/**
	 * Calls the protected enqueueUserWorkerEvent and returns the post-enqueue
	 * snapshot in the same DO RPC. Inspecting state across two RPCs would race
	 * the ~10 ms alarm that enqueue arms — by the second call the alarm has
	 * fired and the drain has cleared the queue.
	 *
	 * The alarm and pending queue are cleared before returning so the alarm
	 * cannot fire during vitest-pool-workers' isolated-storage cleanup.
	 */
	async testEnqueueAndSnapshot(event: PendingUserEvent): Promise<{
		pending: PendingUserEvent[];
		alarmTime: number | null;
	}> {
		await this.enqueueUserWorkerEvent(event);
		const pending = await this.getPendingUserEvents();
		const alarmTime = await this.ctx.storage.getAlarm();
		await this.ctx.storage.deleteAlarm();
		await this.ctx.storage.delete(PENDING_USER_EVENTS_KEY);
		return { pending, alarmTime };
	}

	/**
	 * Pre-arms a far-future alarm, then runs enqueueUserWorkerEvent and
	 * snapshots the resulting alarm time within the same RPC. Used to verify
	 * that enqueue does not push an already-sooner alarm out — across two
	 * RPCs, the enqueue's own ~10 ms alarm would fire and clear the state.
	 */
	async testEnqueueDoesNotPushAlarmOut(
		preArmedAlarmAt: number,
		event: PendingUserEvent,
	): Promise<{ before: number | null; after: number | null }> {
		await this.ctx.storage.setAlarm(preArmedAlarmAt);
		const before = await this.ctx.storage.getAlarm();
		await this.enqueueUserWorkerEvent(event);
		const after = await this.ctx.storage.getAlarm();
		await this.ctx.storage.deleteAlarm();
		await this.ctx.storage.delete(PENDING_USER_EVENTS_KEY);
		return { before, after };
	}

	/**
	 * Calls the protected drainPendingUserWorkerEvents and returns the
	 * resulting state. Tests use this with `setTestWorkerInitError` to drive
	 * the transient / persistent classification branches deterministically.
	 */
	async testDrainPendingUserWorkerEvents(): Promise<{
		workerResolved: boolean;
		remaining: PendingUserEvent[];
	}> {
		const worker = await this.drainPendingUserWorkerEvents();
		const remaining = await this.getPendingUserEvents();
		return { workerResolved: worker !== null, remaining };
	}

	/**
	 * Configures the next call to getOrCreateUserWorker to throw an error with
	 * the given message (mimicking what would happen if the real CF Worker
	 * Loader threw, e.g. "Too many concurrent dynamic workers"). Pass null to
	 * disable.
	 */
	async setTestWorkerInitError(message: string | null): Promise<void> {
		this._testWorkerInitError = message ?? undefined;
	}

	protected override async getOrCreateUserWorker(): Promise<IUserDeviceWorker> {
		if (this._testWorkerInitError !== undefined) {
			// Match the production wrapper's shape so transient-pattern
			// matching is exercised end-to-end.
			throw new Error(
				`Failed to initialize user worker: ${this._testWorkerInitError}`,
			);
		}
		return super.getOrCreateUserWorker();
	}

	/**
	 * Drives webSocketMessage with a synthetic "device"-tagged WebSocket so
	 * tests can exercise the dispatch path without standing up a real WS
	 * upgrade (which miniflare doesn't fully support). Returns the post-call
	 * snapshot in the same RPC so the ASAP alarm can't race the inspection.
	 *
	 * Side effects (alarm + pending queue) are cleaned up before returning
	 * so vitest-pool-workers' isolated-storage cleanup can run cleanly.
	 */
	async testHandleDeviceMessage(data: string): Promise<{
		pending: PendingUserEvent[];
		alarmTime: number | null;
	}> {
		const [, server] = Object.values(new WebSocketPair());
		this.ctx.acceptWebSocket(server, ["device"]);
		await this.webSocketMessage(server, data);
		const pending = await this.getPendingUserEvents();
		const alarmTime = await this.ctx.storage.getAlarm();
		await this.ctx.storage.deleteAlarm();
		await this.ctx.storage.delete(PENDING_USER_EVENTS_KEY);
		try {
			server.close(1000, "test cleanup");
		} catch {
			/* already closed */
		}
		return { pending, alarmTime };
	}

	/**
	 * Seeds the device_logs SQLite table with synthetic rows so the watcher
	 * backfill path has something to replay. Pattern: chronological IDs and
	 * timestamps offset by `i` ms so order is deterministic.
	 */
	async testSeedLogs(
		entries: Array<{ id: string; level: string; message: string }>,
	): Promise<void> {
		// ensureLogsTable is private; persistLog is the public seam — but it
		// also fires broadcasts/cleanup we don't want here. Direct SQL is
		// fine inside test-only code.
		this.ctx.storage.sql.exec(`
			CREATE TABLE IF NOT EXISTS device_logs (
				id TEXT PRIMARY KEY,
				level TEXT NOT NULL,
				message TEXT NOT NULL,
				created_at INTEGER NOT NULL
			)
		`);
		const base = Date.now() - entries.length * 100;
		for (let i = 0; i < entries.length; i++) {
			const e = entries[i];
			this.ctx.storage.sql.exec(
				"INSERT INTO device_logs (id, level, message, created_at) VALUES (?, ?, ?, ?)",
				e.id,
				e.level,
				e.message,
				base + i * 100,
			);
		}
	}

	/**
	 * Drives `handleWatcherUpgrade` with the given query string and returns
	 * the frames delivered to the client side of the resulting WebSocketPair.
	 *
	 * miniflare's WebSocketPair delivers `server.send()` synchronously to the
	 * client side, so capturing frames in the same RPC is safe and avoids
	 * timing/race issues.
	 */
	async testHandleWatcherUpgrade(query: string): Promise<{
		frames: Array<{ event: string; data?: unknown; replay?: boolean }>;
	}> {
		const url = `https://device-do/watch-websocket${query}`;
		const req = new Request(url, {
			method: "GET",
			headers: { Upgrade: "websocket" },
		});
		const resp = await this.handleWatcherUpgrade(req);
		if (resp.status !== 101) {
			throw new Error(`Expected 101 upgrade, got ${resp.status}`);
		}
		const wsResp = resp as Response & { webSocket?: WebSocket };
		const client = wsResp.webSocket;
		if (!client) {
			throw new Error("Upgrade response missing webSocket field");
		}
		client.accept();

		const frames: Array<{ event: string; data?: unknown; replay?: boolean }> =
			[];
		client.addEventListener("message", (e) => {
			try {
				frames.push(JSON.parse(e.data as string));
			} catch {
				/* ignore malformed */
			}
		});

		// Yield once so the queued frames flush.
		await new Promise<void>((r) => setTimeout(r, 0));

		try {
			client.close(1000, "test cleanup");
		} catch {
			/* already closed */
		}
		return { frames };
	}
}
