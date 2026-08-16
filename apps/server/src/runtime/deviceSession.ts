import type { Database } from "bun:sqlite";
import type {
	CommandResponseTypeMap,
	DeviceCommand,
	DeviceResponse,
	DeviceType,
} from "@devicesdk/core";
import { DEVICE_TYPES } from "@devicesdk/core";
import { z } from "zod";
import {
	type LogLevel,
	VALID_LOG_LEVELS,
	WS_CLOSE_REPLACED,
} from "../foundation/consts";
import type { ServerLogger } from "../foundation/logger";
import { recordDeviceUsage } from "../foundation/usageMetrics";
import type { FsBlobStore } from "../storage/fsBlobStore";
import { runWithLogCapture } from "./consoleCapture";
import {
	CRON_STORAGE_KEY,
	type CronStorage,
	earliestFireTime,
	MAX_TIMER_DELAY_MS,
	resolveDueCrons,
} from "./cronDispatch";
import { nextCronTime } from "./cronParser";
import { DeviceKv } from "./deviceKv";
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
import type {
	DeviceMeta,
	IUserDeviceWorker,
	LogEntry,
	RuntimeSocket,
} from "./types";

const DeviceMessageSchema = z.object({
	id: z.string().max(64).optional().default(""),
	type: z.string().max(64),
	payload: z.record(z.string(), z.unknown()).optional().default({}),
});

// Payload of the `device_connected` handshake (firmware >= 0.2.0). Legacy
// firmware sends no payload at all - both fields stay optional so that path
// keeps working, and unknown extra fields are tolerated for forward compat.
const DeviceConnectedPayloadSchema = z
	.object({
		firmware_version: z
			.string()
			.max(32)
			.regex(/^\d+\.\d+\.\d+([-.+][0-9A-Za-z.-]+)?$/)
			.optional(),
		device_type: z.enum(DEVICE_TYPES).optional(),
	})
	.passthrough();

interface PendingCommand {
	resolve: (value: DeviceResponse) => void;
	reject: (reason?: unknown) => void;
	timeoutId: ReturnType<typeof setTimeout>;
}

export interface SessionDeps {
	db: Database;
	scripts: FsBlobStore;
	logger: ServerLogger;
	/** Inter-device RPC dispatcher bound to this session's project scope. */
	makeBridge: (meta: DeviceMeta) => BridgeFn;
	/** connected_seconds accrual interval; overridable for tests. */
	usageTickMs?: number;
}

/**
 * Live state and behavior for one device - the in-process replacement for the
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
 * Hibernation-API handlers - in-process we dispatch directly), daily message
 * limits, and Worker Loader stub lifecycle management. Handler ordering is
 * preserved by a per-session FIFO promise chain.
 *
 * Serialization contract: onDeviceConnect/onDeviceDisconnect/onMessage/onCron
 * run strictly one at a time per session, in arrival order, on the FIFO
 * dispatch chain. The one exception is handleRemoteCall (inter-device RPC):
 * it runs user code directly on the caller's promise chain instead of queueing
 * on the FIFO chain - deliberate, so a device whose handler is awaiting a
 * command response cannot deadlock an RPC targeting it. RPC invocations may
 * therefore interleave with queued event handlers.
 */
export class DeviceSession {
	private static readonly MAX_PENDING_COMMANDS = 100;
	private static readonly COMMAND_TIMEOUT_MS = 5000;
	/** How often connected_seconds accrues into the usage buckets. */
	private static readonly USAGE_TICK_MS = 60_000;

	readonly projectId: string;
	readonly deviceId: string;

	private deps: SessionDeps;
	private deviceWs: RuntimeSocket | null = null;
	private connectedSince: number | null = null;
	/** Timestamp of the last connected_seconds flush (delta accounting). */
	private lastUsageFlushAt = 0;
	private usageTick: ReturnType<typeof setInterval> | null = null;
	private meta: DeviceMeta | null = null;

	// Last-known firmware handshake values. device_type is sticky (once a
	// device reports it, it is kept), firmwareVersion is replaced by whatever
	// the latest payload says (null when absent).
	private firmwareInfo: {
		firmwareVersion: string | null;
		deviceType: DeviceType | null;
	} = { firmwareVersion: null, deviceType: null };

	private watchers = new Set<RuntimeSocket>();
	private pendingCommands = new Map<string, PendingCommand>();
	private logStream: LogStreamState = { logWriteCount: 0, lastLogCleanupAt: 0 };

	// FIFO chain serializing user-handler dispatch - preserves the ordering
	// guarantee the DO's alarm-drained event queue provided.
	private dispatchChain: Promise<void> = Promise.resolve();

	// Loaded user script, keyed by versionId (version-keyed bundle files make
	// staleness impossible; a deploy bumps versionId → reload).
	private worker: {
		versionId: string;
		instance: IUserDeviceWorker;
	} | null = null;

	// In-flight load promise, keyed by versionId, so concurrent callers (a
	// first device message racing an RPC) share one import + instantiation.
	private workerLoad: {
		versionId: string;
		promise: Promise<IUserDeviceWorker>;
	} | null = null;

	private cronTimer: ReturnType<typeof setTimeout> | null = null;

	/** Per-device KV storage with the reserved-key rules (deviceKv.ts). */
	private kv: DeviceKv;

	constructor(projectId: string, deviceId: string, deps: SessionDeps) {
		this.projectId = projectId;
		this.deviceId = deviceId;
		this.deps = deps;
		this.kv = new DeviceKv(deps.db, deviceId);
	}

	// ---------------------------------------------------------------- device WS

	handleDeviceOpen(ws: RuntimeSocket, meta: DeviceMeta): void {
		// Enforce a single live device session. A device that lost power can
		// leave a half-open socket; close it before accepting the replacement
		// so command dispatch never targets a dead connection.
		if (this.deviceWs && this.deviceWs !== ws) {
			// Finalize the outgoing socket before the onClose guard can ignore
			// it: pending commands must fail fast and usage must be accounted.
			this.finalizeOutgoingSocket("Replaced by a new device connection");
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
		this.lastUsageFlushAt = this.connectedSince;
		this.startUsageTick();

		this.deps.db
			.query(
				"UPDATE devices SET connected = 1, last_connected_at = ?1 WHERE id = ?2",
			)
			.run(this.connectedSince, this.deviceId);

		emitStatusEvent(this.watchers, this.buildStatusEvent());

		// Resume any persisted cron schedule now that a device socket is live
		// again (crons are connection-gated; missed slots are skipped, never
		// caught up). Handshake-independent, mirroring the DO's re-arm-on-accept.
		try {
			this.rearmCronsFromStorage();
		} catch (err) {
			this.deps.logger.warn("Cron re-arm on connect failed (degraded)", {
				deviceId: this.deviceId,
				error: (err as Error).message,
			});
		}
	}

	/**
	 * Parses the firmware handshake payload of a `device_connected` frame,
	 * persists the last-known values, and re-emits the status event so
	 * watchers see the firmware fields. Legacy firmware (no payload) and
	 * malformed payloads are tolerated: the session keeps working, and
	 * firmwareInfo stays untouched on validation failure.
	 */
	private applyDeviceConnectedPayload(message: DeviceResponse): void {
		// The DeviceConnected core type predates the handshake payload, but
		// DeviceMessageSchema already validated `payload` as an object at the
		// WS boundary - cast there and parse the raw fields.
		const payload =
			(message as DeviceResponse & { payload?: Record<string, unknown> })
				.payload ?? {};
		const payloadResult = DeviceConnectedPayloadSchema.safeParse(payload);
		if (!payloadResult.success) {
			this.deps.logger.warn("Invalid device_connected payload", {
				deviceId: this.deviceId,
				error: payloadResult.error.message,
			});
			return;
		}

		this.firmwareInfo.firmwareVersion =
			payloadResult.data.firmware_version ?? null;
		if (payloadResult.data.device_type) {
			this.firmwareInfo.deviceType = payloadResult.data.device_type;
		}

		try {
			this.deps.db
				.query(
					`UPDATE devices
					 SET firmware_version = ?1, device_type = COALESCE(?2, device_type), updated_at = ?3
					 WHERE id = ?4`,
				)
				.run(
					this.firmwareInfo.firmwareVersion,
					this.firmwareInfo.deviceType,
					Date.now(),
					this.deviceId,
				);
		} catch (err) {
			this.deps.logger.warn("firmware info write failed (degraded)", {
				deviceId: this.deviceId,
				error: (err as Error).message,
			});
		}

		emitStatusEvent(this.watchers, this.buildStatusEvent());
	}

	/** The status payload watchers receive on connect/disconnect/handshake. */
	private buildStatusEvent(): {
		connected: boolean;
		connectedSince: number | null;
		firmwareVersion: string | null;
		deviceType: string | null;
	} {
		return {
			connected: this.deviceWs !== null,
			connectedSince: this.connectedSince,
			firmwareVersion: this.firmwareInfo.firmwareVersion,
			deviceType: this.firmwareInfo.deviceType,
		};
	}

	handleDeviceMessage(ws: RuntimeSocket, data: string | ArrayBuffer): void {
		// Stale-socket guard: a replaced connection may still deliver a frame.
		if (ws !== this.deviceWs) return;

		if (typeof data !== "string") {
			this.deps.logger.warn("Received non-string WebSocket data, ignoring");
			return;
		}

		let parsed: ReturnType<typeof DeviceMessageSchema.safeParse>;
		try {
			parsed = DeviceMessageSchema.safeParse(JSON.parse(data));
		} catch (error) {
			this.deps.logger.error(error, "Failed to parse message from device", {
				data,
			});
			return;
		}
		if (!parsed.success) {
			this.deps.logger.warn("Invalid device message", {
				error: parsed.error.message,
			});
			return;
		}
		// Keepalive - never wakes user code (and never counts as usage).
		if (parsed.data.type === "ping") return;
		const message = parsed.data as DeviceResponse;

		this.recordUsage({
			messagesIn: 1,
			bytesIn: new TextEncoder().encode(data).length,
		});

		try {
			if (message.type === "device_connected") {
				this.applyDeviceConnectedPayload(message);
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
			this.deps.logger.error(error, "Failed to dispatch device message", {
				data,
			});
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

	private finalizeOutgoingSocket(reason: string): void {
		this.clearUsageTick();

		const connectedSince = this.connectedSince;
		if (connectedSince !== null) {
			// Final flush of the elapsed delta since the last tick. Delta-based
			// (not absolute) so sub-second carry never double-counts.
			const elapsed = Math.floor((Date.now() - this.lastUsageFlushAt) / 1000);
			if (elapsed > 0) {
				this.recordUsage({ connectedSeconds: elapsed });
			}
		}

		for (const [, command] of this.pendingCommands) {
			clearTimeout(command.timeoutId);
			command.reject(new Error(reason));
		}
		this.pendingCommands.clear();
	}

	/**
	 * Periodic connected_seconds accrual: flush the elapsed delta into the
	 * bucket current at tick time, so a long session spreads across buckets
	 * instead of dumping everything into the teardown bucket, and so the value
	 * survives a crash (it is persisted long before disconnect). The anchor
	 * advances by whole seconds only; the sub-second remainder carries over.
	 */
	private startUsageTick(): void {
		this.clearUsageTick();
		const sessionSince = this.connectedSince;
		this.usageTick = setInterval(() => {
			// Stale-callback guard: a tick from a previous connection that was
			// already queued when the session was replaced must not flush into
			// the new session.
			if (this.deviceWs === null || this.connectedSince !== sessionSince) {
				return;
			}
			const now = Date.now();
			const elapsed = Math.floor((now - this.lastUsageFlushAt) / 1000);
			if (elapsed <= 0) return;
			this.recordUsage({ connectedSeconds: elapsed });
			this.lastUsageFlushAt += elapsed * 1000;
		}, this.deps.usageTickMs ?? DeviceSession.USAGE_TICK_MS);
		this.usageTick.unref();
	}

	private clearUsageTick(): void {
		if (this.usageTick) {
			clearInterval(this.usageTick);
			this.usageTick = null;
		}
	}

	private handleConnectionLost(reason: string): void {
		this.finalizeOutgoingSocket(reason);
		this.deviceWs = null;
		this.connectedSince = null;

		// Cost/contract guard: crons only fire while a device is connected.
		// The schedule stays persisted; reconnect re-arms it.
		this.clearCronTimer();

		emitStatusEvent(this.watchers, this.buildStatusEvent());

		try {
			this.deps.db
				.query("UPDATE devices SET connected = 0 WHERE id = ?1")
				.run(this.deviceId);
		} catch (err) {
			this.deps.logger.warn("connected=0 write failed (degraded)", {
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
				this.deps.logger.error(error, `Error in user worker ${label}`, {
					deviceId: this.deviceId,
				});
			});
	}

	private async getWorker(): Promise<IUserDeviceWorker> {
		const meta = this.meta;
		if (!meta) {
			throw new Error("Device has not connected yet - no script metadata");
		}
		return this.getWorkerForMeta(meta);
	}

	private async getWorkerForMeta(meta: DeviceMeta): Promise<IUserDeviceWorker> {
		if (this.worker?.versionId === meta.versionId) {
			return this.worker.instance;
		}
		if (this.workerLoad?.versionId === meta.versionId) {
			return this.workerLoad.promise;
		}

		const scriptKey = `${meta.userId}/${meta.projectSlug}/${meta.deviceSlug}/${meta.versionId}.js`;
		const scriptPath = this.deps.scripts.filePath(scriptKey);

		const sender = new LocalDeviceSender(this);
		const promise = loadUserWorker({
			scriptPath,
			entrypointName: meta.entrypointName,
			sender,
			bridge: this.deps.makeBridge(meta),
			getEnvVars: () => this.readEnvVars(meta.projectId),
		}).then((instance) => {
			this.worker = { versionId: meta.versionId, instance };
			if (!this.meta) this.meta = meta;
			return instance;
		});
		this.workerLoad = { versionId: meta.versionId, promise };

		// Drop the memo once settled so a failed load can be retried; on
		// success this.worker supersedes it. Handle both paths explicitly so
		// no rejection is left unobserved.
		promise.then(
			() => {
				if (this.workerLoad?.versionId === meta.versionId) {
					this.workerLoad = null;
				}
			},
			() => {
				if (this.workerLoad?.versionId === meta.versionId) {
					this.workerLoad = null;
				}
			},
		);

		return promise;
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
		this.recordUsage({
			messagesOut: 1,
			bytesOut: new TextEncoder().encode(serialized).length,
		});
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
			});

			try {
				const serialized = JSON.stringify(command);
				this.deviceWs.send(serialized);
				this.recordUsage({
					messagesOut: 1,
					bytesOut: new TextEncoder().encode(serialized).length,
				});
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
		firmwareVersion: string | null;
		deviceType: string | null;
	}> {
		return {
			connected: this.deviceWs !== null,
			connectedSince: this.deviceWs ? this.connectedSince : null,
			firmwareVersion: this.firmwareInfo.firmwareVersion,
			deviceType: this.firmwareInfo.deviceType,
		};
	}

	/** Last-known firmware handshake values (used by the command sender). */
	getFirmwareInfo(): {
		firmwareVersion: string | null;
		deviceType: string | null;
	} {
		return this.firmwareInfo;
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
			// Don't close the WebSocket - the device reboots and the connection
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
		// Use the live connection's meta when present: a connected device keeps
		// executing the version pinned at its last connect until it reconnects
		// or reboots. Otherwise the bridge-provided meta lets a never-connected
		// device still serve RPC against its deployed script.
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
		// Fetch the backfill BEFORE registering the socket: a log persisted
		// between fetch and registration would otherwise be both replayed and
		// delivered live (double delivery). The tiny miss window is equivalent
		// to connecting moments later.
		let replayLogs: LogEntry[] = [];
		const wantBackfill = options.backfillLimit !== undefined;
		if (wantBackfill) {
			const limit =
				options.backfillLimit !== undefined &&
				Number.isFinite(options.backfillLimit)
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
					replayLogs = logs;
				} catch (error) {
					this.deps.logger.error(error, "Watcher backfill failed");
				}
			}
		}

		this.watchers.add(ws);

		// Registration through first-frame sends is one best-effort sequence:
		// a watcher that disconnects between registration and the replay makes
		// ws.send throw, and that must not escape attachWatcher (the watch
		// route's onOpen handler) or leave a dead socket registered. The
		// initial status, oldest-first replay, and the completion marker are
		// guarded together so a dead socket aborts mid-sequence and is
		// detached instead of erroring per-frame.
		try {
			ws.send(
				JSON.stringify({
					event: "status",
					data: this.buildStatusEvent(),
				}),
			);
			// Send oldest first so the client can append in display order.
			// Single scan per connect - never per poll - so cost is bounded by
			// reconnect rate, not client activity.
			for (let i = replayLogs.length - 1; i >= 0; i--) {
				ws.send(
					JSON.stringify({ event: "log", data: replayLogs[i], replay: true }),
				);
			}
			// The completion marker is part of the backfill contract: send it
			// whenever backfill was requested (even when clamped to 0 or the
			// scan failed) so clients never wait forever; clients infer
			// no-replay from the absence of the marker when no backfill was
			// requested.
			if (wantBackfill) {
				ws.send(JSON.stringify({ event: "history_complete" }));
			}
		} catch (error) {
			this.deps.logger.error(error, "Failed to send watcher frames");
			this.watchers.delete(ws);
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
		return this.kv.get<T>(key);
	}

	async kvPut<T>(key: string, value: T): Promise<void> {
		this.kv.put(key, value);
	}

	async kvDelete(key: string): Promise<boolean> {
		return this.kv.remove(key);
	}

	// ------------------------------------------------------------------- crons

	/**
	 * Reads the user script's cron definitions, persists the schedule, and arms
	 * the timer. Called after onDeviceConnect. Preserves nextFireAt for
	 * unchanged entries so a reconnect doesn't push a near-due cron out by a
	 * full period; a fire time in the past (slot elapsed while offline) is
	 * recomputed to the next occurrence - missed slots are skipped, never
	 * caught up (documented contract).
	 */
	private async initializeCrons(worker: IUserDeviceWorker): Promise<void> {
		const crons = await worker.getCrons();

		if (!crons || Object.keys(crons).length === 0) {
			this.kv.internalRemove(CRON_STORAGE_KEY);
			this.clearCronTimer();
			return;
		}

		const now = Date.now();
		const existing = this.kv.internalGet<CronStorage>(CRON_STORAGE_KEY) ?? {};
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
				this.deps.logger.warn("Invalid cron expression", {
					name: name.slice(0, 64),
					error: (err as Error).message,
				});
			}
		}

		if (Object.keys(storage).length === 0) {
			this.kv.internalRemove(CRON_STORAGE_KEY);
			this.clearCronTimer();
			return;
		}

		this.kv.internalPut(CRON_STORAGE_KEY, storage);
		this.armCronTimer(earliestFireTime(storage));
	}

	/**
	 * Re-arm the cron timer from the persisted schedule, independent of the
	 * device_connected handshake (a transport-level reconnect may not re-send
	 * it). Past fire times are recomputed so missed slots are skipped.
	 */
	private rearmCronsFromStorage(): void {
		const schedules = this.kv.internalGet<CronStorage>(CRON_STORAGE_KEY);
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
					// Invalid expression - resolveDueCrons drops it on next fire.
				}
			}
		}
		if (changed) {
			this.kv.internalPut(CRON_STORAGE_KEY, schedules);
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
		// Connection gate - disconnect cleared the timer, but guard anyway.
		if (!this.deviceWs) return;

		this.dispatch(async () => {
			// The timer may have fired while connected but only now reach the
			// front of the FIFO chain, after the device went offline. Re-check
			// here - the fire is skipped and the persisted schedule is left
			// stale so the reconnect path (rearmCronsFromStorage) recomputes
			// and skips the missed slot, never catching up.
			if (!this.deviceWs) return;

			const schedules = this.kv.internalGet<CronStorage>(CRON_STORAGE_KEY);
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
				// Invalid cron expression - reschedule without advancing so no
				// firings are permanently lost; the script can be redeployed.
				this.deps.logger.error(
					err,
					"Error resolving due crons - rescheduling",
					{
						deviceId: this.deviceId,
					},
				);
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
					this.deps.logger.error(error, "Error in user worker onCron", {
						cronName: name.slice(0, 64),
						deviceId: this.deviceId,
					});
				}
			}

			if (Object.keys(updated).length > 0) {
				this.kv.internalPut(CRON_STORAGE_KEY, updated);
				// Only re-arm while connected: a disconnect mid-dispatch must
				// not leave a live timer. The reconnect path re-arms from the
				// persisted schedule.
				if (!this.deviceWs) return;
				this.armCronTimer(earliestFireTime(updated));
			} else {
				this.kv.internalRemove(CRON_STORAGE_KEY);
			}
		}, "onCron");
	}
}
