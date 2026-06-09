import type { Database } from "bun:sqlite";
import type {
	CommandResponseTypeMap,
	DeviceCommand,
	DeviceResponse,
} from "@devicesdk/core";
import { z } from "zod";
import {
	type LogLevel,
	VALID_LOG_LEVELS,
	WS_CLOSE_REPLACED,
} from "../foundation/consts";
import { logger } from "../foundation/logger";
import { recordDeviceUsage } from "../foundation/usageMetrics";
import type { FsBlobStore } from "../storage/fsBlobStore";
import { runWithLogCapture } from "./consoleCapture";
import { type CronStorage, resolveDueCrons } from "./cronDispatch";
import { nextCronTime } from "./cronParser";
import { LocalDeviceSender } from "./deviceSender";
import {
	broadcastStateFromMessage,
	broadcastToWatchers,
	emitStatusEvent,
	fetchRecentLogs,
	type LogStreamState,
	persistAndBroadcastLog,
} from "./logStore";
import { type BridgeFn, loadUserWorker } from "./scriptHost";
import type { DeviceMeta, IUserDeviceWorker, RuntimeSocket } from "./types";

const DeviceMessageSchema = z.object({
	id: z.string().max(64).optional().default(""),
	type: z.string().max(64),
	payload: z.record(z.string(), z.unknown()).optional().default({}),
});

// Storage key for persisted cron schedule state (in device_kv). Uses the
// __internal: prefix which is blocked in kvPut/kvGet/kvDelete so user code
// cannot accidentally corrupt scheduler state.
export const CRON_STORAGE_KEY = "__internal:cron_schedules";

// Prefix reserved for internal keys; blocked from the user-facing kv API.
const INTERNAL_KEY_PREFIX = "__internal:";

// setTimeout clamps to a 32-bit signed millisecond delay; longer waits
// (a cron months out) re-arm in hops.
const MAX_TIMER_DELAY_MS = 2_147_000_000;

/** Returns the earliest nextFireAt across all schedules. */
function earliestFireTime(schedules: CronStorage): number {
	return Object.values(schedules).reduce(
		(min, s) => Math.min(min, s.nextFireAt),
		Infinity,
	);
}

interface PendingCommand {
	resolve: (value: DeviceResponse) => void;
	reject: (reason?: unknown) => void;
	timeoutId: ReturnType<typeof setTimeout>;
	startedAt: number;
	commandType: string;
}

export interface SessionDeps {
	db: Database;
	scripts: FsBlobStore;
	/** Inter-device RPC dispatcher bound to this session's project scope. */
	makeBridge: (meta: DeviceMeta) => BridgeFn;
}

/**
 * Live state and behavior for one device — the in-process replacement for the
 * per-device Durable Object (BaseDevice). One instance per `${projectId}:
 * ${deviceId}`, created lazily by DeviceHub and kept for the process lifetime.
 *
 * Carried over from the DO: single-live-socket enforcement (WS_CLOSE_REPLACED),
 * the pendingCommands ack map with 5 s timeouts, watcher sockets with log
 * backfill, connection-gated crons with skip-missed-slot semantics, and the
 * per-device KV with the __internal: prefix block.
 *
 * Deleted relative to the DO: hibernation recovery, the alarm-deferred user
 * event queue (existed only because the Worker Loader hangs inside
 * Hibernation-API handlers — in-process we dispatch directly), daily message
 * limits, and Worker Loader stub lifecycle management. Handler ordering is
 * preserved by a per-session FIFO promise chain.
 */
export class DeviceSession {
	private static readonly MAX_PENDING_COMMANDS = 100;
	private static readonly COMMAND_TIMEOUT_MS = 5000;

	readonly projectId: string;
	readonly deviceId: string;

	private deps: SessionDeps;
	private deviceWs: RuntimeSocket | null = null;
	private connectedSince: number | null = null;
	private meta: DeviceMeta | null = null;

	private watchers = new Set<RuntimeSocket>();
	private pendingCommands = new Map<string, PendingCommand>();
	private logStream: LogStreamState = { logWriteCount: 0, lastLogCleanupAt: 0 };

	// FIFO chain serializing user-handler dispatch — preserves the ordering
	// guarantee the DO's alarm-drained event queue provided.
	private dispatchChain: Promise<void> = Promise.resolve();

	// Loaded user script, keyed by versionId (version-keyed bundle files make
	// staleness impossible; a deploy bumps versionId → reload).
	private worker: {
		versionId: string;
		instance: IUserDeviceWorker;
	} | null = null;

	private cronTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(projectId: string, deviceId: string, deps: SessionDeps) {
		this.projectId = projectId;
		this.deviceId = deviceId;
		this.deps = deps;
	}

	// ---------------------------------------------------------------- device WS

	handleDeviceOpen(ws: RuntimeSocket, meta: DeviceMeta): void {
		// Enforce a single live device session. A device that lost power can
		// leave a half-open socket; close it before accepting the replacement
		// so command dispatch never targets a dead connection.
		if (this.deviceWs && this.deviceWs !== ws) {
			try {
				this.deviceWs.close(
					WS_CLOSE_REPLACED,
					"Replaced by a new device connection",
				);
			} catch {
				/* socket already closing/closed */
			}
		}

		this.deviceWs = ws;
		this.meta = meta;
		this.connectedSince = Date.now();

		this.deps.db
			.query(
				"UPDATE devices SET connected = 1, last_connected_at = ?1 WHERE id = ?2",
			)
			.run(this.connectedSince, this.deviceId);

		emitStatusEvent(this.watchers, {
			connected: true,
			connectedSince: this.connectedSince,
		});

		// Resume any persisted cron schedule now that a device socket is live
		// again (crons are connection-gated; missed slots are skipped, never
		// caught up). Handshake-independent, mirroring the DO's re-arm-on-accept.
		try {
			this.rearmCronsFromStorage();
		} catch (err) {
			logger.warn("Cron re-arm on connect failed (degraded)", {
				deviceId: this.deviceId,
				error: (err as Error).message,
			});
		}
	}

	handleDeviceMessage(ws: RuntimeSocket, data: string | ArrayBuffer): void {
		// Stale-socket guard: a replaced connection may still deliver a frame.
		if (ws !== this.deviceWs) return;

		if (typeof data !== "string") {
			logger.warn("Received non-string WebSocket data, ignoring");
			return;
		}

		let parsed: ReturnType<typeof DeviceMessageSchema.safeParse>;
		try {
			parsed = DeviceMessageSchema.safeParse(JSON.parse(data));
		} catch (error) {
			logger.error(error, "Failed to parse message from device", { data });
			return;
		}
		if (!parsed.success) {
			logger.warn("Invalid device message", { error: parsed.error.message });
			return;
		}
		// Keepalive — never wakes user code (and never counts as usage).
		if (parsed.data.type === "ping") return;
		const message = parsed.data as DeviceResponse;

		this.recordUsage({ messagesIn: 1, bytesIn: data.length });

		try {
			if (message.type === "device_connected") {
				this.dispatch(async () => {
					const worker = await this.getWorker();
					await worker.onDeviceConnect();
					await this.initializeCrons(worker);
				}, "onDeviceConnect");
				return;
			}

			// Fan out structured state events to watchers for known hardware
			// messages, alongside pending-command resolution and user dispatch.
			broadcastStateFromMessage(this.watchers, message);

			const pendingCommand = this.pendingCommands.get(message.id);
			if (pendingCommand) {
				clearTimeout(pendingCommand.timeoutId);
				this.pendingCommands.delete(message.id);
				if (message.type === "command_error") {
					pendingCommand.reject(
						new Error(
							`Device error: ${(message.payload as { error?: string }).error}`,
						),
					);
				} else {
					pendingCommand.resolve(message);
				}
			} else {
				this.dispatch(async () => {
					const worker = await this.getWorker();
					await worker.onMessage(message);
				}, "onMessage");
			}
		} catch (error) {
			logger.error(error, "Failed to dispatch device message", { data });
		}
	}

	handleDeviceClose(ws: RuntimeSocket, code: number, reason: string): void {
		if (ws !== this.deviceWs) return;
		this.handleConnectionLost(
			`WebSocket closed. Code: ${code}, Reason: ${reason}`,
		);
	}

	handleDeviceError(ws: RuntimeSocket, error: unknown): void {
		if (ws !== this.deviceWs) return;
		this.handleConnectionLost(`WebSocket error: ${error}`);
	}

	private handleConnectionLost(reason: string): void {
		const connectedSince = this.connectedSince;
		if (connectedSince) {
			this.recordUsage({
				connectedSeconds: Math.max(
					0,
					Math.round((Date.now() - connectedSince) / 1000),
				),
			});
		}

		for (const [, command] of this.pendingCommands) {
			clearTimeout(command.timeoutId);
			command.reject(new Error(reason));
		}
		this.pendingCommands.clear();
		this.deviceWs = null;
		this.connectedSince = null;

		// Cost/contract guard: crons only fire while a device is connected.
		// The schedule stays persisted; reconnect re-arms it.
		this.clearCronTimer();

		emitStatusEvent(this.watchers, { connected: false, connectedSince: null });

		try {
			this.deps.db
				.query("UPDATE devices SET connected = 0 WHERE id = ?1")
				.run(this.deviceId);
		} catch (err) {
			logger.warn("connected=0 write failed (degraded)", {
				deviceId: this.deviceId,
				error: (err as Error).message,
			});
		}

		this.dispatch(async () => {
			const worker = await this.getWorker();
			await worker.onDeviceDisconnect();
		}, "onDeviceDisconnect");
	}

	private recordUsage(
		delta: Omit<
			Parameters<typeof recordDeviceUsage>[1],
			"deviceId" | "projectId"
		>,
	): void {
		recordDeviceUsage(this.deps.db, {
			deviceId: this.deviceId,
			projectId: this.projectId,
			...delta,
		});
	}

	// -------------------------------------------------------------- dispatching

	/**
	 * Serializes user-handler invocations per device (FIFO). Errors are logged
	 * and never break the chain. Console output inside the handler is captured
	 * into device logs.
	 */
	private dispatch(fn: () => Promise<void>, label: string): void {
		this.dispatchChain = this.dispatchChain
			.then(() => runWithLogCapture(this, fn))
			.catch((error) => {
				logger.error(error, `Error in user worker ${label}`, {
					deviceId: this.deviceId,
				});
			});
	}

	/** Awaitable view of the dispatch chain (used by RPC + command endpoints). */
	flushDispatch(): Promise<void> {
		return this.dispatchChain.then(
			() => undefined,
			() => undefined,
		);
	}

	private async getWorker(): Promise<IUserDeviceWorker> {
		const meta = this.meta;
		if (!meta) {
			throw new Error("Device has not connected yet — no script metadata");
		}
		return this.getWorkerForMeta(meta);
	}

	private async getWorkerForMeta(meta: DeviceMeta): Promise<IUserDeviceWorker> {
		if (this.worker?.versionId === meta.versionId) {
			return this.worker.instance;
		}

		const scriptKey = `${meta.userId}/${meta.projectSlug}/${meta.deviceSlug}/${meta.versionId}.js`;
		const scriptPath = this.deps.scripts.filePath(scriptKey);

		const sender = new LocalDeviceSender(this);
		const instance = await loadUserWorker({
			scriptPath,
			entrypointName: meta.entrypointName,
			sender,
			bridge: this.deps.makeBridge(meta),
			getEnvVars: () => this.readEnvVars(meta.projectId),
		});

		this.worker = { versionId: meta.versionId, instance };
		if (!this.meta) this.meta = meta;
		return instance;
	}

	private readEnvVars(projectId: string): Record<string, string> {
		const rows = this.deps.db
			.query("SELECT key, value FROM project_env_vars WHERE project_id = ?1")
			.all(projectId) as { key: string; value: string }[];
		return Object.fromEntries(rows.map((r) => [r.key, r.value]));
	}

	// ------------------------------------------------------------ command path

	sendCommandWithoutAck(command: DeviceCommand): void {
		if (!this.deviceWs) {
			throw new Error("Device not connected");
		}
		const serialized = JSON.stringify(command);
		this.deviceWs.send(serialized);
		this.recordUsage({ messagesOut: 1, bytesOut: serialized.length });
	}

	sendCommandAndWaitForResponse<C extends DeviceCommand>(
		command: C,
	): Promise<CommandResponseTypeMap[C["type"]]> {
		return new Promise((resolve, reject) => {
			if (!this.deviceWs) {
				return reject(new Error("No active session"));
			}
			if (this.pendingCommands.size >= DeviceSession.MAX_PENDING_COMMANDS) {
				return reject(new Error("Too many pending commands"));
			}

			const startedAt = Date.now();
			const timeoutId = setTimeout(() => {
				this.pendingCommands.delete(command.id);
				reject(
					new Error(
						`Timeout: No response from device for command '${command.type}' with id '${command.id}' within 5 seconds.`,
					),
				);
			}, DeviceSession.COMMAND_TIMEOUT_MS);

			this.pendingCommands.set(command.id, {
				resolve: resolve as (value: DeviceResponse) => void,
				reject,
				timeoutId,
				startedAt,
				commandType: command.type,
			});

			try {
				const serialized = JSON.stringify(command);
				this.deviceWs.send(serialized);
				this.recordUsage({ messagesOut: 1, bytesOut: serialized.length });
			} catch (error) {
				clearTimeout(timeoutId);
				this.pendingCommands.delete(command.id);
				reject(error);
			}
		});
	}

	// --------------------------------------------------- REST endpoint surface

	async getConnectionStatus(): Promise<{
		connected: boolean;
		connectedSince: number | null;
	}> {
		return {
			connected: this.deviceWs !== null,
			connectedSince: this.deviceWs ? this.connectedSince : null,
		};
	}

	async handleCommand(
		command: Omit<DeviceCommand, "id">,
	): Promise<{ status: number; body: string }> {
		if (!this.deviceWs) {
			return { status: 503, body: "Device not connected" };
		}
		const fullCommand = {
			...command,
			id: crypto.randomUUID(),
		} as DeviceCommand;
		try {
			const response = await this.sendCommandAndWaitForResponse(fullCommand);
			return { status: 200, body: JSON.stringify(response) };
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "An unknown error occurred";
			const isTimeout = errorMessage.toLowerCase().includes("timeout");
			return { status: isTimeout ? 504 : 500, body: errorMessage };
		}
	}

	async triggerRebootForDeploy(): Promise<{
		rebooted: boolean;
		reason: string;
	}> {
		if (!this.deviceWs) {
			return { rebooted: false, reason: "Device not connected" };
		}
		try {
			const rebootCommand: DeviceCommand = {
				id: crypto.randomUUID(),
				type: "reboot",
				payload: {},
			};
			// Don't close the WebSocket — the device reboots and the connection
			// drops naturally. A close frame in the same TCP segment as the
			// reboot command hard-faults the Pico (tcp_close inside lwIP recv).
			this.deviceWs.send(JSON.stringify(rebootCommand));
			return { rebooted: true, reason: "Reboot command sent" };
		} catch (error) {
			return {
				rebooted: false,
				reason: `Failed to send reboot: ${(error as Error).message}`,
			};
		}
	}

	// -------------------------------------------------------- inter-device RPC

	async handleRemoteCall(request: {
		methodName: string;
		args: unknown[];
		callDepth: number;
		scriptMeta: DeviceMeta;
	}): Promise<unknown> {
		// Use the live connection's meta when present (same script identity);
		// otherwise the bridge-provided meta lets a never-connected device
		// still serve RPC, matching the deployed-script source of truth.
		const meta = this.meta ?? request.scriptMeta;
		const worker = await this.getWorkerForMeta(meta);
		return runWithLogCapture(this, () =>
			worker.callMethod(request.methodName, request.args, request.callDepth),
		);
	}

	// ------------------------------------------------------------- watcher WS

	attachWatcher(
		ws: RuntimeSocket,
		options: { backfillLimit?: number; backfillLevel?: string },
	): void {
		this.watchers.add(ws);

		try {
			ws.send(
				JSON.stringify({
					event: "status",
					data: {
						connected: this.deviceWs !== null,
						connectedSince: this.deviceWs ? this.connectedSince : null,
					},
				}),
			);
		} catch (error) {
			logger.error(error, "Failed to send initial status to watcher");
		}

		// Optional log history backfill. Single scan per connect — never per
		// poll — so cost is bounded by reconnect rate, not client activity.
		if (options.backfillLimit !== undefined) {
			const limit = Number.isFinite(options.backfillLimit)
				? Math.min(Math.max(options.backfillLimit, 1), 100)
				: 0;
			if (limit > 0) {
				const level =
					options.backfillLevel &&
					VALID_LOG_LEVELS.includes(options.backfillLevel as LogLevel)
						? options.backfillLevel
						: undefined;
				try {
					const { logs } = fetchRecentLogs(this.deps.db, this.deviceId, {
						limit,
						level,
					});
					// Send oldest first so the client can append in display order.
					for (let i = logs.length - 1; i >= 0; i--) {
						ws.send(
							JSON.stringify({ event: "log", data: logs[i], replay: true }),
						);
					}
				} catch (error) {
					logger.error(error, "Watcher backfill failed");
				}
				ws.send(JSON.stringify({ event: "history_complete" }));
			}
		}
	}

	detachWatcher(ws: RuntimeSocket): void {
		this.watchers.delete(ws);
	}

	// ------------------------------------------------------------ logs + state

	persistLog(level: string, message: string): void {
		persistAndBroadcastLog(
			this.deps.db,
			this.deviceId,
			this.watchers,
			this.logStream,
			level,
			message,
		);
	}

	emitState(entityId: string, value: unknown): void {
		broadcastToWatchers(this.watchers, "state", {
			entity_id: entityId,
			value,
			source: "user",
		});
	}

	// ----------------------------------------------------------------- user KV

	async kvGet<T = unknown>(key: string): Promise<T | undefined> {
		if (key.startsWith(INTERNAL_KEY_PREFIX)) {
			throw new Error(`Key "${key}" is reserved for internal use`);
		}
		return this.internalKvGet<T>(key);
	}

	async kvPut<T>(key: string, value: T): Promise<void> {
		if (key.startsWith(INTERNAL_KEY_PREFIX)) {
			throw new Error(`Key "${key}" is reserved for internal use`);
		}
		this.internalKvPut(key, value);
	}

	async kvDelete(key: string): Promise<boolean> {
		// Deletes are idempotent — silently ignore reserved keys.
		if (key.startsWith(INTERNAL_KEY_PREFIX)) return false;
		const before = this.deps.db
			.query("SELECT 1 AS one FROM device_kv WHERE device_id = ?1 AND key = ?2")
			.get(this.deviceId, key);
		this.deps.db
			.query("DELETE FROM device_kv WHERE device_id = ?1 AND key = ?2")
			.run(this.deviceId, key);
		return before !== null;
	}

	private internalKvGet<T>(key: string): T | undefined {
		const row = this.deps.db
			.query("SELECT value FROM device_kv WHERE device_id = ?1 AND key = ?2")
			.get(this.deviceId, key) as { value: string | null } | null;
		if (!row || row.value === null) return undefined;
		try {
			return JSON.parse(row.value) as T;
		} catch {
			return undefined;
		}
	}

	private internalKvPut(key: string, value: unknown): void {
		this.deps.db
			.query(
				`INSERT INTO device_kv (device_id, key, value, updated_at)
				 VALUES (?1, ?2, ?3, ?4)
				 ON CONFLICT (device_id, key) DO UPDATE SET value = ?3, updated_at = ?4`,
			)
			.run(this.deviceId, key, JSON.stringify(value ?? null), Date.now());
	}

	private internalKvDelete(key: string): void {
		this.deps.db
			.query("DELETE FROM device_kv WHERE device_id = ?1 AND key = ?2")
			.run(this.deviceId, key);
	}

	// ------------------------------------------------------------------- crons

	/**
	 * Reads the user script's cron definitions, persists the schedule, and arms
	 * the timer. Called after onDeviceConnect. Preserves nextFireAt for
	 * unchanged entries so a reconnect doesn't push a near-due cron out by a
	 * full period; a fire time in the past (slot elapsed while offline) is
	 * recomputed to the next occurrence — missed slots are skipped, never
	 * caught up (documented contract).
	 */
	private async initializeCrons(worker: IUserDeviceWorker): Promise<void> {
		const crons = await worker.getCrons();

		if (!crons || Object.keys(crons).length === 0) {
			this.internalKvDelete(CRON_STORAGE_KEY);
			this.clearCronTimer();
			return;
		}

		const now = Date.now();
		const existing = this.internalKvGet<CronStorage>(CRON_STORAGE_KEY) ?? {};
		const storage: CronStorage = {};

		for (const [name, expr] of Object.entries(crons)) {
			try {
				const prev = existing[name];
				const nextFireAt =
					prev && prev.cron === expr && prev.nextFireAt > now
						? prev.nextFireAt
						: nextCronTime(expr, now);
				storage[name] = { cron: expr, nextFireAt };
			} catch (err) {
				logger.warn("Invalid cron expression", {
					name: name.slice(0, 64),
					error: (err as Error).message,
				});
			}
		}

		if (Object.keys(storage).length === 0) {
			this.internalKvDelete(CRON_STORAGE_KEY);
			this.clearCronTimer();
			return;
		}

		this.internalKvPut(CRON_STORAGE_KEY, storage);
		this.armCronTimer(earliestFireTime(storage));
	}

	/**
	 * Re-arm the cron timer from the persisted schedule, independent of the
	 * device_connected handshake (a transport-level reconnect may not re-send
	 * it). Past fire times are recomputed so missed slots are skipped.
	 */
	private rearmCronsFromStorage(): void {
		const schedules = this.internalKvGet<CronStorage>(CRON_STORAGE_KEY);
		if (!schedules || Object.keys(schedules).length === 0) return;

		const now = Date.now();
		let changed = false;
		for (const [name, entry] of Object.entries(schedules)) {
			if (entry.nextFireAt <= now) {
				try {
					schedules[name] = {
						cron: entry.cron,
						nextFireAt: nextCronTime(entry.cron, now),
					};
					changed = true;
				} catch {
					// Invalid expression — resolveDueCrons drops it on next fire.
				}
			}
		}
		if (changed) {
			this.internalKvPut(CRON_STORAGE_KEY, schedules);
		}
		this.armCronTimer(earliestFireTime(schedules));
	}

	private armCronTimer(target: number): void {
		this.clearCronTimer();
		if (!Number.isFinite(target)) return;
		const delay = Math.min(
			Math.max(target - Date.now(), 0),
			MAX_TIMER_DELAY_MS,
		);
		this.cronTimer = setTimeout(() => {
			this.cronTimer = null;
			if (Date.now() < target) {
				// Long-delay hop (target beyond the 32-bit timer ceiling).
				this.armCronTimer(target);
				return;
			}
			this.onCronTimerFire();
		}, delay);
	}

	private clearCronTimer(): void {
		if (this.cronTimer) {
			clearTimeout(this.cronTimer);
			this.cronTimer = null;
		}
	}

	private onCronTimerFire(): void {
		// Connection gate — disconnect cleared the timer, but guard anyway.
		if (!this.deviceWs) return;

		this.dispatch(async () => {
			const schedules = this.internalKvGet<CronStorage>(CRON_STORAGE_KEY);
			if (!schedules || Object.keys(schedules).length === 0) return;

			const worker = await this.getWorker();
			const now = Date.now();

			// Use the script's current cron definitions so added/removed/changed
			// crons apply without a reconnect; fall back to stored expressions.
			let currentCrons: Record<string, string>;
			try {
				currentCrons = await worker.getCrons();
				if (!currentCrons || Object.keys(currentCrons).length === 0) {
					currentCrons = Object.fromEntries(
						Object.entries(schedules).map(([name, e]) => [name, e.cron]),
					);
				}
			} catch {
				currentCrons = Object.fromEntries(
					Object.entries(schedules).map(([name, e]) => [name, e.cron]),
				);
			}

			let due: string[];
			let updated: CronStorage;
			try {
				({ due, updated } = resolveDueCrons(
					schedules,
					currentCrons,
					now,
					nextCronTime,
				));
			} catch (err) {
				// Invalid cron expression — reschedule without advancing so no
				// firings are permanently lost; the script can be redeployed.
				logger.error(err, "Error resolving due crons — rescheduling", {
					deviceId: this.deviceId,
				});
				this.armCronTimer(Math.max(now + 60_000, earliestFireTime(schedules)));
				return;
			}

			if (due.length > 0) {
				this.recordUsage({ cronFires: due.length });
			}

			for (const name of due) {
				try {
					await worker.onCron(name);
				} catch (error) {
					logger.error(error, "Error in user worker onCron", {
						cronName: name.slice(0, 64),
						deviceId: this.deviceId,
					});
				}
			}

			if (Object.keys(updated).length > 0) {
				this.internalKvPut(CRON_STORAGE_KEY, updated);
				this.armCronTimer(earliestFireTime(updated));
			} else {
				this.internalKvDelete(CRON_STORAGE_KEY);
			}
		}, "onCron");
	}
}
